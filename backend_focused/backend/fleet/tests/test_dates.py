from datetime import date

from django.test import SimpleTestCase

from fleet.dates import one_year_before


class OneYearBeforeTests(SimpleTestCase):
    def test_same_calendar_day_last_year(self):
        self.assertEqual(one_year_before(date(2026, 10, 1)), date(2025, 10, 1))
        self.assertEqual(one_year_before(date(2026, 1, 1)), date(2025, 1, 1))

    def test_leap_day_falls_back_to_feb_28(self):
        self.assertEqual(one_year_before(date(2028, 2, 29)), date(2027, 2, 28))
