from datetime import date

from django.urls import reverse
from rest_framework import status

from .helpers import AuthenticatedAPITestCase, make_mechanic, make_office, make_record, make_vehicle


class VehicleSearchApiTests(AuthenticatedAPITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.office_a = make_office()
        cls.office_b = make_office()
        x = make_mechanic(certification_number="ASE-X")
        y = make_mechanic(certification_number="ASE-Y")

        # Serviced by X in January and by Y in March.
        cls.ford = make_vehicle(cls.office_a, make="Ford", model="F-150")
        make_record(cls.ford, x, date=date(2026, 1, 10))
        make_record(cls.ford, y, date=date(2026, 3, 10))

        cls.toyota = make_vehicle(cls.office_b, make="Toyota", model="Hilux")
        make_record(cls.toyota, x, date=date(2026, 3, 15))

        # Serviced before and after February, never during it.
        cls.ram = make_vehicle(cls.office_b, make="Ram", model="1500")
        make_record(cls.ram, y, date=date(2025, 12, 1))
        make_record(cls.ram, y, date=date(2026, 5, 1))

        cls.retired = make_vehicle(cls.office_b, make="Ford", model="Transit", active=False)

    def search(self, **params):
        return self.client.get(reverse("vehicle-list"), params)

    def ids(self, response):
        return [row["id"] for row in response.data["results"]]

    def assert_finds(self, params, expected):
        response = self.search(**params)
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(self.ids(response), [vehicle.pk for vehicle in expected])
        self.assertEqual(response.data["count"], len(expected))

    def test_vehicle_columns(self):
        cases = [
            ({"office": self.office_a.pk}, [self.ford]),
            ({"active": "false"}, [self.retired]),
            ({"make": "ford"}, [self.ford, self.retired]),  # case-insensitive
            ({"model": "HILUX"}, [self.toyota]),
            ({"make": "Ford", "active": "true"}, [self.ford]),
            ({"active": "FALSE"}, [self.retired]),
            ({"active": "0"}, [self.retired]),
        ]
        for params, expected in cases:
            with self.subTest(params=params):
                self.assert_finds(params, expected)

    def test_maintenance_date_range(self):
        cases = [
            ({"maintenance_from": "2026-03-01", "maintenance_to": "2026-03-31"}, [self.ford, self.toyota]),
            # One bound only.
            ({"maintenance_from": "2026-03-12"}, [self.toyota, self.ram]),
            ({"maintenance_to": "2026-01-31"}, [self.ford, self.ram]),
            # Both bounds are inclusive.
            ({"maintenance_from": "2026-03-15", "maintenance_to": "2026-03-15"}, [self.toyota]),
        ]
        for params, expected in cases:
            with self.subTest(params=params):
                self.assert_finds(params, expected)

    def test_date_bounds_must_be_met_by_the_same_record(self):
        # The Ram has a record before February and one after it: each bound is met by
        # some record, but no record falls inside the window.
        self.assert_finds({"maintenance_from": "2026-02-01", "maintenance_to": "2026-02-28"}, [])

    def test_mechanic_and_dates_must_be_met_by_the_same_record(self):
        # X serviced the Ford in January, not in March: only the Toyota matches.
        self.assert_finds(
            {"mechanic_certification": "ASE-X", "maintenance_from": "2026-03-01", "maintenance_to": "2026-03-31"},
            [self.toyota],
        )

    def test_mechanic_certification_is_case_insensitive(self):
        self.assert_finds({"mechanic_certification": " ase-y "}, [self.ford, self.ram])

    def test_vehicle_and_maintenance_filters_combine(self):
        self.assert_finds({"office": self.office_b.pk, "mechanic_certification": "ASE-X"}, [self.toyota])

    def test_vehicle_with_several_matching_records_is_listed_once(self):
        # The Ford has two records in 2026.
        self.assert_finds(
            {"maintenance_from": "2026-01-01", "maintenance_to": "2026-12-31"}, [self.ford, self.toyota, self.ram]
        )

    def test_query_count_is_constant(self):
        # COUNT + page; the record conditions run as a subquery inside each.
        with self.assertNumQueries(2):
            self.search(maintenance_from="2026-01-01", mechanic_certification="ASE-Y")

    def test_invalid_parameters_are_400_with_field_errors(self):
        cases = [
            ("maintenance_from", {"maintenance_from": "not-a-date"}),
            ("maintenance_to", {"maintenance_from": "2026-03-31", "maintenance_to": "2026-03-01"}),
            ("office", {"office": 999_999}),
            # Unrecognised booleans used to be ignored, returning every vehicle.
            ("active", {"active": "maybe"}),
            # Oversized text used to reach SQLite's LIKE limit as a 500.
            ("make", {"make": "a" * 50_001}),
            ("mechanic_certification", {"mechanic_certification": "A" * 31}),
        ]
        for field, params in cases:
            with self.subTest(params=params):
                response = self.search(**params)
                self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
                self.assertIn(field, response.data)
