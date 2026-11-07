"""Lot/cash conversion, variable margin, fixed sizing and legacy parity."""
from dataclasses import replace
from importlib import import_module
from pathlib import Path
import sys
import unittest

import numpy as np

sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
m = import_module('xmi-session-lot-rerun')
base = import_module('test_xmi_scalping')
r = m.r
PROFILE = {'id':'zero_commission','commission_usd_per_unit_side':0,'fx_leverage':500,
           'gold_leverage':200,'gold_spread_price':.45}


class LotRerunTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        base.ScalpExecutionTests.setUpClass()
        cls.fixture = base.ScalpExecutionTests('test_all_registered_clock_caps')

    @classmethod
    def tearDownClass(cls):
        base.ScalpExecutionTests.tearDownClass()

    def study(self,**kwargs):
        source = self.fixture.study(**kwargs)
        study = m.LotStudy.__new__(m.LotStudy)
        study.__dict__.update(source.__dict__)
        return study

    def variant(self):
        return r.Variant('ema-trend',1,'ny-intraday',.005,1.5,1.,5,max_trades=1)

    def run_lot(self,study,profile=PROFILE,threshold=0,stress=1.,fixed=False,variant=None):
        return study.run_lot(variant or self.variant(),('test','2024-01-02','2024-01-03'),profile,threshold,stress,fixed)

    def test_model_removes_commission_and_sets_lot_steps(self):
        for symbol,size,lev in [('EURUSD',1000,500),('USDJPY',1000,500),('XAUUSD',1,200)]:
            model=m.execution_model(symbol,self.variant(),PROFILE,1.)
            self.assertEqual(model.commission_per_unit_side,0)
            self.assertEqual(model.unit_step,size)
            self.assertEqual(model.leverage,lev)

    def test_legacy_metrics_and_raw_hash_match_frozen_wrapper(self):
        study=self.study()
        expected,trades=m.scalp.ScalpStudy.run_scalp(study,self.variant(),('test','2024-01-02','2024-01-03'),1.)
        actual,logs=self.run_lot(study,profile={'id':'legacy'})
        self.assertEqual(actual['metrics'],expected['metrics'])
        self.assertEqual(actual['audits'],expected['audits'])
        self.assertEqual(actual['raw_trade_ledger_sha256'],r.digest(trades))
        self.assertEqual(logs[0]['size_lots'],trades[0]['units']/100)

    def test_fixed_lot_has_no_upsizing_and_accounts_restart_at_1000(self):
        study=self.study()
        _,dynamic=self.run_lot(study)
        _,fixed=self.run_lot(study,fixed=True)
        self.assertEqual(dynamic[0]['size_lots'],.02)
        self.assertEqual(fixed[0]['size_lots'],.01)
        self.assertEqual(dynamic[0]['cash_equity_before_usd'],1000)
        self.assertEqual(fixed[0]['cash_equity_before_usd'],1000)

    def test_cash_margin_changes_with_historical_price(self):
        margins=[]
        for price in (2000.,4000.):
            _,logs=self.run_lot(self.study(prices=np.tile(np.full(20,price),(4,1))),fixed=True)
            margins.append(logs[0]['margin_usd'])
        self.assertAlmostEqual(margins[1]-margins[0],10.)
        self.assertNotEqual(margins[0],20.35)

    def test_displayed_scale_is_consistent_with_approximate_margin(self):
        _,logs=self.run_lot(self.study(prices=np.tile(np.full(20,4070.),(4,1))),fixed=True)
        self.assertEqual(round(logs[0]['margin_usd'],2),20.35)

    def test_usd_base_pnl_margin_and_lots_are_converted_independently(self):
        study=self.study(prices=np.tile([150.,150.01,150.02,150.03,150.04],(4,1)),atr=.1)
        study.symbol='USDJPY'
        _,logs=self.run_lot(study,fixed=True)
        trade=logs[0]
        self.assertEqual(trade['size_lots'],.01)
        self.assertAlmostEqual(trade['margin_usd'],2.)
        self.assertAlmostEqual(trade['pnl_usd'],1000*((150.04-150.-.026)/150.04))

    def test_high_cost_minimum_lot_is_skipped_without_forcing_risk(self):
        profile={**PROFILE,'id':'gold_high_spread','gold_spread_price':1.72}
        result,logs=self.run_lot(self.study(atr=2.5),profile=profile,threshold=2,fixed=True)
        self.assertEqual(result['rejected_cost_signal_rows'],0)
        self.assertEqual(result['metrics']['minimum_size_skips'],1)
        self.assertEqual(logs,[])

    def test_fixed_size_still_obeys_lower_risk_ceiling(self):
        result,logs=self.run_lot(self.study(atr=2.),fixed=True,variant=replace(self.variant(),risk=.0025))
        self.assertEqual(logs,[])
        self.assertEqual(result['metrics']['minimum_size_skips'],1)

    def test_stressed_cost_filter_uses_zero_commission_model(self):
        allowed,_=self.run_lot(self.study(),threshold=2)
        blocked,_=self.run_lot(self.study(),threshold=2,stress=1.5)
        self.assertEqual(allowed['metrics']['n'],1)
        self.assertEqual(blocked['metrics']['n'],0)

    def test_lot_reporting_preserves_hard_clock_cap_across_gap(self):
        study=self.study(offsets=[0,1,2,*range(10,27)])
        result,logs=self.run_lot(study,fixed=True)
        self.assertEqual(logs[0]['exit_minute']-logs[0]['entry_minute'],2)
        self.assertLessEqual(result['audits']['maximum_elapsed_holding_upper_bound_minutes'],5)


if __name__=='__main__':unittest.main()
