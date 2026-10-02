from django.contrib import admin

from .models import MaintenanceRecord, Mechanic, Office, Vehicle


@admin.register(Office)
class OfficeAdmin(admin.ModelAdmin):
    list_display = ["name", "city"]
    search_fields = ["name", "city"]
    ordering = ["name"]


@admin.register(Vehicle)
class VehicleAdmin(admin.ModelAdmin):
    list_display = ["vin", "license_plate", "make", "model", "year", "office", "active"]
    list_filter = ["active", "office"]
    search_fields = ["vin", "license_plate", "make", "model"]
    list_select_related = ["office"]
    autocomplete_fields = ["office"]
    ordering = ["vin"]

    def get_readonly_fields(self, request, obj=None):
        # Same rule as the API: an existing vehicle moves only via assign-office, so
        # office changes keep a single write path.
        return ["office"] if obj is not None else []


@admin.register(Mechanic)
class MechanicAdmin(admin.ModelAdmin):
    list_display = ["name", "certification_number", "active"]
    list_filter = ["active"]
    search_fields = ["name", "certification_number"]
    ordering = ["name"]


@admin.register(MaintenanceRecord)
class MaintenanceRecordAdmin(admin.ModelAdmin):
    list_display = ["date", "vehicle", "mechanic", "maintenance_type", "cost"]
    list_filter = ["maintenance_type"]
    search_fields = ["vehicle__vin", "vehicle__license_plate", "mechanic__certification_number"]
    date_hierarchy = "date"
    # Thousands of vehicles would make plain <select> widgets unusable.
    autocomplete_fields = ["vehicle", "mechanic"]
    list_select_related = ["vehicle", "mechanic"]
    ordering = ["-date", "-id"]
