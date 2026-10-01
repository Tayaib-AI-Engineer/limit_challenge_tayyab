"""API-wide exception handling.

DRF's default handler only translates Http404, PermissionDenied and APIException;
anything else surfaces as a 500. Two database errors are expected in normal use and
are really conflicts with the current state of the data (RFC 9110 §15.5.10), so they
are returned as 409 with a message the client can act on.
"""

from collections import Counter

from django.db import IntegrityError
from django.db.models import ProtectedError
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import exception_handler, set_rollback


def api_exception_handler(exc, context):
    response = exception_handler(exc, context)
    if response is not None:
        return response

    if isinstance(exc, ProtectedError):
        # Raised by on_delete=PROTECT, e.g. deleting an office that still has vehicles.
        set_rollback()
        return Response(
            {
                "detail": (
                    "Cannot delete this object because other records still reference it. "
                    "Reassign or remove those records first."
                ),
                "blocking_objects": _count_by_model(exc.protected_objects),
            },
            status=status.HTTP_409_CONFLICT,
        )

    if isinstance(exc, IntegrityError):
        # Serializers validate uniqueness first; this only fires when two requests race
        # past that check and the database constraint rejects the second write.
        set_rollback()
        return Response(
            {"detail": "The request conflicts with existing data. Refresh and try again."},
            status=status.HTTP_409_CONFLICT,
        )

    return None


def _count_by_model(objects):
    # verbose_name_plural is a lazy translation proxy; json can't use it as a dict key.
    return dict(Counter(str(obj._meta.verbose_name_plural) for obj in objects))
