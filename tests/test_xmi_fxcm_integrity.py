#!/usr/bin/env python3
"""Synthetic, offline integrity regression for the 2022/2023 FXCM M1 parser.
Run: python3 -m unittest discover -s tests -p 'test_xmi_fxcm_integrity.py' -v
No market downloads, broker calls, credentials, or 2025 access.
"""
import importlib.util
import unittest
from pathlib import Path

SOURCE = Path(__file__).resolve().parents[1] / "scripts/xmi-amd-fxcm-seven-pair-replay.py"
spec = importlib.util.spec_from_file_location("xmi_fxcm_replay", SOURCE)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

HEADER = "DateTime,BidOpen,BidHigh,BidLow,BidClose,AskOpen\n"
def sample(ts, bid="1.1000", ask="1.1002"):
    return (HEADER + f"{ts},{bid},1.1004,1.0998,1.1001,{ask}\n").encode()

class FXCMIntegrityRegression(unittest.TestCase):
    def parse(self, data):
        return list(module.parse_minute(data, 2023, 1))

    def test_valid_minute(self):
        rows = self.parse(sample("2023-01-02 00:00:00"))
        self.assertEqual(len(rows), 1)
        self.assertAlmostEqual(rows[0][1][4] - rows[0][1][0], 0.0002)

    def test_reject_crossed_quote(self):
        with self.assertRaisesRegex(ValueError, "ask|spread|crossed"):
            self.parse(sample("2023-01-02 00:00:00", ask="1.0999"))

    def test_reject_missing_ask_column(self):
        data = sample("2023-01-02 00:00:00").replace(b",AskOpen", b"")
        data = data.replace(b",1.1002\n", b"\n")
        with self.assertRaisesRegex(ValueError, "Missing column askopen"):
            self.parse(data)

    def test_reject_blank_ask_quote(self):
        with self.assertRaisesRegex(ValueError, "Missing ask open"):
            self.parse(sample("2023-01-02 00:00:00", ask=""))

    def test_reject_nonminute_timestamp(self):
        with self.assertRaisesRegex(ValueError, "Non-minute"):
            self.parse(sample("2023-01-02 00:00:01"))

    def test_reject_invalid_bid_range(self):
        with self.assertRaisesRegex(ValueError, "Invalid bid high/low"):
            self.parse(sample("2023-01-02 00:00:00", bid="1.2000"))

    def test_reject_implicit_non_utc_offset(self):
        # A local clock with an offset must not be silently treated as a UTC source.
        with self.assertRaisesRegex(ValueError, "UTC|offset|timezone"):
            self.parse(sample("2023-01-02T00:00:00+02:00"))


    def test_accept_explicit_utc_z(self):
        rows = self.parse(sample("2023-01-02T00:00:00Z"))
        self.assertEqual(len(rows), 1)

    def test_accept_explicit_zero_utc_offset(self):
        rows = self.parse(sample("2023-01-02T00:00:00+00:00"))
        self.assertEqual(len(rows), 1)

    def test_reject_negative_utc_offset(self):
        with self.assertRaisesRegex(ValueError, "UTC|offset|timezone"):
            self.parse(sample("2023-01-02T00:00:00-05:00"))

    def test_reject_crossed_quote_at_all_seven_pair_price_scales(self):
        # Parser is pair-agnostic. Include JPY and non-JPY quote scales.
        for pair, bid, ask in (
            ("EURUSD", "1.1000", "1.0999"),
            ("GBPUSD", "1.2500", "1.2499"),
            ("USDJPY", "145.000", "144.999"),
            ("USDCHF", "0.9000", "0.8999"),
            ("AUDUSD", "0.7000", "0.6999"),
            ("USDCAD", "1.3500", "1.3499"),
            ("NZDUSD", "0.6500", "0.6499"),
        ):
            # Valid OHLC ranges must be built around each synthetic bid.
            row = (HEADER + f"2023-01-02 00:00:00,{bid},{float(bid)+0.001:.6f},{float(bid)-0.001:.6f},{bid},{ask}\n").encode()
            with self.subTest(pair=pair), self.assertRaisesRegex(ValueError, "Crossed"):
                self.parse(row)

    def test_requested_year_is_enforced_at_parser_boundary(self):
        # Week files can contain neighboring-year minutes. They must not enter
        # the wrong training fold, even when both years are allowed globally.
        self.assertEqual(self.parse(sample("2022-12-30 23:59:00")), [])
        self.assertEqual(len(self.parse(sample("2023-01-02 00:00:00"))), 1)
        self.assertEqual(list(module.parse_minute(sample("2023-12-29 23:59:00"), 2022, 52)), [])
        self.assertEqual(list(module.parse_minute(sample("2024-01-01 00:00:00"), 2023, 52)), [])

    def test_no_2025_in_research_folds(self):
        self.assertEqual(module.YEARS, (2022, 2023))
        self.assertEqual(list(module.parse_minute(sample("2025-01-02 00:00:00"), 2023, 1)), [])

if __name__ == "__main__":
    unittest.main()
