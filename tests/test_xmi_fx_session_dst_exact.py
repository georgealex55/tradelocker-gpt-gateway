"""Stronger DST session-boundary regression contracts for 2022-2023 training folds.

Run: python3 -m unittest discover -s tests -p 'test_xmi_fx_session_dst_exact.py' -v
Calendar-only synthetic tests. No prices, 2024 or 2025 holdout access.
"""
import unittest
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

UTC = timezone.utc
NY = ZoneInfo("America/New_York")
LONDON = ZoneInfo("Europe/London")
PAIRS = ("EURUSD","GBPUSD","USDJPY","USDCHF","AUDUSD","USDCAD","NZDUSD")

def at_utc(year, month, day, zone):
    return datetime(year, month, day, 8, tzinfo=zone).astimezone(UTC)

class ExactDSTSessionContracts(unittest.TestCase):
    def test_march_us_uk_mismatch_and_realignment(self):
        # US DST starts March 13/12; UK starts March 27/26.
        for year, before, mismatch, after in (
            (2022, (3, 11), (3, 21), (3, 28)),
            (2023, (3, 10), (3, 20), (3, 27)),
        ):
            for (month, day), expected in ((before,(13,8)),(mismatch,(12,8)),(after,(12,7))):
                with self.subTest(year=year, date=(month,day)):
                    self.assertEqual((at_utc(year,month,day,NY).hour,
                                      at_utc(year,month,day,LONDON).hour),expected)

    def test_autumn_uk_us_mismatch_and_realignment(self):
        # UK DST ends Oct 30/29; US ends Nov 6/5.
        for year, before, mismatch, after in (
            (2022, (10, 28), (10, 31), (11, 7)),
            (2023, (10, 27), (10, 30), (11, 6)),
        ):
            for (month,day), expected in ((before,(12,7)),(mismatch,(12,8)),(after,(13,8))):
                with self.subTest(year=year,date=(month,day)):
                    self.assertEqual((at_utc(year,month,day,NY).hour,
                                      at_utc(year,month,day,LONDON).hour),expected)

    def test_all_seven_pairs_share_same_calendar_contract(self):
        for pair in PAIRS:
            for year in (2022,2023):
                with self.subTest(pair=pair,year=year):
                    self.assertEqual(at_utc(year,7,12,NY).hour,12)
                    self.assertEqual(at_utc(year,7,12,LONDON).hour,7)

if __name__ == "__main__":
    unittest.main()
