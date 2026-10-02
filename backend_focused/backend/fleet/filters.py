from django import forms
from django_filters import rest_framework as filters

from .models import MaintenanceRecord, Mechanic, Office, Vehicle, normalize_identifier


class StrictBooleanField(forms.NullBooleanField):
    def to_python(self, value):
        if value in (None, ""):
            return None
        normalized = str(value).strip().lower()
        if normalized in ("true", "1"):
            return True
        if normalized in ("false", "0"):
            return False
        raise forms.ValidationError("Must be true or false.", code="invalid")


class StrictBooleanFilter(filters.BooleanFilter):
    """django-filter's BooleanFilter maps anything it doesn't recognise to "no filter",
    so ?active=maybe would silently return everything. This one answers 400 instead."""

    field_class = StrictBooleanField

    def __init__(self, *args, **kwargs):
        kwargs.setdefault("widget", forms.TextInput)  # pass the raw value to the field
        super().__init__(*args, **kwargs)


class MechanicFilter(filters.FilterSet):
    active = StrictBooleanFilter()

    class Meta:
        model = Mechanic
        fields = ["active"]


class VehicleFilterForm(forms.Form):
    def clean(self):
        cleaned_data = super().clean()
        start, end = cleaned_data.get("maintenance_from"), cleaned_data.get("maintenance_to")
        if start and end and start > end:
            self.add_error("maintenance_to", "Must be on or after maintenance_from.")
        return cleaned_data


class VehicleFilter(filters.FilterSet):
    """Vehicle search. Every parameter is optional and they combine with AND.

    The maintenance parameters describe a single maintenance record: "serviced between
    these dates, by this mechanic" means one record that satisfies all of them. That is
    why they are not plain filters on maintenance_records__...: django-filter applies
    each filter as its own .filter() call, and across a one-to-many relation every call
    adds a separate JOIN. The conditions could then be met by *different* records (a
    vehicle serviced before and after an empty window would match it) and each vehicle
    would repeat once per matching record combination (measured: 204,079 rows for 599
    vehicles). Instead they are collected in filter_queryset() into one subquery.
    """

    office = filters.ModelChoiceFilter(queryset=Office.objects.all(), help_text="Office ID.")
    active = StrictBooleanFilter()
    # max_length matches the model fields; it also keeps oversized input away from
    # SQLite, which rejects LIKE patterns over 50,000 bytes with a 500.
    make = filters.CharFilter(lookup_expr="iexact", max_length=50, help_text="Exact make, case-insensitive.")
    model = filters.CharFilter(lookup_expr="iexact", max_length=50, help_text="Exact model, case-insensitive.")
    maintenance_from = filters.DateFilter(
        method="apply_with_other_maintenance_filters",
        help_text="Serviced on or after this date (YYYY-MM-DD).",
    )
    maintenance_to = filters.DateFilter(
        method="apply_with_other_maintenance_filters",
        help_text="Serviced on or before this date (YYYY-MM-DD).",
    )
    mechanic_certification = filters.CharFilter(
        method="apply_with_other_maintenance_filters",
        max_length=30,
        help_text="Serviced by the mechanic with this certification number.",
    )

    # Filter name -> lookup on MaintenanceRecord.
    MAINTENANCE_LOOKUPS = {
        "maintenance_from": "date__gte",
        "maintenance_to": "date__lte",
        # Stored upper-cased and unique, so an exact match can use the unique index
        # (iexact compiles to LIKE on SQLite, which can't).
        "mechanic_certification": "mechanic__certification_number",
    }

    class Meta:
        model = Vehicle
        fields = ["office", "active", "make", "model"]
        form = VehicleFilterForm

    def apply_with_other_maintenance_filters(self, queryset, name, value):
        # Deliberately a no-op here: filter_queryset() applies these together.
        return queryset

    def filter_queryset(self, queryset):
        queryset = super().filter_queryset(queryset)

        record_conditions = {}
        for name, lookup in self.MAINTENANCE_LOOKUPS.items():
            value = self.form.cleaned_data.get(name)
            if value in (None, ""):
                continue
            record_conditions[lookup] = normalize_identifier(value) if name == "mechanic_certification" else value

        if record_conditions:
            # An uncorrelated IN (subquery): no duplicate vehicles and no DISTINCT
            # needed. Measured ~1 ms on SQLite; a correlated EXISTS was 600+ ms there
            # before the planner had statistics.
            matching_vehicles = MaintenanceRecord.objects.filter(**record_conditions).values("vehicle_id")
            queryset = queryset.filter(pk__in=matching_vehicles)
        return queryset
