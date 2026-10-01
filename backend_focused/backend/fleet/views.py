from rest_framework import viewsets

from .models import MaintenanceRecord, Mechanic, Office, Vehicle
from .serializers import (
    MaintenanceRecordSerializer,
    MechanicSerializer,
    OfficeSerializer,
    VehicleSerializer,
)

# Every queryset has an explicit order_by: pagination over an unordered queryset can
# repeat or skip rows between pages. Related objects that the serializer reads are
# loaded with select_related, so each list page is two queries (COUNT + page) no
# matter how many rows it holds.


class OfficeViewSet(viewsets.ModelViewSet):
    queryset = Office.objects.order_by("name", "id")
    serializer_class = OfficeSerializer
    ordering_fields = ["name", "city"]


class VehicleViewSet(viewsets.ModelViewSet):
    queryset = Vehicle.objects.select_related("office").order_by("id")
    serializer_class = VehicleSerializer
    ordering_fields = ["id", "vin", "license_plate", "make", "model", "year"]


class MechanicViewSet(viewsets.ModelViewSet):
    queryset = Mechanic.objects.order_by("name", "id")
    serializer_class = MechanicSerializer
    filterset_fields = ["active"]
    ordering_fields = ["name", "certification_number"]


class MaintenanceRecordViewSet(viewsets.ModelViewSet):
    queryset = MaintenanceRecord.objects.select_related("vehicle", "mechanic").order_by("-date", "-id")
    serializer_class = MaintenanceRecordSerializer
    filterset_fields = ["vehicle", "mechanic", "maintenance_type"]
    ordering_fields = ["date", "cost"]
