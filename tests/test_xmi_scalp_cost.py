"""Cost/target conversion, causal rejection and unchanged scalp execution."""
from contextlib import contextmanager
from importlib import import_module
from pathlib import Path
import sys
import unittest
from unittest.mock import patch

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
m = import_module('xmi-session-scalp-cost')
base = import_module('test_xmi_scalping')
r = m.r


class CostFilterTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        base.ScalpExecutionTests.setUpClass()
        cls.fixture = base.ScalpExecutionTests('test_all_registered_clock_caps')

    @classmethod
    def tearDownClass(cls):
        base.ScalpExecutionTests.tearDownClass()

    @contextmanager
    def study(self, **kwargs):
        source = self.fixture.study(**kwargs)
        plan = source.plan(None)
        study = m.CostStudy.__new__(m.CostStudy)
        study.__dict__.update(source.__dict__)
        del study.__dict__['plan']
        with patch.object(m.scalp.ScalpStudy, 'plan', return_value=plan):
            yield study

    def variant(self):
        return r.Variant('ema-trend', 1, 'ny-intraday', .005, 1.5, 1., 5, max_trades=1)

    def run_filtered(self, study, threshold, stress=1.):
        return study.run_filtered(self.variant(), ('test', '2024-01-02', '2024-01-03'), threshold, stress)

    def test_gold_cost_includes_both_commissions_and_slippage(self):
        model = r.money_model('XAUUSD', self.variant(), 1., 1.)
        value = float(m.target_cost_ratio(2000., 1.5, 1, model))
        self.assertAlmostEqual(value, 1.5 / .66)

    def test_usd_base_target_conversion_is_exact_for_both_directions(self):
        model = r.money_model('USDJPY', self.variant(), 1., 1.)
        for side in (-1, 1):
            target = 150. + side * .1
            independent_ratio = (.1 / target) / (.026 / target + .00007)
            self.assertAlmostEqual(float(m.target_cost_ratio(150., .1, side, model)), independent_ratio)

    def test_usd_quoted_fx_commission_is_already_in_quote_currency(self):
        model = r.money_model('EURUSD', self.variant(), 1., 1.)
        self.assertAlmostEqual(float(m.target_cost_ratio(1.1, .001, -1, model)), .001 / .00033)

    def test_threshold_boundary_and_invalid_inputs(self):
        np.testing.assert_array_equal(m.cost_allowed(np.array([1.99, 2., 2.01, np.nan]), 2), [False, True, True, False])
        with self.assertRaises(ValueError):
            m.cost_allowed(np.array([10.]), 4)
        model = r.money_model('XAUUSD', self.variant(), 1., 1.)
        self.assertTrue(np.isnan(m.target_cost_ratio(2000., -1., 1, model)))

    def test_filter_zero_matches_original_metrics_and_ledgers(self):
        with self.study() as study:
            original, logs = m.scalp.ScalpStudy.run_scalp(study, self.variant(), ('test', '2024-01-02', '2024-01-03'), 1.)
            actual, trades = self.run_filtered(study, 0)
        self.assertTrue(m.matched_original(actual, original))
        self.assertEqual(trades, logs)

    def test_filter_rejects_entry_without_changing_costs_or_targets(self):
        with self.study() as study:
            base_result, base_trades = self.run_filtered(study, 0)
            permitted, same_trades = self.run_filtered(study, 2)
            rejected, no_trades = self.run_filtered(study, 3)
        self.assertEqual(base_trades, same_trades)
        self.assertEqual(base_result['metrics'], permitted['metrics'])
        self.assertEqual(rejected['metrics']['net_usd'], 0)
        self.assertEqual(rejected['entry_filter']['rejected_signal_rows'], 1)
        self.assertEqual(no_trades, [])

    def test_stress_recomputes_filter_without_multiplying_commission(self):
        with self.study(atr=2.) as study:
            allowed, _ = self.run_filtered(study, 3, 1.)
            blocked, _ = self.run_filtered(study, 3, 2.)
        self.assertEqual(allowed['metrics']['n'], 1)
        self.assertEqual(blocked['metrics']['n'], 0)
        model = r.money_model('XAUUSD', self.variant(), 2., 1.)
        self.assertAlmostEqual(float(m.target_cost_ratio(2000., 3., 1, model)), 3. / 1.25)

    def test_signal_rows_and_session_trade_cap_survive_filter(self):
        with self.study(entries=(0, 7, 14), atr=2.) as study:
            result, trades = self.run_filtered(study, 3)
        self.assertEqual(result['entry_filter']['closed_signals_in_fold'], 3)
        self.assertEqual(len(trades), 1)

    def test_future_path_changes_do_not_change_entry_ratio_or_eligibility(self):
        prices = np.tile(np.full(20, 2000.), (4, 1))
        with self.study(prices=prices) as study:
            first, _ = self.run_filtered(study, 2)
        prices[:, 1:] = 1990.
        with self.study(prices=prices) as study:
            changed, _ = self.run_filtered(study, 2)
        self.assertNotEqual(first['metrics']['net_usd'], changed['metrics']['net_usd'])
        self.assertEqual(first['entry_filter'], changed['entry_filter'])

    def test_flat_filtered_account_does_not_pass_profit_or_sample_gates(self):
        with self.study() as study:
            result, _ = self.run_filtered(study, 5)
        costs = {str(cost): {'aggregate': m.scalp.refinement.aggregate([result['metrics'], result['metrics']])}
                 for cost in m.scalp.COSTS}
        gates = m.scalp.numeric_gates(costs)
        self.assertFalse(gates['positive_expectancy'])
        self.assertFalse(gates['at_least_200_distinct_completed_trades'])
        self.assertFalse(gates['stressed_costs'])


if __name__ == '__main__':
    unittest.main()
