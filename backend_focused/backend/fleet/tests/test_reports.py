"""Office summary, vehicles needing maintenance and mechanic workload.

The QuerySet methods take `today` as an argument, so boundary cases are tested with a
fixed date (records created through the ORM skip the "not in the future" validator).
The API tests only check the wiring: real dates, response shape and query count.
"""

from datetime import date, timedelta
from decimal import Decimal

from django.test import TestCase
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from fleet.models import Mechanic, Office, Vehicle

from .helpers import make_mechanic, make_office, make_record, make_vehicle

TODAY = date(2026, 6, 15)
WINDOW_START = date(2025, 6, 15)  # one_year_before(TODAY)


class OfficeSummaryQueryTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.office = make_office()
        busy = make_vehicle(cls.office)
        also_busy = make_vehicle(cls.office)
        retired = make_vehicle(cls.office, active=False)
        mechanic = make_mechanic()
        for vehicle, day, cost in [
            (busy, TODAY, "100.10"),
            (busy, TODAY - timedelta(days=10), "200.20"),
            (busy, TODAY - timedelta(days=20), "300.30"),
            (also_busy, WINDOW_START, "50.00"),  # first day of the window: included
            (also_busy, WINDOW_START - timedelta(days=1), "999.99"),  # one day too old: excluded
            (retired, TODAY - timedelta(days=1), "25.00"),  # inactive vehicles' work still counts
        ]:
            make_record(vehicle, mechanic, date=day, cost=Decimal(cost))
        cls.empty_office = make_office()

    def summary(self, office):
        return Office.objects.with_summary(TODAY).get(pk=office.pk)

    def test_counts_active_vehicles_without_join_fan_out(self):
        # 2 active vehicles with 5 records between them: a JOIN-based Count would say 5.
        self.assertEqual(self.summary(self.office).active_vehicle_count, 2)

    def test_cost_covers_exactly_the_last_12_months(self):
        self.assertEqual(self.summary(self.office).maintenance_cost_last_year, Decimal("675.60"))

    def test_last_maintenance_is_the_latest_record(self):
        self.assertEqual(self.summary(self.office).last_maintenance, TODAY)

    def test_office_without_vehicles_gets_zeros_not_nulls(self):
        summary = self.summary(self.empty_office)

        self.assertEqual(summary.active_vehicle_count, 0)
        self.assertEqual(summary.maintenance_cost_last_year, Decimal("0"))
        self.assertIsNone(summary.last_maintenance)


class OfficeSummaryApiTests(APITestCase):
    def test_returns_every_office_as_a_plain_list_in_one_query(self):
        today = timezone.localdate()
        alpha = make_office(name="Alpha")
        beta = make_office(name="Beta")
        vehicle = make_vehicle(alpha)
        make_record(vehicle, date=today, cost=Decimal("0.10"))
        make_record(vehicle, date=today, cost=Decimal("0.20"))

        with self.assertNumQueries(1):
            response = self.client.get(reverse("office-summary"))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(
            response.json(),
            [
                {
                    "id": alpha.pk,
                    "name": "Alpha",
                    "city": alpha.city,
                    "active_vehicle_count": 1,
                    "maintenance_cost_last_year": 0.3,  # not 0.30000000000000004
                    "last_maintenance": today.isoformat(),
                },
                {
                    "id": beta.pk,
                    "name": "Beta",
                    "city": beta.city,
                    "active_vehicle_count": 0,
                    "maintenance_cost_last_year": 0,
                    "last_maintenance": None,
                },
            ],
        )


class NeedingMaintenanceQueryTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        office = make_office()
        mechanic = make_mechanic()

        def last_serviced(days_ago, **fields):
            vehicle = make_vehicle(office, **fields)
            if days_ago is not None:
                make_record(vehicle, mechanic, date=TODAY - timedelta(days=days_ago))
            return vehicle

        cls.never_serviced = last_serviced(None)
        cls.also_never_serviced = last_serviced(None)
        cls.overdue_500_days = last_serviced(500)
        cls.overdue_366_days = last_serviced(366)
        last_serviced(365)  # exactly 365 days is not "more than 365 days": excluded
        last_serviced(10)
        last_serviced(None, active=False)
        old_then_recent = last_serviced(400)
        make_record(old_then_recent, mechanic, date=TODAY - timedelta(days=3))

    def test_returns_overdue_active_vehicles_never_serviced_first_then_oldest(self):
        result = list(Vehicle.objects.needing_maintenance(TODAY))

        self.assertEqual(
            result,
            [self.never_serviced, self.also_never_serviced, self.overdue_500_days, self.overdue_366_days],
        )
        self.assertIsNone(result[0].last_maintenance)
        self.assertEqual(result[2].last_maintenance, TODAY - timedelta(days=500))


class NeedingMaintenanceApiTests(APITestCase):
    def test_paginated_with_days_since_last_maintenance(self):
        today = timezone.localdate()
        never_serviced = make_vehicle()
        overdue = make_vehicle()
        make_record(overdue, date=today - timedelta(days=400))
        make_record(make_vehicle(), date=today)

        with self.assertNumQueries(2):  # COUNT + page
            response = self.client.get(reverse("vehicle-needing-maintenance"))

        self.assertEqual(response.data["count"], 2)
        never_row, overdue_row = response.data["results"]
        self.assertEqual((never_row["id"], overdue_row["id"]), (never_serviced.pk, overdue.pk))
        self.assertIsNone(never_row["last_maintenance"])
        self.assertIsNone(never_row["days_since_last_maintenance"])
        self.assertEqual(overdue_row["days_since_last_maintenance"], 400)


class MechanicWorkloadQueryTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        vehicle = make_vehicle()
        cls.busiest = make_mechanic(name="Busiest")
        cls.pricier = make_mechanic(name="Pricier")
        cls.cheaper = make_mechanic(name="Cheaper")
        cls.idle = make_mechanic(name="Idle")
        cls.retired = make_mechanic(name="Retired", active=False)

        def work(mechanic, day, cost):
            make_record(vehicle, mechanic, date=day, cost=Decimal(cost))

        for day in (date(2026, 1, 1), TODAY - timedelta(days=1), TODAY):
            work(cls.busiest, day, "10.00")
        work(cls.busiest, date(2025, 12, 31), "500.00")  # last year: excluded
        for _ in range(2):
            work(cls.pricier, TODAY, "300.00")
            work(cls.cheaper, TODAY, "100.00")
        work(cls.retired, date(2025, 12, 31), "50.00")

    def test_counts_this_calendar_year_busiest_first_with_ties_broken_by_cost(self):
        result = list(Mechanic.objects.with_workload(TODAY))

        self.assertEqual(result, [self.busiest, self.pricier, self.cheaper, self.idle, self.retired])
        self.assertEqual((result[0].maintenance_count, result[0].total_cost), (3, Decimal("30.00")))
        self.assertEqual((result[1].maintenance_count, result[1].total_cost), (2, Decimal("600.00")))

    def test_mechanics_without_work_this_year_appear_with_zeros(self):
        idle = Mechanic.objects.with_workload(TODAY).get(pk=self.idle.pk)

        self.assertEqual((idle.maintenance_count, idle.total_cost), (0, Decimal("0")))


class MechanicWorkloadApiTests(APITestCase):
    def test_plain_list_in_one_query_filterable_by_active(self):
        make_mechanic(name="Active")
        make_mechanic(name="Inactive", active=False)

        with self.assertNumQueries(1):
            response = self.client.get(reverse("mechanic-workload"))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.json()), 2)
        self.assertEqual(response.json()[0]["maintenance_count"], 0)
        self.assertEqual(response.json()[0]["total_cost"], 0)

        response = self.client.get(reverse("mechanic-workload"), {"active": "true"})
        self.assertEqual([row["name"] for row in response.json()], ["Active"])
