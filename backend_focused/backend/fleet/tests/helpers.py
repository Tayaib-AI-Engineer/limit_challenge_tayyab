"""Small builders for test data. Each call gets unique identifiers from a shared counter,
so tests only spell out the fields they are actually about."""

import itertools
from decimal import Decimal

from django.utils import timezone

from fleet.models import MaintenanceRecord, Mechanic, Office, Vehicle

_sequence = itertools.count(1)


def make_office(**fields):
    n = next(_sequence)
    return Office.objects.create(**{"name": f"Office {n}", "city": "Austin", **fields})


def make_vehicle(office=None, **fields):
    n = next(_sequence)
    defaults = {
        "vin": f"1HGCM82633A{n:06d}",
        "license_plate": f"TST-{n:04d}",
        "make": "Ford",
        "model": "Transit",
        "year": 2020,
    }
    return Vehicle.objects.create(office=office or make_office(), **{**defaults, **fields})


def make_mechanic(**fields):
    n = next(_sequence)
    return Mechanic.objects.create(**{"name": f"Mechanic {n}", "certification_number": f"ASE-{n:05d}", **fields})


def make_record(vehicle=None, mechanic=None, **fields):
    defaults = {
        "date": timezone.localdate(),
        "maintenance_type": MaintenanceRecord.MaintenanceType.OIL_CHANGE,
        "cost": Decimal("100.00"),
    }
    return MaintenanceRecord.objects.create(
        vehicle=vehicle or make_vehicle(),
        mechanic=mechanic or make_mechanic(),
        **{**defaults, **fields},
    )
