from datetime import timedelta
from decimal import Decimal

from django.core.exceptions import ValidationError
from django.core.validators import MinValueValidator
from django.db import models
from django.db.models import Count, Exists, F, Max, OuterRef, Prefetch, Q, Subquery, Sum, Value
from django.db.models.functions import Coalesce

from .dates import one_year_before
from .validators import (
    validate_license_plate,
    validate_mechanic_assignment,
    validate_model_year,
    validate_not_in_future,
    validate_vin,
)


def normalize_identifier(value):
    """Upper-case, trim, and collapse inner whitespace: " klm  123 " -> "KLM 123"."""
    return " ".join(value.split()).upper()


class UpperCaseCharField(models.CharField):
    """A CharField for identifiers (VIN, plate, certification number), stored normalised
    so that uniqueness can't be dodged with "abc123" vs "ABC123" or "KLM  123".

    CharField.get_prep_value() calls to_python(), so this covers every ORM write
    (including bulk_create), every exact lookup, and model.full_clean() in the admin.
    """

    def to_python(self, value):
        value = super().to_python(value)
        return normalize_identifier(value) if isinstance(value, str) else value


class OfficeQuerySet(models.QuerySet):
    def with_summary(self, today):
        """Annotate active_vehicle_count, maintenance_cost_last_year (records dated from
        the same day last year up to today) and last_maintenance.

        Each figure is a correlated subquery over its own table. Annotating Count and Sum
        across office -> vehicles -> records in one GROUP BY repeats every vehicle once
        per record and inflates the count (measured 5,444 instead of 200). Subqueries
        can't fan out by construction, and need no outer GROUP BY.

        Records count towards the vehicle's *current* office, including records of
        inactive vehicles; only the vehicle count is limited to active vehicles.
        """
        active_vehicles = (
            Vehicle.objects.filter(office=OuterRef("pk"), active=True)
            .order_by()
            .values("office")
            .annotate(count=Count("pk"))
            .values("count")
        )
        office_records = (
            MaintenanceRecord.objects.filter(vehicle__office=OuterRef("pk")).order_by().values("vehicle__office")
        )
        cost_last_year = (
            office_records.filter(date__range=(one_year_before(today), today))
            .annotate(total=Sum("cost"))
            .values("total")
        )
        latest_date = office_records.annotate(latest=Max("date")).values("latest")

        return self.annotate(
            active_vehicle_count=Coalesce(Subquery(active_vehicles), 0),
            maintenance_cost_last_year=Coalesce(
                Subquery(cost_last_year),
                Value(Decimal("0")),
                output_field=models.DecimalField(max_digits=14, decimal_places=2),
            ),
            last_maintenance=Subquery(latest_date),
        )


class Office(models.Model):
    name = models.CharField(max_length=100, unique=True)
    city = models.CharField(max_length=100)

    objects = OfficeQuerySet.as_manager()

    def __str__(self):
        return self.name


class VehicleQuerySet(models.QuerySet):
    def conflicts(self, *, vin=None, license_plate=None, exclude_pk=None):
        """Names of the fields that would clash with an existing vehicle, in one query.

        The VIN must be unique across all vehicles; the plate only among active ones
        (mirroring the uniq_active_license_plate constraint). Values must already be
        normalised. exclude_pk skips the vehicle being edited.
        """
        lookup = Q()
        if vin:
            lookup |= Q(vin=vin)
        if license_plate:
            lookup |= Q(license_plate=license_plate, active=True)
        if not lookup:
            return []

        clashes = self.filter(lookup)
        if exclude_pk is not None:
            clashes = clashes.exclude(pk=exclude_pk)

        found = set()
        for other_vin, other_plate, other_active in clashes.values_list("vin", "license_plate", "active"):
            if vin and other_vin == vin:
                found.add("vin")
            if license_plate and other_active and other_plate == license_plate:
                found.add("license_plate")
        return [field for field in ("vin", "license_plate") if field in found]

    def with_detail(self):
        """Prefetch the office and the full maintenance history, each record with its
        mechanic: 2 queries however long the history is (503 without this, for a
        vehicle with 500 records).

        select_related can only JOIN single-valued relations (vehicle -> office,
        record -> mechanic), so the one-to-many history needs prefetch_related. The
        custom Prefetch queryset folds the mechanic into the records query (2 queries
        rather than 3) and sorts newest first in SQL.
        """
        history = MaintenanceRecord.objects.select_related("mechanic").order_by("-date", "-id")
        return self.select_related("office").prefetch_related(Prefetch("maintenance_records", queryset=history))

    def with_last_maintenance(self):
        latest = MaintenanceRecord.objects.filter(vehicle=OuterRef("pk")).order_by("-date").values("date")[:1]
        return self.annotate(last_maintenance=Subquery(latest))

    def needing_maintenance(self, today):
        """Active vehicles never serviced, or last serviced more than 365 days ago,
        oldest maintenance first (never-serviced vehicles first of all).

        "No record in the last 365 days" is a NOT EXISTS probe that stops at the first
        recent record via the (vehicle, date) index, instead of aggregating every
        record of every vehicle and discarding most of them in HAVING (3-5x slower).
        A record exactly 365 days old does not make a vehicle overdue.
        """
        recent = MaintenanceRecord.objects.filter(vehicle=OuterRef("pk"), date__gte=today - timedelta(days=365))
        return (
            self.filter(active=True)
            .filter(~Exists(recent))
            .with_last_maintenance()
            # Explicit: SQLite sorts NULLs first ascending, PostgreSQL sorts them last.
            .order_by(F("last_maintenance").asc(nulls_first=True), "id")
        )


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

    objects = VehicleQuerySet.as_manager()

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


class MechanicQuerySet(models.QuerySet):
    def with_workload(self, today):
        """Annotate maintenance_count and total_cost for work done this calendar year up
        to today, busiest first. Mechanics with no work this year are kept, with 0.

        A plain JOIN + GROUP BY is safe here: there is only one one-to-many relation
        (mechanic -> records), so no row fan-out. The date range sits in the aggregate
        FILTER rather than in .filter(): a WHERE clause would turn the LEFT JOIN into an
        inner join and drop idle mechanics.
        """
        this_year = Q(maintenance_records__date__range=(today.replace(month=1, day=1), today))
        return self.annotate(
            maintenance_count=Count("maintenance_records", filter=this_year),
            total_cost=Sum("maintenance_records__cost", filter=this_year, default=Decimal("0")),
        ).order_by("-maintenance_count", "-total_cost", "name", "id")


class Mechanic(models.Model):
    name = models.CharField(max_length=100)
    certification_number = UpperCaseCharField(
        max_length=30,
        unique=True,
        error_messages={"unique": "A mechanic with this certification number already exists."},
    )
    active = models.BooleanField(default=True)

    objects = MechanicQuerySet.as_manager()

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
            # Serves per-mechanic lookups: the workload JOIN, ?mechanic= on the records
            # list and the delete-protection check. The workload's date range sits in
            # the aggregate FILTER, so it is applied while scanning a mechanic's rows,
            # not used to seek within them.
            models.Index(fields=["mechanic", "date"], name="record_mechanic_date_idx"),
        ]
        constraints = [
            # Zero is allowed (e.g. warranty work); negative costs are not.
            models.CheckConstraint(condition=Q(cost__gte=0), name="record_cost_non_negative"),
        ]

    def __str__(self):
        return f"{self.get_maintenance_type_display()} on {self.date} for vehicle {self.vehicle_id}"

    def clean(self):
        # Model-level so the admin enforces it too; the API serializer runs the same check.
        super().clean()
        if self.mechanic_id is None:
            return
        previous_mechanic_id = (
            None
            if self._state.adding
            else MaintenanceRecord.objects.filter(pk=self.pk).values_list("mechanic_id", flat=True).first()
        )
        try:
            validate_mechanic_assignment(self.mechanic, previous_mechanic_id)
        except ValidationError as error:
            raise ValidationError({"mechanic": error.messages})
