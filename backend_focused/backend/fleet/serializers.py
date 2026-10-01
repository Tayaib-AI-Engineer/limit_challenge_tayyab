from rest_framework import serializers

from . import models
from .models import MaintenanceRecord, Mechanic, Office, Vehicle
from .validators import validate_license_plate


class UpperCaseCharField(serializers.CharField):
    """Upper-cases identifiers in to_internal_value(), which DRF runs *before* field
    validators. Normalising later (in validate_<field>) would let "abc123" slip past
    the UniqueValidator and hit the database constraint as a 500."""

    def to_internal_value(self, data):
        return super().to_internal_value(data).upper()


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


class MechanicSerializer(BaseModelSerializer):
    class Meta:
        model = Mechanic
        fields = ["id", "name", "certification_number", "active"]


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
        # Only checked when the mechanic is being set or changed, so historical records
        # stay editable after their mechanic is deactivated.
        is_changing = self.instance is None or self.instance.mechanic_id != mechanic.pk
        if is_changing and not mechanic.active:
            raise serializers.ValidationError("Inactive mechanics can't be assigned to maintenance records.")
        return mechanic
