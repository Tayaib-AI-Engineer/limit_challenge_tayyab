from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from fleet.models import Mechanic, Office

from .helpers import make_mechanic, make_office, make_record, make_vehicle


class OfficeApiTests(APITestCase):
    def test_office_with_vehicles_cannot_be_deleted(self):
        office = make_office()
        make_vehicle(office)
        make_vehicle(office)

        response = self.client.delete(reverse("office-detail", args=[office.pk]))

        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(response.data["blocking_objects"], {"vehicles": 2})
        self.assertTrue(Office.objects.filter(pk=office.pk).exists())

    def test_empty_office_can_be_deleted(self):
        office = make_office()

        response = self.client.delete(reverse("office-detail", args=[office.pk]))

        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)

    def test_duplicate_office_name_is_rejected(self):
        office = make_office()

        response = self.client.post(reverse("office-list"), {"name": office.name, "city": "Dallas"})

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("name", response.data)

    def test_unknown_office_returns_404(self):
        response = self.client.get(reverse("office-detail", args=[999_999]))

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_axios_default_accept_header_gets_json(self):
        response = self.client.get(reverse("office-list"), HTTP_ACCEPT="application/json, text/plain, */*")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response["Content-Type"], "application/json")


class MechanicApiTests(APITestCase):
    def test_certification_number_is_normalised_and_unique(self):
        created = self.client.post(reverse("mechanic-list"), {"name": "Ann", "certification_number": " ase-777 "})
        duplicate = self.client.post(reverse("mechanic-list"), {"name": "Bob", "certification_number": "ASE-777"})

        self.assertEqual(created.status_code, status.HTTP_201_CREATED)
        self.assertEqual(created.data["certification_number"], "ASE-777")
        self.assertEqual(duplicate.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(
            duplicate.data["certification_number"], ["A mechanic with this certification number already exists."]
        )

    def test_mechanic_with_records_cannot_be_deleted(self):
        record = make_record()

        response = self.client.delete(reverse("mechanic-detail", args=[record.mechanic_id]))

        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(response.data["blocking_objects"], {"maintenance records": 1})
        self.assertTrue(Mechanic.objects.filter(pk=record.mechanic_id).exists())

    def test_list_can_be_filtered_by_active(self):
        make_mechanic()
        inactive = make_mechanic(active=False)

        response = self.client.get(reverse("mechanic-list"), {"active": "false"})

        self.assertEqual([row["id"] for row in response.data["results"]], [inactive.pk])
