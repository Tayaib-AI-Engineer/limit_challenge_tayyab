"""Rules enforced below the API, so the Django admin (and any other ModelForm) can't
bypass them."""

from decimal import Decimal

from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.test import TestCase
from django.urls import reverse
from django.utils import timezone

from fleet.models import MaintenanceRecord

from .helpers import make_mechanic, make_record, make_vehicle


class MaintenanceRecordCleanTests(TestCase):
    def test_new_record_with_an_inactive_mechanic_is_invalid(self):
        record = MaintenanceRecord(
            vehicle=make_vehicle(),
            mechanic=make_mechanic(active=False),
            date=timezone.localdate(),
            maintenance_type=MaintenanceRecord.MaintenanceType.INSPECTION,
            cost=Decimal("50.00"),
        )

        with self.assertRaises(ValidationError) as raised:
            record.full_clean()

        self.assertIn("mechanic", raised.exception.message_dict)

    def test_existing_record_keeps_its_now_inactive_mechanic(self):
        record = make_record()
        record.mechanic.active = False
        record.mechanic.save()

        record.cost = Decimal("75.00")
        record.full_clean()  # no error: the mechanic isn't being changed

    def test_existing_record_cannot_switch_to_an_inactive_mechanic(self):
        record = make_record()
        record.mechanic = make_mechanic(active=False)

        with self.assertRaises(ValidationError):
            record.full_clean()


class VehicleAdminTests(TestCase):
    def setUp(self):
        self.client.force_login(get_user_model().objects.create_superuser("admin-tester", "a@example.com", None))

    def test_office_is_read_only_when_editing_a_vehicle(self):
        vehicle = make_vehicle()

        change_page = self.client.get(reverse("admin:fleet_vehicle_change", args=[vehicle.pk]))
        add_page = self.client.get(reverse("admin:fleet_vehicle_add"))

        self.assertEqual(change_page.status_code, 200)
        self.assertNotContains(change_page, 'name="office"')
        self.assertContains(add_page, 'name="office"')
