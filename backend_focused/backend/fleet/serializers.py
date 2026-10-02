from django.db import DatabaseError, transaction
from rest_framework import serializers
from rest_framework.exceptions import NotFound

from . import models
from .models import MaintenanceRecord, Mechanic, Office, Vehicle, normalize_identifier
from .validators import validate_license_plate, validate_mechanic_assignment


class UpperCaseCharField(serializers.CharField):
    """Normalises identifiers in to_internal_value(), which DRF runs *before* field
    validators. The format regexes (e.g. no lowercase in a VIN) then judge the stored
    form, and responses echo exactly what was saved. (Database lookups are normalised
    by the model field itself.)"""

    def to_internal_value(self, data):
        return normalize_identifier(super().to_internal_value(data))


def save_only(instance, fields):
    """save(update_fields=fields): UPDATE just these columns, so a request can't silently
    revert columns that another request changed after this one read the row.

    Django raises DatabaseError when the row has been deleted in the meantime (where a
    plain save() would quietly re-INSERT it); that case becomes a 404.
    """
    try:
        # Own savepoint: a failed save marks an enclosing transaction (ATOMIC_REQUESTS,
        # tests) as broken, which would block the existence check below.
        with transaction.atomic():
            instance.save(update_fields=fields)
    except DatabaseError as error:
        if type(instance)._default_manager.filter(pk=instance.pk).exists():
            raise
        raise NotFound(f"This {instance._meta.verbose_name} no longer exists.") from error


class BaseModelSerializer(serializers.ModelSerializer):
    # Any model field declared as UpperCaseCharField gets the normalising serializer
    # field automatically, so the rule lives in one place: the model definition.
    serializer_field_mapping = {
        **serializers.ModelSerializer.serializer_field_mapping,
        models.UpperCaseCharField: UpperCaseCharField,
    }


class OfficeSerializer(BaseModelSerializer):
    class Meta:
        model = Office
        fields = ["id", "name", "city"]


class OfficeSummarySerializer(serializers.ModelSerializer):
    """Read-only; values come from OfficeQuerySet.with_summary()."""

    active_vehicle_count = serializers.IntegerField(read_only=True)
    maintenance_cost_last_year = serializers.DecimalField(max_digits=14, decimal_places=2, read_only=True)
    last_maintenance = serializers.DateField(read_only=True, allow_null=True)

    class Meta:
        model = Office
        fields = ["id", "name", "city", "active_vehicle_count", "maintenance_cost_last_year", "last_maintenance"]


class VehicleSerializer(BaseModelSerializer):
    office_name = serializers.CharField(source="office.name", read_only=True)

    class Meta:
        model = Vehicle
        fields = ["id", "vin", "license_plate", "make", "model", "year", "office", "office_name", "active"]
        extra_kwargs = {
            # Replace DRF's auto-generated UniqueValidator for the plate. DRF 3.17 builds it
            # as UniqueValidator(Vehicle.objects.filter(active=True)), which ignores whether
            # the *incoming* vehicle is active: it rejects valid inactive vehicles, and a
            # PATCH that only sets active=true skips it entirely (-> IntegrityError, 500).
            # The format check is kept; uniqueness is checked in validate() below.
            "license_plate": {"validators": [validate_license_plate]},
        }

    def get_extra_kwargs(self):
        extra_kwargs = super().get_extra_kwargs()
        if self.instance is not None:
            # The office can't change on update (see validate()), so a PUT needn't send it.
            extra_kwargs["office"] = {**extra_kwargs.get("office", {}), "required": False}
        return extra_kwargs

    def validate(self, attrs):
        instance = self.instance

        # Moving a vehicle is a separate domain action with its own endpoint, so that
        # office changes have exactly one write path.
        if instance is not None and "office" in attrs and attrs["office"] != instance.office:
            raise serializers.ValidationError(
                {"office": "Use POST /api/vehicles/{id}/assign-office/ to move a vehicle to another office."}
            )

        # Partial updates only carry the changed fields: judge the resulting row.
        plate = attrs.get("license_plate", getattr(instance, "license_plate", None))
        active = attrs.get("active", getattr(instance, "active", True))
        if active and "license_plate" in Vehicle.objects.conflicts(
            license_plate=plate, exclude_pk=getattr(instance, "pk", None)
        ):
            raise serializers.ValidationError(
                {"license_plate": "Another active vehicle already uses this license plate."}
            )
        return attrs

    def update(self, instance, validated_data):
        # ModelSerializer.update() would call a plain save(), writing every column with
        # the values read at the start of this request; a PATCH {"make": ...} could then
        # undo a concurrent assign-office or deactivation.
        for field, value in validated_data.items():
            setattr(instance, field, value)
        save_only(instance, list(validated_data))
        return instance


class VehicleMaintenanceDueSerializer(VehicleSerializer):
    """Read-only; last_maintenance comes from VehicleQuerySet.needing_maintenance()."""

    last_maintenance = serializers.DateField(read_only=True, allow_null=True)
    days_since_last_maintenance = serializers.SerializerMethodField()

    class Meta(VehicleSerializer.Meta):
        fields = [*VehicleSerializer.Meta.fields, "last_maintenance", "days_since_last_maintenance"]

    def get_days_since_last_maintenance(self, vehicle) -> int | None:
        if vehicle.last_maintenance is None:
            return None
        return (self.context["today"] - vehicle.last_maintenance).days


class AssignOfficeSerializer(serializers.Serializer):
    office = serializers.PrimaryKeyRelatedField(queryset=Office.objects.all())


class DuplicateCheckQuerySerializer(serializers.Serializer):
    """Query parameters of the duplicate check. Blank values count as absent, so a form
    can send both fields while the user is still filling one in."""

    vin = UpperCaseCharField(required=False, allow_blank=True)
    license_plate = UpperCaseCharField(required=False, allow_blank=True)
    exclude_id = serializers.IntegerField(
        required=False, min_value=1, help_text="ID of the vehicle being edited, so it doesn't conflict with itself."
    )
    active = serializers.BooleanField(
        default=True,
        help_text=(
            "Whether the vehicle being checked is (or will be) active. Plates only clash "
            "between active vehicles, so with false only the VIN is checked."
        ),
    )

    def validate(self, attrs):
        if not attrs.get("vin") and not attrs.get("license_plate"):
            raise serializers.ValidationError("Provide vin, license_plate or both.")
        return attrs


class DuplicateCheckResultSerializer(serializers.Serializer):
    conflicts = serializers.ListField(child=serializers.ChoiceField(choices=["vin", "license_plate"]))


class MechanicSerializer(BaseModelSerializer):
    class Meta:
        model = Mechanic
        fields = ["id", "name", "certification_number", "active"]


class MechanicWorkloadSerializer(serializers.ModelSerializer):
    """Read-only; values come from MechanicQuerySet.with_workload()."""

    maintenance_count = serializers.IntegerField(read_only=True)
    total_cost = serializers.DecimalField(max_digits=14, decimal_places=2, read_only=True)

    class Meta:
        model = Mechanic
        fields = ["id", "name", "certification_number", "active", "maintenance_count", "total_cost"]


class MechanicBriefSerializer(serializers.ModelSerializer):
    class Meta:
        model = Mechanic
        fields = ["id", "name", "certification_number"]


class VehicleHistoryRecordSerializer(serializers.ModelSerializer):
    """One entry of a vehicle's maintenance history; the vehicle is implied."""

    mechanic = MechanicBriefSerializer(read_only=True)

    class Meta:
        model = MaintenanceRecord
        fields = ["id", "date", "maintenance_type", "cost", "notes", "mechanic"]


class VehicleDetailSerializer(serializers.ModelSerializer):
    """Read-only detail view: the office and the complete maintenance history, newest
    first. Expects VehicleQuerySet.with_detail() so it renders in 2 queries."""

    office = OfficeSerializer(read_only=True)
    maintenance_records = VehicleHistoryRecordSerializer(many=True, read_only=True)

    class Meta:
        model = Vehicle
        fields = ["id", "vin", "license_plate", "make", "model", "year", "active", "office", "maintenance_records"]


class MaintenanceRecordSerializer(BaseModelSerializer):
    vehicle_vin = serializers.CharField(source="vehicle.vin", read_only=True)
    mechanic_name = serializers.CharField(source="mechanic.name", read_only=True)

    class Meta:
        model = MaintenanceRecord
        fields = [
            "id", "vehicle", "vehicle_vin", "mechanic", "mechanic_name",
            "date", "maintenance_type", "cost", "notes",
        ]

    def validate_mechanic(self, mechanic):
        # Same rule as MaintenanceRecord.clean(); DRF turns the Django ValidationError
        # into a field error.
        validate_mechanic_assignment(mechanic, getattr(self.instance, "mechanic_id", None))
        return mechanic
