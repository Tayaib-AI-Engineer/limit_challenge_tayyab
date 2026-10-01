from rest_framework.routers import DefaultRouter

from . import views

# Trailing slashes are kept (DefaultRouter's default). Clients must send them:
# APPEND_SLASH cannot redirect a POST without losing its method and body.
router = DefaultRouter()
router.register("offices", views.OfficeViewSet)
router.register("vehicles", views.VehicleViewSet)
router.register("mechanics", views.MechanicViewSet)
router.register("maintenance-records", views.MaintenanceRecordViewSet)

urlpatterns = router.urls
