from decimal import Decimal

from django.core.validators import MinValueValidator
from django.db import models
from django.db.models import Q

from .validators import (
    validate_license_plate,
    validate_model_year,
    validate_not_in_future,
    validate_vin,
)


class UpperCaseCharField(models.CharField):
    """A CharField for identifiers (VIN, plate, certification number), stored stripped
    and upper-cased so that uniqueness can't be dodged with "abc123" vs "ABC123".

    Normalising in to_python() covers model.full_clean() (admin, forms). The API
    serializers normalise their own input before validation.
    """

    def to_python(self, value):
        value = super().to_python(value)
        return value.strip().upper() if isinstance(value, str) else value


class Office(models.Model):
    name = models.CharField(max_length=100, unique=True)
    city = models.CharField(max_length=100)

    def __str__(self):
        return self.name


class Vehicle(models.Model):
    vin = UpperCaseCharField(
        "VIN",
        max_length=17,
        unique=True,
        validators=[validate_vin],
        error_messages={"unique": "A vehicle with this VIN already exists."},
    )
    license_plate = UpperCaseCharField(max_length=10, validators=[validate_license_plate])
    make = models.CharField(max_length=50)
    model = models.CharField(max_length=50)
    year = models.PositiveSmallIntegerField(validators=[validate_model_year])
    # PROTECT: an office can't be deleted while vehicles are assigned to it.
    office = models.ForeignKey(Office, on_delete=models.PROTECT, related_name="vehicles")
    active = models.BooleanField(default=True)

    class Meta:
        constraints = [
            # A partial unique index: plates must be unique among *active* vehicles only,
            # so a retired vehicle's plate can be reissued. The database is the only
            # place this holds under concurrent writes.
            models.UniqueConstraint(
                fields=["license_plate"],
                condition=Q(active=True),
                name="uniq_active_license_plate",
                violation_error_message="Another active vehicle already uses this license plate.",
            ),
        ]

    def __str__(self):
        return f"{self.vin} ({self.license_plate})"


class Mechanic(models.Model):
    name = models.CharField(max_length=100)
    certification_number = UpperCaseCharField(
        max_length=30,
        unique=True,
        error_messages={"unique": "A mechanic with this certification number already exists."},
    )
    active = models.BooleanField(default=True)

    def __str__(self):
        return f"{self.name} ({self.certification_number})"


class MaintenanceRecord(models.Model):
    class MaintenanceType(models.TextChoices):
        OIL_CHANGE = "oil_change", "Oil change"
        TIRE_ROTATION = "tire_rotation", "Tire rotation"
        BRAKE_SERVICE = "brake_service", "Brake service"
        INSPECTION = "inspection", "Inspection"
        ENGINE_REPAIR = "engine_repair", "Engine repair"
        TRANSMISSION = "transmission", "Transmission"
        BATTERY = "battery", "Battery"
        OTHER = "other", "Other"

    # PROTECT on both foreign keys: records are the maintenance audit trail and feed the
    # cost reports, so deleting a vehicle or mechanic must not silently rewrite history.
    # db_index=False: the composite indexes below start with these columns, which makes
    # Django's automatic single-column foreign key indexes redundant write overhead.
    vehicle = models.ForeignKey(
        Vehicle, on_delete=models.PROTECT, related_name="maintenance_records", db_index=False
    )
    mechanic = models.ForeignKey(
        Mechanic, on_delete=models.PROTECT, related_name="maintenance_records", db_index=False
    )
    date = models.DateField(validators=[validate_not_in_future])
    maintenance_type = models.CharField(max_length=20, choices=MaintenanceType.choices)
    cost = models.DecimalField(
        max_digits=10, decimal_places=2, validators=[MinValueValidator(Decimal("0"))]
    )
    notes = models.TextField(blank=True)

    class Meta:
        indexes = [
            # Serves a vehicle's history (ORDER BY date DESC, id DESC by reading the
            # index backwards, no sort step), its latest maintenance date, and the
            # "any record since X" checks behind the reports.
            models.Index(fields=["vehicle", "date"], name="record_vehicle_date_idx"),
            # Serves the per-mechanic date range in the workload report.
            models.Index(fields=["mechanic", "date"], name="record_mechanic_date_idx"),
        ]
        constraints = [
            # Zero is allowed (e.g. warranty work); negative costs are not.
            models.CheckConstraint(condition=Q(cost__gte=0), name="record_cost_non_negative"),
        ]

    def __str__(self):
        return f"{self.get_maintenance_type_display()} on {self.date} for vehicle {self.vehicle_id}"
