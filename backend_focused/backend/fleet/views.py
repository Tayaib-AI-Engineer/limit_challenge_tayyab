from django.utils import timezone
from django_filters.rest_framework import DjangoFilterBackend
from drf_spectacular.utils import extend_schema
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from .filters import MechanicFilter, VehicleFilter
from .models import MaintenanceRecord, Mechanic, Office, Vehicle
from .serializers import (
    AssignOfficeSerializer,
    DuplicateCheckQuerySerializer,
    DuplicateCheckResultSerializer,
    MaintenanceRecordSerializer,
    MechanicSerializer,
    MechanicWorkloadSerializer,
    OfficeSerializer,
    OfficeSummarySerializer,
    VehicleDetailSerializer,
    VehicleHistoryRecordSerializer,
    VehicleMaintenanceDueSerializer,
    VehicleSerializer,
    save_only,
)

# Every queryset has an explicit order_by: pagination over an unordered queryset can
# repeat or skip rows between pages. Related objects that the serializer reads are
# loaded with select_related, so each list page is two queries (COUNT + page) no
# matter how many rows it holds.
#
# Reports over small tables (offices, mechanics) are returned whole, as the spec's
# example shows; lists that grow with vehicles or records are paginated. List-level
# custom actions set filter_backends explicitly, so they only accept the parameters
# that make sense for them.


class FleetModelViewSet(viewsets.ModelViewSet):
    def filter_queryset(self, queryset):
        # Filters are a list concern. DRF's get_object() also runs filter_queryset(), so
        # without this, GET /vehicles/5/?active=false would 404 and
        # DELETE /vehicles/5/?office=999 would 400.
        if self.detail:
            return queryset
        return super().filter_queryset(queryset)


class OfficeViewSet(FleetModelViewSet):
    queryset = Office.objects.order_by("name", "id")
    serializer_class = OfficeSerializer
    ordering_fields = ["name", "city"]

    @extend_schema(responses=OfficeSummarySerializer(many=True))
    @action(detail=False, methods=["get"], filter_backends=[], pagination_class=None)
    def summary(self, request):
        offices = self.get_queryset().with_summary(timezone.localdate())
        return Response(OfficeSummarySerializer(offices, many=True).data)


class VehicleViewSet(FleetModelViewSet):
    """Vehicle CRUD. The list endpoint is also the vehicle search: see VehicleFilter."""

    queryset = Vehicle.objects.select_related("office").order_by("id")
    serializer_class = VehicleSerializer
    filterset_class = VehicleFilter
    ordering_fields = ["id", "vin", "license_plate", "make", "model", "year"]

    def get_queryset(self):
        queryset = super().get_queryset()
        if self.action == "retrieve":
            return queryset.with_detail()
        return queryset

    def get_serializer_class(self):
        if self.action == "retrieve":
            return VehicleDetailSerializer
        return super().get_serializer_class()

    @extend_schema(responses=VehicleHistoryRecordSerializer(many=True))
    @action(detail=True, methods=["get"], url_path="maintenance-history", filter_backends=[])
    def maintenance_history(self, request, pk=None):
        """The vehicle's maintenance records, newest first, paginated."""
        vehicle = self.get_object()
        records = vehicle.maintenance_records.select_related("mechanic").order_by("-date", "-id")
        page = self.paginate_queryset(records)
        return self.get_paginated_response(VehicleHistoryRecordSerializer(page, many=True).data)

    @extend_schema(request=AssignOfficeSerializer, responses=VehicleSerializer)
    @action(
        detail=True,
        methods=["post"],
        url_path="assign-office",
        filter_backends=[],
        serializer_class=AssignOfficeSerializer,
    )
    def assign_office(self, request, pk=None):
        """Move the vehicle to another office. Assigning its current office is a no-op,
        so a retried request succeeds instead of failing."""
        vehicle = self.get_object()
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        office = serializer.validated_data["office"]

        if vehicle.office_id != office.pk:
            vehicle.office = office
            # UPDATE ... SET office_id only. A plain save() rewrites every column and can
            # silently undo a concurrent change to another field (e.g. a deactivation).
            save_only(vehicle, ["office"])

        return Response(VehicleSerializer(vehicle, context=self.get_serializer_context()).data)

    @extend_schema(responses=VehicleMaintenanceDueSerializer(many=True))
    @action(detail=False, methods=["get"], url_path="needing-maintenance", filter_backends=[])
    def needing_maintenance(self, request):
        """Active vehicles never serviced or last serviced more than 365 days ago,
        oldest maintenance first."""
        today = timezone.localdate()
        page = self.paginate_queryset(self.get_queryset().needing_maintenance(today))
        serializer = VehicleMaintenanceDueSerializer(
            page, many=True, context={**self.get_serializer_context(), "today": today}
        )
        return self.get_paginated_response(serializer.data)

    @extend_schema(parameters=[DuplicateCheckQuerySerializer], responses=DuplicateCheckResultSerializer)
    @action(
        detail=False,
        methods=["get"],
        url_path="duplicate-check",
        filter_backends=[],
        pagination_class=None,
    )
    def duplicate_check(self, request):
        """Which of the given VIN and license plate already belong to another vehicle.

        200 for any valid request: finding a conflict is the answer to the question, not
        an error. Uses the same rules as create/update: the VIN clashes with any vehicle,
        the plate only between active vehicles.
        """
        # A plain dict, not the QueryDict: DRF reads a missing BooleanField in form-style
        # input as False, which would ignore active's default of true.
        params = DuplicateCheckQuerySerializer(data=request.query_params.dict())
        params.is_valid(raise_exception=True)
        checks = params.validated_data
        conflicts = Vehicle.objects.conflicts(
            vin=checks.get("vin"),
            license_plate=checks.get("license_plate") if checks["active"] else None,
            exclude_pk=checks.get("exclude_id"),
        )
        return Response({"conflicts": conflicts})


class MechanicViewSet(FleetModelViewSet):
    queryset = Mechanic.objects.order_by("name", "id")
    serializer_class = MechanicSerializer
    filterset_class = MechanicFilter
    ordering_fields = ["name", "certification_number"]

    @extend_schema(responses=MechanicWorkloadSerializer(many=True))
    @action(detail=False, methods=["get"], filter_backends=[DjangoFilterBackend], pagination_class=None)
    def workload(self, request):
        """Records completed and their total cost this calendar year, busiest first.
        Accepts ?active=true to hide inactive mechanics."""
        mechanics = self.filter_queryset(self.get_queryset()).with_workload(timezone.localdate())
        return Response(MechanicWorkloadSerializer(mechanics, many=True).data)


class MaintenanceRecordViewSet(FleetModelViewSet):
    queryset = MaintenanceRecord.objects.select_related("vehicle", "mechanic").order_by("-date", "-id")
    serializer_class = MaintenanceRecordSerializer
    filterset_fields = ["vehicle", "mechanic", "maintenance_type"]
    ordering_fields = ["date", "cost"]
