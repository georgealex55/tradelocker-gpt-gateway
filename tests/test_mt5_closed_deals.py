"""Synthetic-only deal accounting tests; no broker data or mixed-year CSV."""
import hashlib
import json
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from scripts.mt5_closed_deals import import_closed_deals,import_private_files,ClosedDealsError

def records():
    return [
        {"deal_id":"test-1","position_id":"test-pos","time_utc":"2026-01-02T12:00:00Z",
         "entry":"IN","symbol":"EURUSD","currency":"USD","profit":"0",
         "commission":"-0.25","swap":"0","fee":"0"},
        {"deal_id":"test-2","position_id":"test-pos","time_utc":"2026-01-02T13:00:00Z",
         "entry":"OUT","symbol":"EURUSD","currency":"USD","profit":"12.50",
         "commission":"-0.25","swap":"-0.10","fee":"-0.05","reported_net":"12.10"}
    ]
def fixture(rows=None):
    rows=records() if rows is None else rows
    payload=json.dumps(rows,sort_keys=True,separators=(",",":")).encode()
    manifest={"contractVersion":1,"source":"MT5_LOCAL_EXPORT","kind":"deals",
              "readOnly":True,"executionEnabled":False,"timezone":"UTC","currency":"USD",
              "privacy":"sanitized_2026_only","rows":len(rows),
              "window":{"from":"2026-01-02T00:00:00Z","to":"2026-01-03T00:00:00Z"},
              "sha256":hashlib.sha256(payload).hexdigest()}
    return manifest,payload

class Tests(unittest.TestCase):
    def test_decimal_pnl_and_redaction(self):
        m,p=fixture(); result=import_closed_deals(m,p)
        self.assertEqual(result["accounting"]["net"],"11.85")
        self.assertEqual(result["positionGroups"],1)
        self.assertFalse(result["positionsConfirmedClosed"])
        self.assertNotIn("test-pos",json.dumps(result))
    def test_hash_mismatch(self):
        m,p=fixture()
        with self.assertRaisesRegex(ClosedDealsError,"HASH_MISMATCH"):import_closed_deals(m,p+b" ")
    def test_net_mismatch(self):
        rows=records();rows[1]["reported_net"]="12.11"
        with self.assertRaisesRegex(ClosedDealsError,"NET_MISMATCH"):import_closed_deals(*fixture(rows))
    def test_duplicate_deal(self):
        rows=records();rows[1]["deal_id"]="test-1"
        with self.assertRaisesRegex(ClosedDealsError,"DUPLICATE_ID"):import_closed_deals(*fixture(rows))
    def test_2025_window_rejected_before_payload_open(self):
        m,p=fixture();m["window"]["from"]="2025-12-31T00:00:00Z"
        with TemporaryDirectory() as folder:
            path=Path(folder)/"manifest.json";path.write_text(json.dumps(m))
            with self.assertRaisesRegex(ClosedDealsError,"2026_UTC_REQUIRED"):
                import_private_files(path,Path(folder)/"not-created.json")
    def test_2026_outside_window(self):
        rows=records();rows[0]["time_utc"]="2026-01-04T00:00:00Z"
        with self.assertRaisesRegex(ClosedDealsError,"OUTSIDE_WINDOW"):import_closed_deals(*fixture(rows))
    def test_nan_fails_closed(self):
        rows=records();rows[0]["profit"]="NaN"
        with self.assertRaisesRegex(ClosedDealsError,"INVALID_PROFIT"):import_closed_deals(*fixture(rows))
    def test_private_file_roundtrip(self):
        m,p=fixture()
        with TemporaryDirectory() as folder:
            a,b=Path(folder)/"manifest.json",Path(folder)/"deals.json"
            a.write_text(json.dumps(m));b.write_bytes(p)
            self.assertEqual(import_private_files(a,b)["dealCount"],2)

if __name__=="__main__":unittest.main()
