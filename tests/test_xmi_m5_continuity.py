"""Offline synthetic contract checks for read-only M5 continuity audit.
Run: python3 -m unittest discover -s tests -p 'test_xmi_m5_continuity.py' -v
No broker, market data, credentials, or 2025 access.
"""
import importlib.util
import tempfile
import unittest
from pathlib import Path

SOURCE = Path(__file__).resolve().parents[1] / "scripts/xmi-m5-continuity-audit.py"
spec = importlib.util.spec_from_file_location("xmi_m5_continuity", SOURCE)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
HEADER = "t,o,h,l,c\n"

def bar(ts, o="1.1000", h="1.1010", l="1.0990", c="1.1005"):
    return f"{ts},{o},{h},{l},{c}\n"

class M5ContinuityTests(unittest.TestCase):
    def audit_rows(self, rows, pair="EURUSD", year=2023, header=HEADER):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "synthetic.csv"
            path.write_text(header + "".join(rows), encoding="utf-8")
            return module.audit(path, pair, year)

    def test_contiguous_five_minute_bars(self):
        result = self.audit_rows([bar("2023-01-02T00:00:00Z"), bar("2023-01-02T00:05:00Z")])
        self.assertEqual((result["observed_m5_bars"], result["gap_events"], result["missing_m5_slots_between_observed_bars_including_weekends"]), (2, 0, 0))

    def test_single_missing_slot_is_counted_not_filled(self):
        result = self.audit_rows([bar("2023-01-02T00:00:00Z"), bar("2023-01-02T00:10:00Z")])
        self.assertEqual(result["gap_events"], 1)
        self.assertEqual(result["missing_m5_slots_between_observed_bars_including_weekends"], 1)
        self.assertEqual(result["largest_gap_excluding_endpoint_bar_minutes"], 5)
        self.assertEqual(result["observed_m5_bars"], 2)

    def test_weekend_gap_is_not_classified_as_outage(self):
        result = self.audit_rows([bar("2023-01-06T21:55:00Z"), bar("2023-01-08T22:00:00Z")])
        self.assertEqual(result["gap_events"], 1)
        self.assertGreater(result["missing_m5_slots_between_observed_bars_including_weekends"], 500)
        self.assertNotIn("outage_count", result)

    def test_reject_duplicate_and_reversed_bars(self):
        a, b = bar("2023-01-02T00:00:00Z"), bar("2023-01-02T00:05:00Z")
        for rows in ([a, a], [b, a]):
            with self.subTest(rows=rows), self.assertRaisesRegex(ValueError, "Non-monotonic"):
                self.audit_rows(rows)

    def test_reject_non_utc_or_unaligned_timestamps(self):
        for ts in ("2023-01-02T00:00:00+01:00", "2023-01-02T00:00:00", "2023-01-02T00:01:00Z"):
            with self.subTest(ts=ts), self.assertRaises(ValueError):
                self.audit_rows([bar(ts)])

    def test_reject_invalid_ohlc_and_schema(self):
        with self.assertRaisesRegex(ValueError, "Invalid bid OHLC"):
            self.audit_rows([bar("2023-01-02T00:00:00Z", h="1.0990")])
        with self.assertRaisesRegex(ValueError, "header"):
            self.audit_rows([], header="t,o,h,l\n")

    def test_all_seven_pairs_both_training_years(self):
        for pair in module.PAIRS:
            for year in (2022, 2023):
                with self.subTest(pair=pair, year=year):
                    result = self.audit_rows([bar(f"{year}-01-03T00:00:00Z")], pair, year)
                    self.assertEqual((result["pair"], result["year"]), (pair, year))
                    self.assertFalse(result["historical_gatesfx_execution_verified"])
                    self.assertFalse(result["holdout_2025_read"])

    def test_reject_2025_and_unregistered_pair(self):
        for pair, year in (("EURUSD", 2025), ("XAUUSD", 2023)):
            with self.subTest(pair=pair, year=year), self.assertRaises(ValueError):
                self.audit_rows([bar("2023-01-02T00:00:00Z")], pair, year)

    def test_reject_empty_and_cross_year(self):
        with self.assertRaisesRegex(ValueError, "No bars"):
            self.audit_rows([])
        with self.assertRaisesRegex(ValueError, "outside requested training year"):
            self.audit_rows([bar("2022-12-30T23:55:00Z")], year=2023)

if __name__ == "__main__":
    unittest.main()
