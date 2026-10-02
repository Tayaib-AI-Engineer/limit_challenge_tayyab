from django.urls import reverse
from django.utils import timezone
from rest_framework import status

from fleet.models import Vehicle

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
