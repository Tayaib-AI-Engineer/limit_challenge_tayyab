"""Small builders for test data. Each call gets unique identifiers from a shared counter,
so tests only spell out the fields they are actually about."""

import itertools
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import override_settings
from django.utils import timezone
from rest_framework.test import APITestCase

from fleet.models import MaintenanceRecord, Mechanic, Office, Vehicle

_sequence = itertools.count(1)

# Real password hashing is deliberately slow; tests that set passwords don't need that.
fast_password_hashing = override_settings(PASSWORD_HASHERS=["django.contrib.auth.hashers.MD5PasswordHasher"])


class AuthenticatedAPITestCase(APITestCase):
    """Every endpoint requires a user, so API tests run logged in. force_authenticate
    attaches the user without a database lookup, which keeps assertNumQueries counts
    about the endpoint itself. Authentication is tested in test_auth_api."""

    def setUp(self):
        super().setUp()
        self.client.force_authenticate(get_user_model().objects.create_user(username="api-tester"))


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
