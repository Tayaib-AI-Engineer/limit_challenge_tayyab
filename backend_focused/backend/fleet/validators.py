"""Field validators shared by the models, the admin and the API serializers.

Rules that depend on "today" are plain functions rather than e.g.
MaxValueValidator(date.today().year + 1): a migration stores a function by its import
path, but would freeze a computed value and drift out of date every year.
"""

from django.core.exceptions import ValidationError
from django.core.validators import RegexValidator
from django.utils import timezone

# 17 characters; I, O and Q are never used in a VIN, which catches the common O/0 typo.
# The check digit is not verified: it is only mandatory for North American vehicles.
validate_vin = RegexValidator(
    regex=r"^[A-HJ-NPR-Z0-9]{17}$",
    message="Enter a valid 17-character VIN (letters I, O and Q are not used).",
)

validate_license_plate = RegexValidator(
    regex=r"^[A-Z0-9][A-Z0-9 -]*$",
    message="License plates may only contain letters, digits, spaces and hyphens.",
)

# 17-character VINs became mandatory for model year 1981 (49 CFR 565), so the two
# rules agree. Manufacturers sell next year's models from mid-year, hence the +1.
FIRST_VIN_MODEL_YEAR = 1981


def validate_model_year(value):
    latest = timezone.localdate().year + 1
    if not FIRST_VIN_MODEL_YEAR <= value <= latest:
        raise ValidationError(
            f"Model year must be between {FIRST_VIN_MODEL_YEAR} and {latest}.",
            code="invalid_model_year",
        )


def validate_not_in_future(value):
    # A future-dated record would hide an overdue vehicle from the
    # "needing maintenance" report, so records describe work already done.
    if value > timezone.localdate():
        raise ValidationError("Maintenance date cannot be in the future.", code="future_date")
