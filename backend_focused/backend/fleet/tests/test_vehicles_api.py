from django.db import connection
from django.test.utils import CaptureQueriesContext
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.exceptions import NotFound

from fleet.models import Vehicle
from fleet.serializers import VehicleSerializer

from .helpers import AuthenticatedAPITestCase, make_office, make_record, make_vehicle

PLATE_TAKEN = ["Another active vehicle already uses this license plate."]


class VehicleValidationTests(AuthenticatedAPITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.office = make_office()
        cls.other_office = make_office()
        cls.active = make_vehicle(cls.office, license_plate="ABC-123")
        # A retired vehicle may share a plate with an active one.
        cls.retired = make_vehicle(cls.office, license_plate="ABC-123", active=False)

    def payload(self, **overrides):
        return {
            "vin": "2FTRX18W1XCA00001",
            "license_plate": "NEW-001",
            "make": "Toyota",
            "model": "Hilux",
            "year": 2022,
            "office": self.office.pk,
            **overrides,
        }

    def detail_url(self, vehicle):
        return reverse("vehicle-detail", args=[vehicle.pk])

    def test_create_normalises_identifiers(self):
        response = self.client.post(
            reverse("vehicle-list"), self.payload(vin=" 2ftrx18w1xca00001 ", license_plate=" xyz 789 ")
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["vin"], "2FTRX18W1XCA00001")
        self.assertEqual(response.data["license_plate"], "XYZ 789")
        self.assertEqual(response.data["office_name"], self.office.name)

    def test_duplicate_vin_in_another_case_is_rejected(self):
        response = self.client.post(reverse("vehicle-list"), self.payload(vin=self.active.vin.lower()))

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data["vin"], ["A vehicle with this VIN already exists."])

    def test_plate_used_by_an_active_vehicle_is_rejected(self):
        response = self.client.post(reverse("vehicle-list"), self.payload(license_plate="abc-123"))

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data["license_plate"], PLATE_TAKEN)

    def test_inactive_vehicle_may_reuse_an_active_plate(self):
        response = self.client.post(reverse("vehicle-list"), self.payload(license_plate="ABC-123", active=False))

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

    def test_reactivating_into_a_taken_plate_returns_400_not_500(self):
        # The PATCH doesn't mention the plate, so a field-level validator would never run.
        response = self.client.patch(self.detail_url(self.retired), {"active": True})

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data["license_plate"], PLATE_TAKEN)
        self.retired.refresh_from_db()
        self.assertFalse(self.retired.active)

    def test_inactive_duplicate_can_still_be_edited(self):
        response = self.client.patch(self.detail_url(self.retired), {"make": "Volvo"})

        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_full_update_keeps_the_vehicles_own_plate(self):
        response = self.client.put(
            self.detail_url(self.active),
            self.payload(vin=self.active.vin, license_plate=self.active.license_plate, make="Chevrolet"),
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["make"], "Chevrolet")

    def test_invalid_values_are_rejected_with_field_errors(self):
        latest_year = timezone.localdate().year + 1
        cases = [
            ("vin", {"vin": "1HGCM82633A00435O"}),  # letter O is never used in a VIN
            ("vin", {"vin": "TOO-SHORT"}),
            ("license_plate", {"license_plate": "AB*123"}),
            ("year", {"year": 1980}),
            ("year", {"year": latest_year + 1}),
            ("office", {"office": 999_999}),
        ]
        for field, overrides in cases:
            with self.subTest(overrides=overrides):
                response = self.client.post(reverse("vehicle-list"), self.payload(**overrides))
                self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
                self.assertIn(field, response.data)

    def test_office_cannot_be_changed_through_update(self):
        response = self.client.patch(self.detail_url(self.active), {"office": self.other_office.pk})

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("assign-office", str(response.data["office"]))

    def test_sending_the_current_office_on_update_is_allowed(self):
        response = self.client.patch(self.detail_url(self.active), {"office": self.office.pk, "make": "GMC"})

        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_put_may_leave_out_the_office(self):
        payload = self.payload(vin=self.active.vin, license_plate=self.active.license_plate)
        del payload["office"]

        response = self.client.put(self.detail_url(self.active), payload)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["office"], self.office.pk)

    def test_plate_spacing_variants_are_the_same_plate_or_invalid(self):
        make_vehicle(self.office, license_plate="KLM 123")

        extra_spaces = self.client.post(reverse("vehicle-list"), self.payload(license_plate=" klm   123 "))
        spaced_hyphen = self.client.post(reverse("vehicle-list"), self.payload(license_plate="KLM - 123"))

        self.assertEqual(extra_spaces.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(extra_spaces.data["license_plate"], PLATE_TAKEN)
        self.assertEqual(spaced_hyphen.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertNotEqual(spaced_hyphen.data["license_plate"], PLATE_TAKEN)  # a format error

    def test_detail_routes_ignore_list_filters(self):
        vehicle = make_vehicle(self.office)  # active, no maintenance history
        url = self.detail_url(vehicle)

        self.assertEqual(self.client.get(url, {"active": "false"}).status_code, status.HTTP_200_OK)
        self.assertEqual(self.client.patch(f"{url}?make=nomatch", {"model": "X5"}).status_code, status.HTTP_200_OK)
        self.assertEqual(self.client.delete(f"{url}?office=999999").status_code, status.HTTP_204_NO_CONTENT)


class VehicleUpdateWriteTests(AuthenticatedAPITestCase):
    """An update writes only the columns it was given."""

    @classmethod
    def setUpTestData(cls):
        cls.office = make_office()
        cls.other_office = make_office()

    def test_patch_updates_only_the_submitted_column(self):
        vehicle = make_vehicle(self.office)

        with CaptureQueriesContext(connection) as queries:
            response = self.client.patch(reverse("vehicle-detail", args=[vehicle.pk]), {"make": "Volvo"})

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        updates = [query["sql"] for query in queries if query["sql"].startswith("UPDATE")]
        self.assertEqual(len(updates), 1)
        self.assertRegex(updates[0], r'^UPDATE "fleet_vehicle" SET "make" = \S+ WHERE')

    def test_update_does_not_revert_a_concurrent_office_move(self):
        vehicle = make_vehicle(self.office)
        stale = Vehicle.objects.get(pk=vehicle.pk)  # request A reads the vehicle
        Vehicle.objects.filter(pk=vehicle.pk).update(office=self.other_office)  # request B moves it

        serializer = VehicleSerializer(stale, data={"make": "Volvo"}, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()  # request A saves its edit

        vehicle.refresh_from_db()
        self.assertEqual((vehicle.make, vehicle.office), ("Volvo", self.other_office))

    def test_update_of_a_vehicle_deleted_meanwhile_is_404_not_a_resurrection(self):
        vehicle = make_vehicle(self.office)
        stale = Vehicle.objects.get(pk=vehicle.pk)
        Vehicle.objects.filter(pk=vehicle.pk).delete()

        serializer = VehicleSerializer(stale, data={"make": "Volvo"}, partial=True)
        serializer.is_valid(raise_exception=True)
        with self.assertRaises(NotFound):
            serializer.save()

        self.assertFalse(Vehicle.objects.filter(pk=vehicle.pk).exists())


class VehicleDeleteTests(AuthenticatedAPITestCase):
    def test_vehicle_with_maintenance_history_cannot_be_deleted(self):
        record = make_record()

        response = self.client.delete(reverse("vehicle-detail", args=[record.vehicle_id]))

        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(response.data["blocking_objects"], {"maintenance records": 1})
        self.assertTrue(Vehicle.objects.filter(pk=record.vehicle_id).exists())

    def test_vehicle_without_history_can_be_deleted(self):
        vehicle = make_vehicle()

        response = self.client.delete(reverse("vehicle-detail", args=[vehicle.pk]))

        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)


class VehicleListTests(AuthenticatedAPITestCase):
    def test_list_query_count_does_not_grow_with_rows(self):
        for _ in range(5):
            make_vehicle()  # each in its own office

        # One COUNT for pagination, one SELECT joining office: no query per vehicle.
        with self.assertNumQueries(2):
            response = self.client.get(reverse("vehicle-list"))

        self.assertEqual(response.data["count"], 5)
        self.assertTrue(all(row["office_name"] for row in response.data["results"]))
