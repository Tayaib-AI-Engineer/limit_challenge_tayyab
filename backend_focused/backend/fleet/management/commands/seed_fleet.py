"""Fill the database with realistic, reproducible fake fleet data for manual testing.

Besides bulk data, it plants the cases each endpoint is about, so they can be seen
without hunting for them: an office with no vehicles, vehicles never serviced or
overdue (including the 365/366-day boundary), inactive vehicles reusing an active
vehicle's plate, mechanics with no work this year, and one vehicle with a long history.
"""

import random
import time
from datetime import timedelta
from decimal import Decimal
from string import ascii_uppercase

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone
from faker import Faker

from fleet.models import MaintenanceRecord, Mechanic, Office, Vehicle

Type = MaintenanceRecord.MaintenanceType

# Faker has no vehicle make/model provider.
MAKES_AND_MODELS = {
    "Ford": ["F-150", "Transit", "Ranger", "Explorer"],
    "Toyota": ["Hilux", "Tacoma", "Camry", "RAV4"],
    "Chevrolet": ["Silverado", "Express", "Malibu"],
    "Ram": ["1500", "ProMaster"],
    "Honda": ["Civic", "Accord", "CR-V"],
    "Nissan": ["Frontier", "NV200", "Altima"],
    "Mercedes-Benz": ["Sprinter"],
    "Tesla": ["Model 3", "Model Y"],
}

# Relative frequency and cost range in whole dollars, per maintenance type.
MAINTENANCE_PROFILE = {
    Type.OIL_CHANGE: (30, 40, 120),
    Type.TIRE_ROTATION: (20, 25, 80),
    Type.INSPECTION: (15, 50, 150),
    Type.BRAKE_SERVICE: (12, 150, 600),
    Type.BATTERY: (8, 100, 300),
    Type.OTHER: (7, 20, 500),
    Type.ENGINE_REPAIR: (5, 500, 4000),
    Type.TRANSMISSION: (3, 1000, 5000),
}
MAINTENANCE_TYPES = list(MAINTENANCE_PROFILE)
MAINTENANCE_WEIGHTS = [weight for weight, _, _ in MAINTENANCE_PROFILE.values()]

HISTORY_DAYS = 3 * 365
LONG_HISTORY_RECORDS = 500
OVERDUE_AFTER_DAYS = 365
BATCH_SIZE = 1000  # SQLite caps it lower by itself (999 parameters per statement).

# Local development only: printed by the command and documented in the README.
DEMO_USERNAME = "demo"
DEMO_PASSWORD = "demo-password"


class Command(BaseCommand):
    help = "Fill the database with reproducible fake offices, vehicles, mechanics and maintenance records."

    def add_arguments(self, parser):
        parser.add_argument("--offices", type=int, default=12)
        parser.add_argument("--mechanics", type=int, default=40)
        parser.add_argument("--vehicles", type=int, default=2000)
        parser.add_argument("--records", type=int, default=50_000)
        parser.add_argument("--seed", type=int, default=42, help="Same seed and same day give the same data.")
        parser.add_argument("--clear", action="store_true", help="Delete all existing fleet data first.")

    def handle(self, *args, **options):
        for name, minimum in [("offices", 2), ("mechanics", 4), ("vehicles", 20)]:
            if options[name] < minimum:
                raise CommandError(f"--{name} must be at least {minimum}.")

        has_data = any(model.objects.exists() for model in (Office, Mechanic, Vehicle, MaintenanceRecord))
        if has_data and not options["clear"]:
            raise CommandError("The database already contains fleet data. Re-run with --clear to replace it.")

        started = time.monotonic()
        # All or nothing: a failure part-way leaves the previous data untouched.
        with transaction.atomic():
            if options["clear"]:
                # Children first: every foreign key is PROTECT.
                for model in (MaintenanceRecord, Vehicle, Mechanic, Office):
                    model.objects.all().delete()
            seeder = FleetSeeder(seed=options["seed"], today=timezone.localdate())
            seeder.run(
                offices=options["offices"],
                mechanics=options["mechanics"],
                vehicles=options["vehicles"],
                records=options["records"],
            )
            self.ensure_demo_user()
        self.report(seeder, options["seed"], time.monotonic() - started)

    def ensure_demo_user(self):
        """A known login for trying the API (JWT), the browsable API and the admin.
        Re-running the command resets its password, so the documented one always works."""
        user, _ = get_user_model().objects.get_or_create(username=DEMO_USERNAME)
        user.is_staff = user.is_superuser = True
        user.set_password(DEMO_PASSWORD)
        user.save()

    def report(self, seeder, seed, elapsed):
        s = seeder
        dates = [record.date for record in s.records]
        lines = [
            self.style.SUCCESS(f"Seeded fleet data (seed {seed}) in {elapsed:.1f}s:"),
            f"  {len(s.offices)} offices, including {s.empty_office.name!r} with no vehicles",
            f"  {len(s.mechanics)} mechanics: {len(s.inactive_mechanics)} inactive, "
            f"{len(s.idle_this_year) + 1} active with no work this year",
            f"  {len(s.vehicles)} vehicles: {len(s.inactive_vehicles)} inactive, "
            f"{len(s.plate_sharers)} of them reusing an active vehicle's plate",
            f"  {len(s.records)} maintenance records from {min(dates)} to {max(dates)}",
            "",
            f"Log in as {DEMO_USERNAME} / {DEMO_PASSWORD}: get an API token from POST /api/auth/token/,",
            "or use the same login for /admin/ and the browsable API.",
            "",
            "Worth a look:",
            f"  Long history ({s.long_history_count} records):   /api/vehicles/{s.long_history.pk}/  "
            f"(VIN {s.long_history.vin})",
            f"  Never serviced ({len(s.never_serviced)}) and overdue:   /api/vehicles/needing-maintenance/",
            f"  Serviced exactly 365 days ago (not overdue): VIN {s.serviced_365_days_ago.vin}",
            f"  Serviced exactly 366 days ago (overdue):     VIN {s.serviced_366_days_ago.vin}",
            f"  Plate {s.plate_sharers[0].license_plate} is on an active and an inactive vehicle: "
            f"/api/vehicles/duplicate-check/?license_plate={s.plate_sharers[0].license_plate}",
        ]
        self.stdout.write("\n".join(lines))


class FleetSeeder:
    def __init__(self, *, seed, today):
        # Faker keeps its own random generator: random.seed() would not seed it.
        self.fake = Faker("en_US")
        self.fake.seed_instance(seed)
        self.rng = random.Random(seed)
        self.today = today

    def days_ago(self, days):
        return self.today - timedelta(days=days)

    def run(self, *, offices, mechanics, vehicles, records):
        self.create_offices(offices)
        self.create_mechanics(mechanics)
        self.create_vehicles(vehicles)
        self.create_records(records)

    def create_offices(self, count):
        self.offices = []
        for _ in range(count):
            city = self.fake.unique.city()
            suffix = self.rng.choice(["Depot", "Yard", "Branch", "Hub"])
            self.offices.append(Office(name=f"{city} {suffix}", city=city))
        Office.objects.bulk_create(self.offices, batch_size=BATCH_SIZE)
        # The last office has just opened: no vehicles yet.
        self.empty_office = self.offices[-1]

    def create_mechanics(self, count):
        self.mechanics = [
            Mechanic(name=self.fake.name(), certification_number=self.fake.unique.bothify("ASE-#######"))
            for _ in range(count)
        ]
        inactive_count = max(1, count * 15 // 100)
        idle_count = max(1, count // 10)
        self.inactive_mechanics = self.mechanics[:inactive_count]  # left; old records only
        self.idle_this_year = self.mechanics[inactive_count : inactive_count + idle_count]  # no work since Jan 1
        self.new_hire = self.mechanics[inactive_count + idle_count]  # no records at all
        self.regular_mechanics = self.mechanics[inactive_count + idle_count + 1 :]
        for mechanic in self.inactive_mechanics:
            mechanic.active = False
        Mechanic.objects.bulk_create(self.mechanics, batch_size=BATCH_SIZE)

        # Who may have done work on a given day.
        self.this_year_start = self.today.replace(month=1, day=1)
        self.inactive_since = self.days_ago(400)
        self.mechanics_this_year = self.regular_mechanics
        self.mechanics_last_year = self.regular_mechanics + self.idle_this_year
        self.mechanics_long_ago = self.mechanics_last_year + self.inactive_mechanics

    def mechanic_for(self, day):
        if day >= self.this_year_start:
            return self.rng.choice(self.mechanics_this_year)
        if day >= self.inactive_since:
            return self.rng.choice(self.mechanics_last_year)
        return self.rng.choice(self.mechanics_long_ago)

    def create_vehicles(self, count):
        offices_with_vehicles = self.offices[:-1]
        self.vehicles = []
        for _ in range(count):
            make = self.rng.choice(list(MAKES_AND_MODELS))
            self.vehicles.append(
                Vehicle(
                    vin=self.fake.unique.vin(),
                    license_plate=self.fake.unique.bothify("???-####", letters=ascii_uppercase),
                    make=make,
                    model=self.rng.choice(MAKES_AND_MODELS[make]),
                    year=self.rng.randint(2008, self.today.year),
                    office=self.rng.choice(offices_with_vehicles),
                )
            )

        never_count = max(2, count * 3 // 100)
        overdue_count = max(2, count * 5 // 100)
        inactive_count = max(2, count * 8 // 100)
        rest = iter(self.vehicles[3:])
        self.long_history = self.vehicles[0]
        self.serviced_365_days_ago = self.vehicles[1]
        self.serviced_366_days_ago = self.vehicles[2]
        self.never_serviced = [next(rest) for _ in range(never_count)]
        self.overdue = [next(rest) for _ in range(overdue_count)]
        self.inactive_vehicles = [next(rest) for _ in range(inactive_count)]
        self.regular_vehicles = list(rest)

        for vehicle in self.inactive_vehicles:
            vehicle.active = False
        # Retired vehicles may share a plate with an active one; only active plates are unique.
        self.plate_sharers = self.inactive_vehicles[: max(1, inactive_count // 4)]
        # strict=False: there are fewer sharers than active vehicles; zip stops at the shorter.
        for sharer, active_vehicle in zip(self.plate_sharers, self.regular_vehicles, strict=False):
            sharer.license_plate = active_vehicle.license_plate

        Vehicle.objects.bulk_create(self.vehicles, batch_size=BATCH_SIZE)

    def create_records(self, total):
        self.records = []
        self.long_history_count = min(LONG_HISTORY_RECORDS, total // 10)
        for _ in range(self.long_history_count):
            self.add_record(self.long_history, self.rng.randrange(HISTORY_DAYS))

        # Last service exactly on either side of the 365-day threshold.
        for vehicle, last in [(self.serviced_365_days_ago, 365), (self.serviced_366_days_ago, 366)]:
            self.add_record(vehicle, last)
            self.add_record(vehicle, self.rng.randint(last + 1, HISTORY_DAYS - 1))

        for vehicle in self.overdue:
            for _ in range(self.rng.randint(1, 3)):
                self.add_record(vehicle, self.rng.randint(OVERDUE_AFTER_DAYS + 1, HISTORY_DAYS - 1))

        remaining = total - len(self.records)
        if remaining < 0:
            raise CommandError(f"--records must be at least {len(self.records)} for this many vehicles.")

        # Everything else is spread over active and retired vehicles; retired ones only
        # up to the day they were retired.
        retired_days_ago = {vehicle.pk: self.rng.randint(30, 700) for vehicle in self.inactive_vehicles}
        pool = self.regular_vehicles + self.inactive_vehicles
        for _ in range(remaining):
            vehicle = self.rng.choice(pool)
            self.add_record(vehicle, self.rng.randint(retired_days_ago.get(vehicle.pk, 0), HISTORY_DAYS - 1))

        MaintenanceRecord.objects.bulk_create(self.records, batch_size=BATCH_SIZE)

    def add_record(self, vehicle, days_ago):
        day = self.days_ago(days_ago)
        maintenance_type = self.rng.choices(MAINTENANCE_TYPES, weights=MAINTENANCE_WEIGHTS)[0]
        _, low, high = MAINTENANCE_PROFILE[maintenance_type]
        warranty = self.rng.random() < 0.02
        cost = Decimal("0.00") if warranty else Decimal(self.rng.randint(low * 100, high * 100)) / 100
        notes = "Covered by warranty." if warranty else (
            self.fake.sentence(nb_words=8) if self.rng.random() < 0.15 else ""
        )
        self.records.append(
            MaintenanceRecord(
                vehicle=vehicle,
                mechanic=self.mechanic_for(day),
                date=day,
                maintenance_type=maintenance_type,
                cost=cost,
                notes=notes,
            )
        )
