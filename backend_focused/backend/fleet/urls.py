from rest_framework.routers import DefaultRouter

# Trailing slashes are kept (DefaultRouter's default). Clients must send them:
# APPEND_SLASH cannot redirect a POST without losing its method and body.
router = DefaultRouter()

urlpatterns = router.urls
