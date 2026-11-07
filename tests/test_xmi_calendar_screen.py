"""Execution checks for the historical calendar screen, including session caps."""
import ctypes as ct
from importlib import import_module
from pathlib import Path
import sys
from tempfile import TemporaryDirectory
from types import SimpleNamespace
import unittest

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
screen = import_module("xmi-session-calendar-screen")
controls = screen.controls
research = screen.research


class CalendarScreenTests(unittest.TestCase):
    def plan(self):
        return (np.arange(8, dtype=np.int32), np.full(8, 7, dtype=np.int32),
                np.ones(8, dtype=np.int8), np.arange(8, dtype=float) + 1,
                None, np.full(8, 7, dtype=np.int32))

    def test_inclusive_blackout_filters_entries_and_caps_exits(self):
        profile = controls.Restrictions(((2 * controls.MINUTE, 4 * controls.MINUTE, "news"),))
        plan = screen.restrict_plan(np.arange(8), self.plan(), profile)
        np.testing.assert_array_equal(plan[0], [0, 1, 5, 6, 7])
        np.testing.assert_array_equal(plan[1], [7, 7, 7, 7, 7])
        np.testing.assert_array_equal(plan[3], [1, 2, 6, 7, 8])
        np.testing.assert_array_equal(plan[5], [1, 1, 7, 7, 7])

    def test_partial_minute_is_not_treated_as_safely_fillable(self):
        profile = controls.Restrictions(((2 * controls.MINUTE + 30000, 3 * controls.MINUTE, "news"),))
        plan = screen.restrict_plan(np.arange(8), self.plan(), profile)
        self.assertNotIn(2, plan[0])
        self.assertNotIn(3, plan[0])
        self.assertEqual(plan[5][0], 1)

    def test_missing_coverage_rejects_replay(self):
        with self.assertRaises(ValueError):
            screen.restrict_plan(np.arange(8), self.plan(), controls.Restrictions((), True))

    def test_full_period_does_not_accept_january_only_coverage(self):
        calendar = {"coverage": "complete", "complete_currencies": ["USD"], "events": [],
                    "valid_from": "2024-01-01T00:00:00Z", "valid_to": "2024-02-01T00:00:00Z"}
        p = controls.build_profiles("XAUUSD", calendar, {}, False, period=screen.PERIOD)
        self.assertTrue(p["news+rollover"].coverage_missing)

    def test_real_engine_flattens_before_gap_and_keeps_session_trade_cap(self):
        with TemporaryDirectory() as directory:
            executable = research.build_executable(Path(directory))
            times = np.arange(research.utc_minute("2024-01-02"), research.utc_minute("2024-01-02") + 8)
            first = np.array([0, 2, 5], dtype=np.int32)
            original = (first, np.full(3, 7, dtype=np.int32), np.ones(3, dtype=np.int8),
                        np.ones(3), None, np.full(3, 7, dtype=np.int32))
            profile = controls.Restrictions((((times[0] + 2) * controls.MINUTE,
                                               (times[0] + 4) * controls.MINUTE, "news"),))
            plan = screen.restrict_plan(times, original, profile)
            prices = np.ascontiguousarray(np.tile([2000., 2001., 1900., 1900., 1900., 1900., 1901., 1902.], (4, 1)))
            library = ct.CDLL(str(executable))
            library.replay.argtypes = [ct.c_void_p] * 9 + [ct.c_int32, ct.POINTER(research.FillModel),
                                                        ct.POINTER(research.Result), ct.POINTER(research.Trade)]
            library.replay.restype = None
            study = SimpleNamespace(symbol="XAUUSD", t=times, prices=prices, plan=lambda _: plan,
                                    library=library, price_ptrs=tuple(research.pointer(row) for row in prices))
            variant = research.Variant("trend-momentum", 15, "ny-intraday", .01, 8., 2., 210, max_trades=1)
            result = research.Study.run(study, variant, ("test", "2024-01-02", "2024-01-03"), retain=True)
            self.assertEqual(result["n"], 1)
            self.assertEqual(result["trades"][0]["exit_minute"], int(times[1]))
            self.assertAlmostEqual(result["net_usd"], .34)
            for trade in result["trades"]:
                profile.verify_trade(trade["entry_minute"] * controls.MINUTE,
                                     (trade["exit_minute"] + 1) * controls.MINUTE - 1)


if __name__ == "__main__":
    unittest.main()
