from datetime import timedelta
from io import StringIO

from django.core.management import CommandError, call_command
from django.db.models import Count
from django.test import TestCase
from django.utils import timezone

from fleet.models import MaintenanceRecord, Mechanic, Office, Vehicle

SMALL = {"offices": 4, "mechanics": 8, "vehicles": 40, "records": 400, "seed": 7}


class SeedFleetCommandTests(TestCase):
    def seed(self, **overrides):
        out = StringIO()
        call_command("seed_fleet", **{**SMALL, **overrides}, stdout=out)
        return out.getvalue()

    def snapshot(self):
        return (
            list(Vehicle.objects.order_by("id").values_list("vin", "license_plate", "make", "model", "year", "active")),
            list(MaintenanceRecord.objects.order_by("id").values_list("vehicle__vin", "date", "maintenance_type", "cost")),
        )

    def test_creates_the_requested_amounts_and_plants_each_scenario(self):
        self.seed()
        today = timezone.localdate()

        counts = [model.objects.count() for model in (Office, Mechanic, Vehicle, MaintenanceRecord)]
        self.assertEqual(counts, [4, 8, 40, 400])
        self.assertTrue(Office.objects.filter(vehicles__isnull=True).exists())

        needing = list(Vehicle.objects.needing_maintenance(today))
        self.assertTrue(any(vehicle.last_maintenance is None for vehicle in needing))
        self.assertTrue(any(vehicle.last_maintenance == today - timedelta(days=366) for vehicle in needing))
        serviced_365_days_ago = Vehicle.objects.with_last_maintenance().get(
            last_maintenance=today - timedelta(days=365)
        )
        self.assertNotIn(serviced_365_days_ago, needing)

        shared_plates = Vehicle.objects.values("license_plate").annotate(n=Count("id")).filter(n__gt=1)
        self.assertTrue(shared_plates.exists())

        workload = Mechanic.objects.with_workload(today)
        self.assertTrue(workload.filter(active=True, maintenance_count=0).exists())
        self.assertFalse(workload.filter(active=False, maintenance_count__gt=0).exists())

        longest = Vehicle.objects.annotate(n=Count("maintenance_records")).order_by("-n").first()
        self.assertEqual(longest.n, 40)  # records // 10 at this size

    def test_generated_data_passes_model_validation(self):
        # bulk_create skips validation, so check the generator respects the model rules.
        self.seed()

        for model in (Office, Mechanic, Vehicle, MaintenanceRecord):
            for obj in model.objects.all():
                with self.subTest(obj=obj):
                    obj.full_clean()

    def test_same_seed_gives_the_same_data(self):
        self.seed()
        first = self.snapshot()

        self.seed(clear=True)

        self.assertEqual(self.snapshot(), first)

    def test_refuses_to_overwrite_existing_data_without_clear(self):
        self.seed()

        with self.assertRaisesMessage(CommandError, "--clear"):
            self.seed(seed=8)

        self.assertEqual(Vehicle.objects.count(), 40)

    def test_invalid_sizes_are_rejected_without_writing_anything(self):
        for overrides in ({"vehicles": 5}, {"mechanics": 3}, {"records": 3}):
            with self.subTest(overrides=overrides):
                with self.assertRaises(CommandError):
                    self.seed(**overrides)
                self.assertFalse(Office.objects.exists())
