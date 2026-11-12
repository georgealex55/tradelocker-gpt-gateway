"""Synthetic tests only; no MT5 terminal, credentials or 2025 records."""
import unittest
from datetime import datetime, timezone
from types import SimpleNamespace
from scripts.mt5_readonly_terminal import _rows, ReadOnlyMT5
from scripts.mt5_symbol_reconciliation import compare_symbol, SNAPSHOTS

class Structured:
    dtype = SimpleNamespace(names=("time", "open", "close"))
    def __len__(self): return 1
    def __iter__(self):
        yield {"time": 1704153600, "open": 1.1, "close": 1.2}

class FakeScalar:
    def __init__(self, v): self.v = v
    def item(self): return self.v

class FakeStructured:
    dtype = SimpleNamespace(names=("time", "open", "close"))
    def __len__(self): return 1
    def __iter__(self):
        yield {"time": FakeScalar(1704153600), "open": FakeScalar(1.1), "close": FakeScalar(1.2)}

class Tests(unittest.TestCase):
    def test_named_structured_rows(self):
        self.assertEqual(_rows(FakeStructured()), [{"time": 1704153600, "open": 1.1, "close": 1.2}])
    def test_tuple_without_names_fails_closed(self):
        with self.assertRaisesRegex(RuntimeError, "MT5_UNSUPPORTED_ROW_FORMAT"):
            _rows([(1704153600, 1.1, 1.2)])
    def test_all_seven_fx_and_gold_separate(self):
        self.assertEqual(len(SNAPSHOTS), 8)
        for sym in SNAPSHOTS:
            with self.subTest(sym=sym):
                result = compare_symbol(sym, {"trade_contract_size": SNAPSHOTS[sym]["contract"], "volume_min": 0.01})
                self.assertEqual(result["checks"]["trade_contract_size"], "matches_snapshot")
                self.assertEqual(result["research_status"], "PROVISIONAL_UNRANKED")
                self.assertIn("VOLUME_STEP_UNVERIFIED", result["issues"])
                self.assertEqual(result["category"], "gold_separate" if sym == "XAUUSD" else "forex_major")
    def test_mismatch_detected(self):
        result = compare_symbol("EURUSD", {"trade_contract_size": 1000, "volume_min": 0.1, "volume_step": 0.01, "volume_max": 100})
        self.assertIn("trade_contract_size_DIFFERS_FROM_TRADELOCKER_SNAPSHOT", result["issues"])
        self.assertIn("volume_min_DIFFERS_FROM_TRADELOCKER_SNAPSHOT", result["issues"])
    def test_broker_terms_remain_unverified_even_if_current_fields_present(self):
        result = compare_symbol("EURUSD", {"trade_contract_size": 100000, "volume_min": 0.01,
            "volume_step": 0.01, "volume_max": 100, "point": 0.00001,
            "trade_tick_size": 0.00001, "swap_long": 0, "swap_short": 0},
            {"leverage": 500, "margin_so_call": 100, "margin_so_so": 50})
        self.assertEqual(result["checks"]["volume_range"], "consistent")
        self.assertIn("HISTORICAL_SWAP_SCHEDULE_UNVERIFIED", result["issues"])
        self.assertFalse(result["historical_terms_verified"])
    def test_missing_values_never_default_to_zero(self):
        result = compare_symbol("USDJPY", {})
        self.assertEqual(result["checks"]["trade_contract_size"], "unknown")
        self.assertEqual(result["checks"]["volume_range"], "unknown")

if __name__ == "__main__":
    unittest.main()
