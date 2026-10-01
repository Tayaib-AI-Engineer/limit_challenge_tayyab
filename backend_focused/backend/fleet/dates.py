def one_year_before(day):
    """The same calendar day one year earlier, e.g. 2026-10-01 -> 2025-10-01.

    Used for "the last 12 months". Feb 29 has no counterpart in the previous year
    and falls back to Feb 28.
    """
    try:
        return day.replace(year=day.year - 1)
    except ValueError:
        return day.replace(year=day.year - 1, day=28)
