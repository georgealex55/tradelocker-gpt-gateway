"""Strict scalp clock caps, causal features, capital and frozen selection."""
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
m = import_module('xmi-session-scalping')
r = m.r


class ScalpExecutionTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = TemporaryDirectory()
        cls.library = ct.CDLL(str(r.build_executable(Path(cls.temp.name))))
        cls.library.replay.argtypes = [ct.c_void_p] * 9 + [ct.c_int32, ct.POINTER(r.FillModel),
            ct.POINTER(r.Result), ct.POINTER(r.Trade)]
        cls.library.replay.restype = None

    @classmethod
    def tearDownClass(cls):
        cls.temp.cleanup()

    def study(self, prices=None, offsets=None, entries=(0,), directions=None, atr=1.):
        s = m.ScalpStudy.__new__(m.ScalpStudy)
        s.symbol, s.library = 'XAUUSD', self.library
        prices = np.tile(np.full(20, 2000.), (4, 1)) if prices is None else prices
        s.prices = np.ascontiguousarray(prices, dtype=np.float64)
        n = s.prices.shape[1]
        s.t = np.asarray(r.utc_minute('2024-01-02') + np.array(list(range(n)) if offsets is None else offsets), dtype=np.int64)
        s.price_ptrs = tuple(r.pointer(x) for x in s.prices)
        s.restrictions = m.screen.controls.Restrictions(())
        s.frames = {1: SimpleNamespace(t=s.t - 1, decision=s.t)}
        ends = np.full(len(entries), n - 1, dtype=np.int32)
        plan = (np.asarray(entries, dtype=np.int32), ends,
                np.asarray(directions or [1] * len(entries), dtype=np.int8),
                np.full(len(entries), atr), None, ends.copy())
        s.plan = lambda _: plan
        s.sessions = {'ny-intraday': SimpleNamespace(end=np.full(n, n - 1, dtype=np.int32))}
        return s

    def run_case(self, study, hold=5):
        variant = r.Variant('ema-trend', 1, 'ny-intraday', .005, 1.5, 1., hold, max_trades=1)
        return study.run_scalp(variant, ('test', '2024-01-02', '2024-01-03'), 1.)

    def test_all_registered_clock_caps(self):
        for cap in (5, 10, 15):
            result, trades = self.run_case(self.study(), cap)
            self.assertEqual(result['metrics']['n'], 1)
            self.assertEqual(trades[0]['exit_minute'] + 1 - trades[0]['entry_minute'], cap)

    def test_gap_cannot_extend_clock_hold(self):
        result, trades = self.run_case(self.study(offsets=[0, 1, 2, *range(10, 27)]))
        self.assertEqual(trades[0]['exit_minute'] - trades[0]['entry_minute'], 2)
        self.assertEqual(result['audits']['maximum_elapsed_holding_upper_bound_minutes'], 3)

    def test_opposite_signal_never_exits_at_same_close(self):
        result, trades = self.run_case(self.study(entries=(0, 2), directions=[1, -1]))
        self.assertEqual(trades[0]['exit_reason'], 3)
        self.assertEqual(result['metrics']['opposite_signal_exits'], 0)
        self.assertEqual(trades[0]['exit_minute'] - trades[0]['entry_minute'], 4)

    def test_minimum_ounce_is_skipped(self):
        result, trades = self.run_case(self.study(atr=100.))
        self.assertEqual(trades, [])
        self.assertEqual(result['metrics']['minimum_size_skips'], 1)

    def test_extreme_gap_invalidates_margin_path(self):
        prices = np.tile([2000., 1000., 1000., 1000., 1000.], (4, 1))
        result, trades = self.run_case(self.study(prices))
        self.assertEqual(trades[0]['exit_reason'], 1)
        self.assertEqual(result['audits']['liquidation_audit_breaches'], 1)
        self.assertTrue(result['audits']['bankrupt'])

    def test_usd_base_cost_and_profit_conversion(self):
        prices = np.tile([150., 150.01, 150.02, 150.03, 150.04], (4, 1))
        study = self.study(prices, atr=.1)
        study.symbol = 'USDJPY'
        _, trades = self.run_case(study)
        trade = trades[0]
        expected = trade['units'] * ((150.04 - 150. - .026) / 150.04 - .00007)
        self.assertAlmostEqual(trade['pnl_usd'], expected)
        self.assertEqual(trade['units'] % 1000, 0)

    def test_news_cutoff_precedes_holding_cap(self):
        study = self.study()
        profile = m.screen.controls.Restrictions((((study.t[0] + 3) * 60000, (study.t[0] + 5) * 60000, 'news'),))
        plan = m.screen.restrict_plan(study.t, study.plan(None), profile)
        study.plan, study.restrictions = lambda _: plan, profile
        _, trades = self.run_case(study)
        self.assertEqual(trades[0]['exit_minute'] - trades[0]['entry_minute'], 2)

    def test_non_scalp_hold_is_rejected(self):
        with self.assertRaises(ValueError):
            self.run_case(self.study(), 210)


class CausalityAndSelectionTests(unittest.TestCase):
    def test_future_prices_do_not_change_entry_features(self):
        times = np.arange(70, dtype=np.int64) + r.utc_minute('2022-01-03')
        prices = np.tile(2000. + np.sin(np.arange(70)), (4, 1))
        prices[1] += .5
        prices[2] -= .5
        trade = {'entry_minute': int(times[40]), 'exit_minute': int(times[43]),
                 'units': 1., 'side': 1, 'pnl_usd': 1., 'cost_usd': .66}
        variant = r.Variant('trend-momentum', 1, 'ny-intraday', .005, 1.5, 1, 5)
        def features(data):
            return m.entry_features(SimpleNamespace(frames={1: r.Frame(times, data, 1)}), variant, [trade], (1, 4))
        original = features(prices)
        prices[:, 40:] *= 2
        self.assertEqual(original, features(prices))

    def test_exact_threshold_boundaries_are_deterministic(self):
        self.assertEqual(m.scalar_group(20, (20, 25), ('low', 'mid', 'high')), 'mid')
        self.assertEqual(m.scalar_group(25, (20, 25), ('low', 'mid', 'high')), 'high')
        self.assertEqual(m.scalar_group(float('nan'), (20, 25), ('low', 'mid', 'high')), 'unavailable')

    def test_inventory_is_bounded_and_unique(self):
        catalog = json.loads((m.ROOT / 'docs/xmi-scalping-catalog-20261107.json').read_text())
        entries = list(m.variants(catalog))
        self.assertEqual(len(entries), 504)
        self.assertEqual(len(set(entries)), 504)
        self.assertTrue(all(v.minutes in (1, 5) and v.hold_minutes <= 15 for v in entries))

    def test_margin_breach_rejects_training_selection(self):
        requirements = {'minimum_completed_trades': 25, 'net_pnl_strictly_above_usd': 0,
                        'profit_factor_strictly_above': 1.05, 'max_equity_drawdown_strictly_below': .1}
        good = {'metrics': {'n': 200, 'net_usd': 10, 'profit_factor': 1.6, 'max_drawdown': .05, 'halted': False},
                'audits': {'bankrupt': False, 'liquidation_audit_breaches': 0}}
        row = {'training': {str(cost): [good, good] for cost in m.COSTS}}
        self.assertTrue(m.candidate_score(row, requirements)[0])
        good['audits']['liquidation_audit_breaches'] = 1
        self.assertFalse(m.candidate_score(row, requirements)[0])


if __name__ == '__main__':
    unittest.main()
