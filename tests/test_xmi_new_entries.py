"""Synthetic pattern direction, causal timing, reset and inventory checks."""
from importlib import import_module
import json
from pathlib import Path
import sys
from types import SimpleNamespace
import unittest

import numpy as np

sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
m=import_module('xmi-session-new-entries');r=m.r
PARAMETERS={'entry-compression':4,'entry-sweep':6,'entry-pullback':2,
            'entry-impulse-reversal':15,'entry-break-retest':6,'entry-band-return':12}


def fixture(rule):
    n=160;c=100+.1*np.sin(np.arange(n));o=c.copy();h=c+.05;low=c-.05
    atr=np.ones(n);rsi=np.full(n,40.);adx=np.full(n,20.)
    if rule=='entry-compression':o[-1]=100;c[-1]=102;h[-1]=102.1;low[-1]=99.9
    if rule=='entry-sweep':o[-1]=100;c[-1]=100;h[-1]=100.1;low[-1]=98.7
    if rule=='entry-pullback':o[-1]=100;c[-1]=103;h[-1]=103.1;low[-1]=99.9;adx[:]=25
    if rule=='entry-impulse-reversal':
        o[-2]=102;c[-2]=98;h[-2]=102.1;low[-2]=97.9;rsi[-2]=30
        o[-1]=98;c[-1]=100.5;h[-1]=100.6;low[-1]=97.9
    if rule=='entry-band-return':o[-1]=99;c[-1]=99.95;h[-1]=100.05;low[-1]=98.8
    if rule=='entry-break-retest':
        o[-3:]=[100,102,100.3];c[-3:]=[102,101,100.9]
        h[-3:]=[102.1,102.1,101];low[-3:]=[99.9,100.1,100.05]
    frame=SimpleNamespace(t=np.arange(n,dtype=np.int64),decision=np.arange(1,n+1,dtype=np.int64),
        next=np.arange(1,n+1,dtype=np.int32),minutes=1,o=o,c=c,h=h,low=low)
    frame.core=lambda:{'atr':atr,'rsi':rsi,'adx':adx}
    frame.ema=lambda length:np.full(n,101.) if length in (10,20) else 99.+.001*np.arange(n)
    frame.higher=lambda other,values:np.ones(n)
    return frame


class NewEntryTests(unittest.TestCase):
    def signals(self,frame,rule,ids=None):
        return m.entry_signals(frame,{15:frame},rule,PARAMETERS[rule],np.ones(len(frame.t)) if ids is None else ids)

    def test_all_six_registered_long_patterns(self):
        for rule in PARAMETERS:
            with self.subTest(rule=rule):self.assertEqual(self.signals(fixture(rule),rule)[-1],1)

    def test_all_six_patterns_mirror_to_short(self):
        for rule in PARAMETERS:
            with self.subTest(rule=rule):
                old=fixture(rule);f=SimpleNamespace(**old.__dict__)
                f.o,f.c,f.h,f.low=200-old.o,200-old.c,200-old.low,200-old.h
                original_core=old.core();f.core=lambda:{'atr':original_core['atr'],'rsi':100-original_core['rsi'],'adx':original_core['adx']}
                f.ema=lambda length:200-old.ema(length)
                f.higher=lambda other,values:-np.ones(len(f.t))
                self.assertEqual(self.signals(f,rule)[-1],-1)

    def test_retest_does_not_signal_on_the_break_bar(self):
        rule='entry-break-retest';f=fixture(rule)
        values=self.signals(f,rule)
        self.assertEqual(values[-3],0)
        self.assertEqual(values[-1],1)

    def test_retest_cannot_cross_session_identity(self):
        rule='entry-break-retest';f=fixture(rule);ids=np.ones(len(f.t));ids[-2:]=2
        self.assertEqual(self.signals(f,rule,ids)[-1],0)

    def test_intervening_invalidating_close_cancels_retest(self):
        rule='entry-break-retest';f=fixture(rule)
        f.c[-2]=99.5;f.low[-2]=99.4
        self.assertEqual(self.signals(f,rule)[-1],0)

    def test_gap_resets_the_contiguous_history_guard(self):
        rule='entry-compression';f=fixture(rule)
        self.assertEqual(self.signals(f,rule)[-1],1)
        f.t[-1]+=10
        self.assertEqual(self.signals(f,rule)[-1],0)

    def test_future_prices_cannot_change_past_closed_signals(self):
        n=2400;times=np.arange(n,dtype=np.int64)
        c=100+.003*np.arange(n)+.9*np.sin(np.arange(n)/9)+.35*np.sin(np.arange(n)/2)
        o=np.r_[c[0],c[:-1]];prices=np.array([o,np.maximum(o,c)+.08,np.minimum(o,c)-.08,c])
        changed=prices.copy();changed[:,1800:]*=1.3
        def frames(data):return {t:r.Frame(times,data,t) for t in (1,5,15)}
        a,b=frames(prices),frames(changed)
        for rule,param in PARAMETERS.items():
            for minutes in (1,5):
                with self.subTest(rule=rule,minutes=minutes):
                    f,g=a[minutes],b[minutes];ids=np.arange(len(f.t))//50
                    left=m.entry_signals(f,a,rule,param,ids);right=m.entry_signals(g,b,rule,param,ids)
                    np.testing.assert_array_equal(left[f.decision<=1800],right[g.decision<=1800])

    def test_plan_fills_only_at_the_next_minute_after_close(self):
        rule='entry-compression';f=fixture(rule);study=m.EntryStudy.__new__(m.EntryStudy)
        study.t=np.arange(161,dtype=np.int64);study.frames={1:f,15:f}
        study.sessions={'ny-open':SimpleNamespace(begin=np.zeros(161,dtype=np.int32),end=np.full(161,160,dtype=np.int32))}
        study.restrictions=m.scalp.screen.controls.Restrictions(())
        variant=r.Variant(rule,1,'ny-open',.0025,1.5,1,5,4)
        plan=study.plan(variant)
        self.assertEqual(plan[0][-1],160)
        self.assertEqual(study.t[plan[0][-1]],f.decision[-1])
        self.assertEqual(plan[2][-1],1)

    def test_inventory_is_unique_and_bounded(self):
        catalog=json.loads((m.ROOT/'docs/xmi-new-scalp-entry-catalog-20261107.json').read_text())
        variants=list(m.variants(catalog))
        self.assertEqual(len(variants),864)
        self.assertEqual(len(set(variants)),864)
        self.assertTrue(all(v.minutes in (1,5) and v.hold_minutes<=15 for v in variants))

    def test_unregistered_family_is_rejected(self):
        f=fixture('entry-compression')
        with self.assertRaises(ValueError):m.entry_signals(f,{15:f},'entry-unknown',4)


if __name__=='__main__':unittest.main()
