"""Offline-only tests; never imports the actual MetaTrader5 package."""
import unittest
from datetime import datetime, timezone
from types import SimpleNamespace
from scripts.mt5_readonly_terminal import ReadOnlyMT5, MT5ReadError, validate_window

UTC = timezone.utc
def d(y,m=1,day=1): return datetime(y,m,day,tzinfo=UTC)

class FakeSDK:
    TIMEFRAME_M1 = 1
    COPY_TICKS_ALL = 0
    def __init__(self): self.calls=[]
    def initialize(self): self.calls.append("initialize"); return True
    def shutdown(self): self.calls.append("shutdown")
    def terminal_info(self): return SimpleNamespace(connected=True,trade_allowed=True)
    def account_info(self): return SimpleNamespace(currency="USD",leverage=500,balance=1000,equity=999)
    def symbol_info(self,s): return SimpleNamespace(name=s,point=0.00001,volume_min=0.01,volume_step=0.01)
    def copy_rates_range(self,*args):
        self.calls.append("rates")
        return [{"time":int(d(2024).timestamp()),"open":1.1,"high":1.2,"low":1.0,"close":1.15}]
    def copy_ticks_range(self,*args):
        self.calls.append("ticks")
        return [{"time_msc":int(d(2024).timestamp()*1000),"bid":1.1,"ask":1.1001}]
    def symbol_info_tick(self,s): return SimpleNamespace(time_msc=123,bid=1.1,ask=1.2)
    def positions_get(self): return []
    def orders_get(self): return []
    def history_deals_get(self,*args): return []

class Tests(unittest.TestCase):
    def test_sealed_year_fails_before_sdk(self):
        sdk=FakeSDK()
        with ReadOnlyMT5(sdk) as mt5:
            with self.assertRaisesRegex(MT5ReadError,"MT5_UNAPPROVED_RESEARCH_YEAR"):
                mt5.rates("EURUSD","M1",d(2024,12,31),d(2026,1,2))
            with self.assertRaisesRegex(MT5ReadError,"MT5_UNAPPROVED_RESEARCH_YEAR"):
                mt5.ticks("EURUSD",d(2025),d(2025,1,2))
        self.assertNotIn("rates",sdk.calls)
        self.assertNotIn("ticks",sdk.calls)
    def test_no_implicit_connection(self):
        sdk=FakeSDK(); reader=ReadOnlyMT5(sdk)
        with self.assertRaisesRegex(MT5ReadError,"MT5_NOT_CONNECTED"): reader.account_snapshot()
        self.assertEqual(sdk.calls,[])
    def test_reads_and_close(self):
        sdk=FakeSDK()
        with ReadOnlyMT5(sdk) as reader:
            self.assertEqual(reader.account_snapshot()["currency"],"USD")
            self.assertEqual(reader.symbol_snapshot("EURUSD")["volume_min"],0.01)
            self.assertEqual(len(reader.rates("EURUSD","M1",d(2024),d(2024,1,2))),1)
            self.assertEqual(len(reader.ticks("EURUSD",d(2024),d(2024,1,2))),1)
        self.assertEqual(sdk.calls[-1],"shutdown")
        self.assertFalse(hasattr(reader,"order_send"))
    def test_utc_and_window_limits(self):
        with self.assertRaises(MT5ReadError): validate_window(datetime(2024,1,1),d(2024,1,2))
        with self.assertRaises(MT5ReadError): validate_window(d(2024),d(2024,3,1))
    def test_symbol_fail_closed(self):
        sdk=FakeSDK()
        with ReadOnlyMT5(sdk) as reader:
            with self.assertRaisesRegex(MT5ReadError,"MT5_INVALID_SYMBOL"):
                reader.symbol_snapshot("../secrets")
    def test_out_of_window_rate_rejected(self):
        class Bad(FakeSDK):
            def copy_rates_range(self,*args): return [{"time":int(d(2026).timestamp())}]
        with ReadOnlyMT5(Bad()) as reader:
            with self.assertRaisesRegex(MT5ReadError,"MT5_RATE_OUTSIDE_WINDOW"):
                reader.rates("EURUSD","M1",d(2024),d(2024,1,2))

if __name__=="__main__": unittest.main()
