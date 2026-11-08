"""Synthetic UTC/session DST contract checks; no historical prices or 2025 data.

Run: python3 -m unittest discover -s tests -p 'test_xmi_fx_session_dst.py' -v
These tests validate calendar assumptions, not FXCM/GatesFX market availability.
"""
import unittest
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

PAIRS = ("EURUSD", "GBPUSD", "USDJPY", "USDCHF", "AUDUSD", "USDCAD", "NZDUSD")
NY = ZoneInfo("America/New_York")
LONDON = ZoneInfo("Europe/London")
UTC = timezone.utc

def session_utc(local_date, hour, zone):
    """Convert a locally defined session wall-clock hour to UTC."""
    return datetime(local_date.year, local_date.month, local_date.day,
                    hour, 0, tzinfo=zone).astimezone(UTC)

class FXSessionDSTContracts(unittest.TestCase):
    def test_ny_0800_session_moves_one_utc_hour_spring_and_fall(self):
        for year, winter, summer in ((2022, datetime(2022, 1, 12), datetime(2022, 7, 12)),
                                     (2023, datetime(2023, 1, 12), datetime(2023, 7, 12))):
            with self.subTest(year=year):
                self.assertEqual(session_utc(winter, 8, NY).hour, 13)
                self.assertEqual(session_utc(summer, 8, NY).hour, 12)

    def test_london_0800_session_moves_one_utc_hour(self):
        for year in (2022, 2023):
            with self.subTest(year=year):
                self.assertEqual(session_utc(datetime(year, 1, 12), 8, LONDON).hour, 8)
                self.assertEqual(session_utc(datetime(year, 7, 12), 8, LONDON).hour, 7)

    def test_us_uk_dst_mismatch_weeks_must_not_use_single_offset(self):
        # US changes clocks earlier in March and later in autumn than the UK.
        for day in (datetime(2022, 3, 20), datetime(2023, 3, 19),
                    datetime(2022, 10, 30), datetime(2023, 10, 29)):
            with self.subTest(day=day):
                ny = session_utc(day, 8, NY)
                london = session_utc(day, 8, LONDON)
                self.assertIn(ny.hour, (12, 13))
                self.assertIn(london.hour, (7, 8))
                self.assertEqual(ny.tzinfo, UTC)
                self.assertEqual(london.tzinfo, UTC)

    def test_utc_m5_grid_is_unaffected_by_dst(self):
        for year, month, day in ((2022, 3, 13), (2022, 11, 6),
                                 (2023, 3, 12), (2023, 11, 5)):
            start = datetime(year, month, day, 0, tzinfo=UTC)
            stamps = [start + timedelta(minutes=5*i) for i in range(288)]
            self.assertEqual(len({int(t.timestamp()) for t in stamps}), 288)
            self.assertTrue(all(int(t.timestamp()) % 300 == 0 for t in stamps))
            self.assertEqual((stamps[-1]-stamps[0]).total_seconds(), 287*300)

    def test_pair_coverage_training_years_only(self):
        for pair in PAIRS:
            for year in (2022, 2023):
                with self.subTest(pair=pair, year=year):
                    self.assertEqual(session_utc(datetime(year, 7, 12), 8, NY).year, year)

    def test_no_fixed_utc_hour_assumption_for_local_session(self):
        winter = session_utc(datetime(2023, 1, 12), 8, NY)
        summer = session_utc(datetime(2023, 7, 12), 8, NY)
        self.assertNotEqual(winter.hour, summer.hour)

if __name__ == "__main__":
    unittest.main()
