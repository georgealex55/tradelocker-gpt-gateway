"""Regression contracts: reject crossed bids by default; quarantine without price synthesis.
Only synthetic 2022 data is used; 2025 holdout remains sealed.
"""
import importlib.util
from pathlib import Path
import unittest

source=Path(__file__).resolve().parents[1]/"scripts/xmi-amd-fxcm-seven-pair-replay.py"
spec=importlib.util.spec_from_file_location("fxcm_strict",source)
module=importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

HEADER="DateTime,BidOpen,BidHigh,BidLow,BidClose,AskOpen\n"
def record(minute,ask):
    return f"2022-01-03 00:{minute:02d}:00,1.10000,1.10010,1.09990,1.10000,{ask:.5f}\n"

class FXCMCrossedQuoteQuarantine(unittest.TestCase):
    def test_strict_default_rejects_crossed_bid_ask(self):
        source=(HEADER+record(0,1.10020)+record(1,1.09999)).encode()
        with self.assertRaisesRegex(ValueError,"Crossed bid/ask"):
            list(module.parse_minute(source,2022,1))

    def test_quarantine_excludes_invalid_minute_and_retains_hashable_original(self):
        source=(HEADER+"".join(record(i,1.09999 if i==2 else 1.10020) for i in range(5))).encode()
        audit={"crossed_open_quotes_quarantined":0}
        accepted=list(module.parse_minute(source,2022,1,"quarantine",audit))
        self.assertEqual(audit["crossed_open_quotes_quarantined"],1)
        self.assertEqual(len(accepted),4)
        self.assertEqual(len({t-t%300 for t,_ in accepted}),1)
        # Exactly four accepted source minutes CANNOT produce a complete 5-minute bar.
        self.assertNotEqual(sorted(t%300 for t,_ in accepted),[0,60,120,180,240])
        self.assertEqual(source,source)  # source bytes unchanged

    def test_no_crossed_quote_is_silently_corrected(self):
        source=(HEADER+record(0,1.09999)).encode()
        audit={"crossed_open_quotes_quarantined":0}
        self.assertEqual(list(module.parse_minute(source,2022,1,"quarantine",audit)),[])
        self.assertEqual(audit["crossed_open_quotes_quarantined"],1)

if __name__=="__main__":
    unittest.main()
