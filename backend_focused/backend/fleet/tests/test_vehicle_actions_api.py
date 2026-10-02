from datetime import timedelta

from django.db import connection
from django.test.utils import CaptureQueriesContext
from django.urls import reverse
from django.utils import timezone
from rest_framework import status

from .helpers import AuthenticatedAPITestCase, make_office, make_record, make_vehicle


class VehicleDetailApiTests(AuthenticatedAPITestCase):
    def test_includes_office_and_full_history_with_mechanics_newest_first(self):
        today = timezone.localdate()
        vehicle = make_vehicle()
        older = make_record(vehicle, date=today - timedelta(days=30))
        newer = make_record(vehicle, date=today)

        response = self.client.get(reverse("vehicle-detail", args=[vehicle.pk]))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        office = vehicle.office
        self.assertEqual(response.data["office"], {"id": office.pk, "name": office.name, "city": office.city})
        history = response.data["maintenance_records"]
        self.assertEqual([record["id"] for record in history], [newer.pk, older.pk])
        mechanic = newer.mechanic
        self.assertEqual(
            history[0]["mechanic"],
            {"id": mechanic.pk, "name": mechanic.name, "certification_number": mechanic.certification_number},
        )

    def test_query_count_does_not_grow_with_history_length(self):
        for record_count in (1, 40):
            with self.subTest(records=record_count):
                vehicle = make_vehicle()
                for _ in range(record_count):
                    make_record(vehicle)  # each with a different mechanic

                # Vehicle JOIN office, then records JOIN mechanic.
                with self.assertNumQueries(2):
                    response = self.client.get(reverse("vehicle-detail", args=[vehicle.pk]))

                self.assertEqual(len(response.data["maintenance_records"]), record_count)

    def test_unknown_vehicle_returns_404(self):
        response = self.client.get(reverse("vehicle-detail", args=[999_999]))

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)


class MaintenanceHistoryApiTests(AuthenticatedAPITestCase):
    def test_newest_first_paginated_and_limited_to_the_vehicle(self):
        today = timezone.localdate()
        vehicle = make_vehicle()
        same_day_first = make_record(vehicle, date=today)
        same_day_second = make_record(vehicle, date=today)
        older = make_record(vehicle, date=today - timedelta(days=1))
        make_record()  # another vehicle's record
        url = reverse("vehicle-maintenance-history", args=[vehicle.pk])

        with self.assertNumQueries(3):  # vehicle, COUNT, page
            first_page = self.client.get(url, {"page_size": 2})
        second_page = self.client.get(url, {"page_size": 2, "page": 2})

        self.assertEqual(first_page.data["count"], 3)
        self.assertEqual([r["id"] for r in first_page.data["results"]], [same_day_second.pk, same_day_first.pk])
        self.assertEqual([r["id"] for r in second_page.data["results"]], [older.pk])

    def test_unknown_vehicle_returns_404(self):
        response = self.client.get(reverse("vehicle-maintenance-history", args=[999_999]))

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)


class AssignOfficeApiTests(AuthenticatedAPITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.office = make_office()
        cls.new_office = make_office()
        cls.vehicle = make_vehicle(cls.office)

    def assign(self, payload, vehicle_pk=None):
        url = reverse("vehicle-assign-office", args=[vehicle_pk or self.vehicle.pk])
        with CaptureQueriesContext(connection) as queries:
            response = self.client.post(url, payload)
        updates = [query["sql"] for query in queries if query["sql"].startswith("UPDATE")]
        return response, updates

    def test_moves_the_vehicle_writing_only_the_office_column(self):
        response, updates = self.assign({"office": self.new_office.pk})

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["office"], self.new_office.pk)
        self.assertEqual(response.data["office_name"], self.new_office.name)
        self.assertEqual(len(updates), 1)
        self.assertRegex(updates[0], r'^UPDATE "fleet_vehicle" SET "office_id" = \S+ WHERE')
        self.vehicle.refresh_from_db()
        self.assertEqual(self.vehicle.office, self.new_office)

    def test_assigning_the_current_office_is_a_no_op(self):
        response, updates = self.assign({"office": self.office.pk})

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(updates, [])

    def test_missing_or_unknown_office_is_a_field_error(self):
        for payload in ({}, {"office": 999_999}, {"office": "abc"}):
            with self.subTest(payload=payload):
                response, updates = self.assign(payload)
                self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
                self.assertIn("office", response.data)
                self.assertEqual(updates, [])

    def test_unknown_vehicle_returns_404(self):
        response, _ = self.assign({"office": self.new_office.pk}, vehicle_pk=999_999)

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_only_post_is_allowed(self):
        response = self.client.get(reverse("vehicle-assign-office", args=[self.vehicle.pk]))

        self.assertEqual(response.status_code, status.HTTP_405_METHOD_NOT_ALLOWED)


class DuplicateCheckApiTests(AuthenticatedAPITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.vehicle = make_vehicle(license_plate="DUP-001")
        cls.other = make_vehicle(license_plate="DUP-002")
        cls.retired = make_vehicle(license_plate="OLD-001", active=False)

    def check(self, **params):
        return self.client.get(reverse("vehicle-duplicate-check"), params)

    def test_reports_each_conflicting_field_after_normalising_input(self):
        with self.assertNumQueries(1):
            response = self.check(vin=self.vehicle.vin.lower(), license_plate=" dup-002 ")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data, {"conflicts": ["vin", "license_plate"]})

    def test_no_conflicts(self):
        response = self.check(vin="2FTRX18W1XCA99999", license_plate="FREE-1")

        self.assertEqual(response.data, {"conflicts": []})

    def test_plate_held_only_by_an_inactive_vehicle_is_free(self):
        response = self.check(license_plate="OLD-001")

        self.assertEqual(response.data, {"conflicts": []})

    def test_exclude_id_ignores_the_vehicle_being_edited(self):
        response = self.check(vin=self.vehicle.vin, license_plate="DUP-001", exclude_id=self.vehicle.pk)

        self.assertEqual(response.data, {"conflicts": []})

    def test_inactive_vehicle_is_only_checked_for_its_vin(self):
        # Mirrors create: an inactive vehicle may reuse an active vehicle's plate.
        plate_only = self.check(license_plate="DUP-001", active="false")
        vin_and_plate = self.check(vin=self.vehicle.vin, license_plate="DUP-001", active="false")

        self.assertEqual(plate_only.data, {"conflicts": []})
        self.assertEqual(vin_and_plate.data, {"conflicts": ["vin"]})

    def test_invalid_parameters_are_rejected(self):
        for params in (
            {},
            {"vin": "", "license_plate": ""},
            {"vin": "X", "exclude_id": "abc"},
            {"vin": "X", "active": "maybe"},
        ):
            with self.subTest(params=params):
                response = self.check(**params)
                self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
