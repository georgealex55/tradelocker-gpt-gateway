"""Diagnostic kernel timing, fill parity and conservative excursion checks."""
import ctypes as ct
from importlib import import_module
import json
from pathlib import Path
import sys
from tempfile import TemporaryDirectory
from types import SimpleNamespace
import unittest

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
module = import_module('xmi-session-entry-exit')
r = module.research


class EntryExitKernelTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = TemporaryDirectory()
        cls.library = ct.CDLL(str(module.build_kernel(Path(cls.temp.name))))
        module.configure_kernel(cls.library)
        cls.library.replay.argtypes = [ct.c_void_p] * 9 + [ct.c_int32, ct.POINTER(r.FillModel), ct.POINTER(r.Result), ct.POINTER(r.Trade)]
        cls.library.replay.restype = None

    @classmethod
    def tearDownClass(cls):
        cls.temp.cleanup()

    def replay(self, prices, *, entries=(0,), sides=None, allowed=None, invalid=None,
               cooldown=0, times=None, flip=0, original=False, usd_base=False):
        prices = np.ascontiguousarray(prices, dtype=np.float64)
        n = prices.shape[1]
        entries = np.ascontiguousarray(entries, dtype=np.int32)
        count = len(entries)
        side = np.ascontiguousarray(sides or [1] * count, dtype=np.int8)
        ends = np.full(count, n - 1, dtype=np.int32)
        limits = ends.copy()
        distances = np.full(count, .1 if usd_base else 8., dtype=np.float64)
        allowed = np.asarray([1] * count if allowed is None else allowed, dtype=np.int8)
        invalid = np.asarray([-1] * count if invalid is None else invalid, dtype=np.int32)
        times = np.asarray(list(range(n)) if times is None else times, dtype=np.int64)
        model = r.FillModel(.01, .02 if usd_base else .45, .003 if usd_base else .07,
                            .000035 if usd_base else .035, 1000 if usd_base else 1.,
                            30 if usd_base else 20, 2., 1000 if usd_base else 1., .5, 1000, 10,
                            int(usd_base), 0, flip)
        result, log = r.Result(), (r.Trade * count)()
        counters = np.zeros(3, dtype=np.int64)
        pp = [r.pointer(x) for x in prices]
        if original:
            self.library.replay(*pp, r.pointer(entries), r.pointer(ends), r.pointer(side), r.pointer(distances),
                                r.pointer(limits), count, ct.byref(model), ct.byref(result), log)
        else:
            self.library.replay_diagnostic(*pp, r.pointer(times), r.pointer(entries), r.pointer(ends), r.pointer(side),
                r.pointer(distances), r.pointer(limits), r.pointer(allowed), r.pointer(invalid), count,
                ct.byref(model), cooldown, ct.byref(result), log, r.pointer(counters))
        trades = [{field: getattr(t, field) for field, _ in r.Trade._fields_} for t in log[:int(result.trade_count)]]
        return r.metrics(result), trades, counters.tolist()

    def test_disabled_diagnostics_reproduce_original_in_both_currency_bases(self):
        for usd in (False, True):
            price = np.tile([140., 140.02, 140.03, 139.99, 140.01, 140.02], (4, 1)) if usd else np.tile([2000., 2001., 2002., 2000., 2001., 2002.], (4, 1))
            options = dict(entries=(0, 2, 4), sides=[1, -1, 1], flip=1, usd_base=usd)
            old = self.replay(price, original=True, **options)
            new = self.replay(price, **options)
            self.assertEqual(new[:2], old[:2])

    def test_invalidation_fills_at_open_without_using_later_bar_range(self):
        prices = [[2000., 2001., 2002.], [2000., 3000., 2002.], [2000., 1000., 2002.], [2000., 1900., 2002.]]
        metrics, trades, counters = self.replay(prices, invalid=[1])
        self.assertEqual(trades[0]['reason'], 6)
        self.assertEqual(trades[0]['exit'], 1)
        self.assertAlmostEqual(metrics['net_usd'], .34)
        self.assertLess(metrics['max_drawdown'], .001)
        self.assertEqual(counters[2], 1)

    def test_stop_gap_precedes_pending_invalidation(self):
        prices = np.tile([2000., 1900., 1900.], (4, 1))
        metrics, trades, counters = self.replay(prices, invalid=[1])
        self.assertEqual(trades[0]['reason'], 1)
        self.assertAlmostEqual(metrics['net_usd'], -100.66)
        self.assertEqual(counters[2], 0)

    def test_favorable_gap_remains_capped_at_target(self):
        prices = np.tile([2000., 2030., 2030.], (4, 1))
        metrics, trades, _ = self.replay(prices, invalid=[1])
        self.assertEqual(trades[0]['reason'], 2)
        self.assertAlmostEqual(metrics['net_usd'], 15.34)

    def test_entry_filter_preserves_original_opposite_signal_exit(self):
        prices = np.tile([2000., 2001., 2002., 2002.], (4, 1))
        metrics, trades, _ = self.replay(prices, entries=(0, 2), sides=[1, -1], allowed=[1, 0], flip=1)
        self.assertEqual(metrics['n'], 1)
        self.assertEqual(trades[0]['reason'], 5)
        self.assertEqual(trades[0]['exit'], 1)

    def test_stop_cooldown_uses_clock_minutes_across_missing_rows(self):
        prices = np.tile([2000., 2000., 2000., 2000.], (4, 1)); prices[2, 0] = 1991.
        metrics, trades, counters = self.replay(prices, entries=(0, 1, 2), cooldown=30, times=[0, 30, 31, 32])
        self.assertEqual(metrics['n'], 2)
        self.assertEqual(trades[1]['entry'], 2)
        self.assertEqual(counters[1], 1)

    def test_target_exit_does_not_start_stop_cooldown(self):
        prices = np.tile([2000., 2000.], (4, 1)); prices[1, 0] = 2017.
        metrics, _, counters = self.replay(prices, entries=(0, 1), cooldown=30)
        self.assertEqual(metrics['n'], 2)
        self.assertEqual(counters[1], 0)


class ExcursionTests(unittest.TestCase):
    def fixture(self, pnl=-5., reason=1):
        frame = SimpleNamespace(decision=np.array([100]), c=np.array([100.]), ema=lambda _: np.array([100.]),
                                core=lambda: {'atr': np.array([1.])})
        study = SimpleNamespace(t=np.array([100, 101, 102]), frames={15: frame},
            prices=np.array([[100., 100., 100.], [100., 101., 150.], [100., 99., 90.], [100., 100., 95.]]))
        trade = {'entry_minute':100,'exit_minute':102,'pnl_usd':pnl,'r':-1.,'units':1.,'cost_usd':0.,'side':1,'exit_reason':reason}
        return study, SimpleNamespace(stop_atr=5.), [trade]

    def test_unknown_stop_bar_range_cannot_create_past_profits(self):
        records = module.excursions(*self.fixture())
        self.assertAlmostEqual(records[0]['mfe_price_r'], .2)
        self.assertAlmostEqual(records[0]['mae_price_r'], 1.)
        self.assertEqual(module.excursion_summary(records)['losers_with_observed_mfe_at_least_one_r'], 0)
        json.dumps(module.excursion_summary(records), allow_nan=False)

    def test_known_target_endpoint_is_kept_without_exit_bar_range(self):
        records = module.excursions(*self.fixture(10., 2))
        self.assertAlmostEqual(records[0]['mfe_price_r'], 2.)
        self.assertAlmostEqual(records[0]['mae_price_r'], .2)

    def test_invalidation_must_be_from_a_later_closed_candle(self):
        frame = SimpleNamespace(c=np.array([100., 99., 101.]), ema=lambda _: np.array([100., 100., 100.]),
                                next=np.array([0, 1, 2]), decision=np.array([10, 25, 40]))
        exits = module.next_invalidations(np.array([10, 25, 40]), frame, np.array([0, 1, 0]), np.array([1, 1, -1]))
        np.testing.assert_array_equal(exits, [1, -1, 2])


if __name__ == '__main__':
    unittest.main()
