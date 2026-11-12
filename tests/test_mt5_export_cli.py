"""Synthetic-only export tests. No MetaTrader5 SDK import or real terminal required."""
import hashlib
import json
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import Mock

from scripts.mt5_export_cli import export_local, parse_utc, _payload
from scripts.mt5_readonly_terminal import MT5ReadError

UTC = timezone.utc
START = datetime(2024, 1, 2, tzinfo=UTC)
END = datetime(2024, 1, 2, 1, tzinfo=UTC)


class ExportTests(unittest.TestCase):
    def _reader(self):
        r = Mock()
        r.rates.return_value = [{"time": int(START.timestamp()), "open": 1.1,
                                 "high": 1.2, "low": 1.0, "close": 1.15}]
        r.ticks.return_value = [{"time_msc": int(START.timestamp()*1000),
                                 "bid": 1.1, "ask": 1.1001}]
        return r

    def _run(self, reader, directory, **kwargs):
        return export_local(reader=reader, kind=kwargs.pop("kind", "bars"),
                            symbol=kwargs.pop("symbol", "EURUSD"),
                            start=kwargs.pop("start", START),
                            end=kwargs.pop("end", END),
                            out_dir=Path(directory), exported_at=START, **kwargs)

    def test_bars_manifest_matches_exact_bytes(self):
        with tempfile.TemporaryDirectory() as d:
            r = self._reader()
            result = self._run(r, d)
            payload = Path(result["payloadPath"]).read_bytes()
            manifest = json.loads(Path(result["manifestPath"]).read_text())
            self.assertEqual(hashlib.sha256(payload).hexdigest(), manifest["sha256"])
            self.assertEqual(manifest["source"], "MT5_LOCAL_EXPORT")
            self.assertEqual(manifest["rows"], 1)
            self.assertTrue(manifest["readOnly"])
            self.assertFalse(manifest["executionEnabled"])
            r.rates.assert_called_once()
            r.ticks.assert_not_called()

    def test_ticks_and_no_overwrite(self):
        with tempfile.TemporaryDirectory() as d:
            r = self._reader()
            self._run(r, d, kind="ticks")
            with self.assertRaisesRegex(MT5ReadError, "ALREADY_EXISTS"):
                self._run(r, d, kind="ticks")
            self.assertEqual(len(list(Path(d).glob("*.json"))), 2)

    def test_sealed_year_never_calls_reader(self):
        with tempfile.TemporaryDirectory() as d:
            r = self._reader()
            with self.assertRaisesRegex(MT5ReadError, "UNAPPROVED_RESEARCH_YEAR"):
                self._run(r, d, start=datetime(2025, 1, 1, tzinfo=UTC),
                          end=datetime(2025, 1, 2, tzinfo=UTC))
            r.rates.assert_not_called()
            r.ticks.assert_not_called()
            self.assertEqual(list(Path(d).iterdir()), [])

    def test_invalid_timestamp_and_symbol_preflight(self):
        with self.assertRaises(MT5ReadError):
            parse_utc("2024-01-01T00:00:00+00:00")
        with tempfile.TemporaryDirectory() as d:
            r = self._reader()
            with self.assertRaisesRegex(MT5ReadError, "INVALID_SYMBOL"):
                self._run(r, d, symbol="../private")
            r.rates.assert_not_called()

    def test_nonfinite_payload_rejected_without_files(self):
        with tempfile.TemporaryDirectory() as d:
            r = self._reader()
            r.rates.return_value = [{"time": int(START.timestamp()), "open": float("nan")}]
            with self.assertRaisesRegex(MT5ReadError, "NONFINITE"):
                self._run(r, d)
            self.assertEqual(list(Path(d).iterdir()), [])

    def test_row_and_byte_limits(self):
        with self.assertRaisesRegex(MT5ReadError, "ROW_LIMIT"):
            _payload([None] * 100001)
        with self.assertRaisesRegex(MT5ReadError, "BYTE_LIMIT"):
            _payload([{"large": "x" * (32*1024*1024)}])


if __name__ == "__main__":
    unittest.main()
