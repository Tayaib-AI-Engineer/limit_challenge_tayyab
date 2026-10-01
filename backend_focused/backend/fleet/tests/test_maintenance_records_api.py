from datetime import timedelta

from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from .helpers import make_mechanic, make_record, make_vehicle


class MaintenanceRecordValidationTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.today = timezone.localdate()
        cls.vehicle = make_vehicle()
        cls.mechanic = make_mechanic()
        cls.inactive_mechanic = make_mechanic(active=False)

    def payload(self, **overrides):
        return {
            "vehicle": self.vehicle.pk,
            "mechanic": self.mechanic.pk,
            "date": self.today.isoformat(),
            "maintenance_type": "brake_service",
            "cost": "120.50",
            **overrides,
        }

    def test_create_returns_cost_as_a_json_number(self):
        response = self.client.post(reverse("maintenancerecord-list"), self.payload())

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        body = response.json()
        self.assertEqual(body["cost"], 120.5)
        self.assertEqual(body["vehicle_vin"], self.vehicle.vin)
        self.assertEqual(body["mechanic_name"], self.mechanic.name)

    def test_zero_cost_is_allowed(self):
        response = self.client.post(reverse("maintenancerecord-list"), self.payload(cost="0"))

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

    def test_invalid_values_are_rejected_with_field_errors(self):
        cases = [
            ("date", {"date": (self.today + timedelta(days=1)).isoformat()}),
            ("cost", {"cost": "-0.01"}),
            ("cost", {"cost": "123.456"}),  # more than 2 decimal places
            ("maintenance_type", {"maintenance_type": "car_wash"}),
            ("vehicle", {"vehicle": 999_999}),
        ]
        for field, overrides in cases:
            with self.subTest(overrides=overrides):
                response = self.client.post(reverse("maintenancerecord-list"), self.payload(**overrides))
                self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
                self.assertIn(field, response.data)

    def test_inactive_mechanic_cannot_be_assigned_to_a_new_record(self):
        response = self.client.post(
            reverse("maintenancerecord-list"), self.payload(mechanic=self.inactive_mechanic.pk)
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data["mechanic"], ["Inactive mechanics can't be assigned to maintenance records."])

    def test_record_stays_editable_after_its_mechanic_is_deactivated(self):
        mechanic = make_mechanic()
        record = make_record(self.vehicle, mechanic)
        mechanic.active = False
        mechanic.save()

        response = self.client.patch(
            reverse("maintenancerecord-detail", args=[record.pk]), {"mechanic": mechanic.pk, "cost": "80.00"}
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_record_cannot_be_reassigned_to_an_inactive_mechanic(self):
        record = make_record(self.vehicle, self.mechanic)

        response = self.client.patch(
            reverse("maintenancerecord-detail", args=[record.pk]), {"mechanic": self.inactive_mechanic.pk}
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)


class MaintenanceRecordListTests(APITestCase):
    def test_list_is_newest_first_and_query_count_is_constant(self):
        today = timezone.localdate()
        vehicle = make_vehicle()
        older = make_record(vehicle, date=today - timedelta(days=30))
        newer = make_record(vehicle, date=today)
        make_record()  # another vehicle, another mechanic

        # COUNT + one SELECT joining vehicle and mechanic.
        with self.assertNumQueries(2):
            response = self.client.get(reverse("maintenancerecord-list"))

        self.assertEqual(response.data["count"], 3)

        response = self.client.get(reverse("maintenancerecord-list"), {"vehicle": vehicle.pk})
        self.assertEqual([row["id"] for row in response.data["results"]], [newer.pk, older.pk])
