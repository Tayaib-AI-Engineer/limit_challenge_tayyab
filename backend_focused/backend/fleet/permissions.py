from django.conf import settings
from rest_framework.permissions import IsAuthenticated


class IsAuthenticatedIfRequired(IsAuthenticated):
    """IsAuthenticated, unless DJANGO_API_AUTH=0 switched authentication off
    (settings.API_AUTH_REQUIRED): the brief's API needs none, JWT is its optional bonus.

    Read on every request rather than by picking AllowAny in settings: DRF copies
    DEFAULT_PERMISSION_CLASSES onto APIView at import time, so only a per-request check
    can be switched by override_settings, and the tests pass in either mode.
    """

    def has_permission(self, request, view):
        return not settings.API_AUTH_REQUIRED or super().has_permission(request, view)
