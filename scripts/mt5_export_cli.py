"""Bounded, local-only MT5 historical export CLI. Never transmits data or places orders.

Example (Windows with MetaTrader5 terminal):
 python -m scripts.mt5_export_cli --kind bars --symbol EURUSD --timeframe M1 --from-utc 2024-01-02T00:00:00Z --to-utc 2024-01-02T01:00:00Z --out-dir C:\\private-mt5

The output directory is explicitly chosen by the operator. No implicit live connection
or file writes occur on import. Manifest hashes the exact canonical JSON payload bytes.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from scripts.mt5_readonly_terminal import ReadOnlyMT5, MT5ReadError, validate_window, _symbol

MAX_EXPORT_ROWS = 100_000
MAX_EXPORT_BYTES = 32 * 1024 * 1024
SAFE_OUT = re.compile(r"^[A-Za-z0-9_.#-]{1,32}$")
TIMEFRAMES = ("M1", "M5", "M15", "M30", "H1", "H4", "D1")


def parse_utc(text: str) -> datetime:
    if not isinstance(text, str) or not re.fullmatch(r"\\d{4}-\\d\\d-\\d\\dT\\d\\d:\\d\\d:\\d\\dZ", text):
        raise MT5ReadError("MT5_EXPLICIT_UTC_REQUIRED")
    try:
        value = datetime.strptime(text, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
    except ValueError as exc:
        raise MT5ReadError("MT5_INVALID_TIMESTAMP") from exc
    return value


def _plain(value: Any) -> Any:
    if hasattr(value, "item"):
        return _plain(value.item())
    if isinstance(value, (str, int, float, bool)) or value is None:
        return value
    if isinstance(value, dict):
        return {str(k): _plain(v) for k, v in value.items()}
    if hasattr(value, "_asdict"):
        return _plain(value._asdict())
    if isinstance(value, (list, tuple)):
        return [_plain(v) for v in value]
    raise MT5ReadError("MT5_UNSUPPORTED_RECORD_TYPE")


def _payload(rows: list) -> bytes:
    if len(rows) > MAX_EXPORT_ROWS:
        raise MT5ReadError("MT5_EXPORT_ROW_LIMIT")
    try:
        body = json.dumps(_plain(rows), sort_keys=True, separators=(",", ":"), allow_nan=False).encode("utf-8")
    except (ValueError, TypeError) as exc:
        raise MT5ReadError("MT5_NONFINITE_OR_INVALID_RECORD") from exc
    if len(body) > MAX_EXPORT_BYTES:
        raise MT5ReadError("MT5_EXPORT_BYTE_LIMIT")
    return body


def _private_write(path: Path, data: bytes) -> None:
    # No overwrite; private file mode on systems that support POSIX permissions.
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    try:
        with os.fdopen(fd, "wb") as out:
            out.write(data)
            out.flush()
            os.fsync(out.fileno())
    except BaseException:
        path.unlink(missing_ok=True)
        raise


def export_local(*, reader: ReadOnlyMT5, kind: str, symbol: str, start: datetime,
                 end: datetime, out_dir: Path, timeframe: str = "M1",
                 exported_at: datetime | None = None) -> dict:
    # All validation, including 2025 holdout, occurs before any SDK call.
    if kind not in ("bars", "ticks"):
        raise MT5ReadError("MT5_EXPORT_KIND_UNSUPPORTED")
    symbol = _symbol(symbol)
    start, end = validate_window(start, end)
    if timeframe not in TIMEFRAMES:
        raise MT5ReadError("MT5_UNSUPPORTED_TIMEFRAME")
    out_dir = Path(out_dir).expanduser()
    if not out_dir.is_absolute() or out_dir.is_symlink() or not out_dir.is_dir():
        raise MT5ReadError("MT5_PRIVATE_DIRECTORY_REQUIRED")
    if out_dir.resolve() == Path.cwd().resolve() or out_dir.resolve().is_relative_to(Path.cwd().resolve()):
        raise MT5ReadError("MT5_REPOSITORY_EXPORT_FORBIDDEN")
    if exported_at is None:
        exported_at = datetime.now(timezone.utc)
    if exported_at.tzinfo is None or exported_at.utcoffset() != timezone.utc.utcoffset(exported_at):
        raise MT5ReadError("MT5_EXPLICIT_UTC_REQUIRED")
    data = reader.rates(symbol, timeframe, start, end) if kind == "bars" else reader.ticks(symbol, start, end)
    raw = _payload(data)
    sha = hashlib.sha256(raw).hexdigest()
    stamp = exported_at.strftime("%Y%m%dT%H%M%SZ")
    name = f"mt5_{kind}_{symbol}_{timeframe if kind == 'bars' else 'ALL'}_{stamp}_{sha[:12]}"
    payload_path = out_dir / (name + ".json")
    manifest_path = out_dir / (name + ".manifest.json")
    manifest = {
        "contractVersion": 1, "source": "MT5_LOCAL_EXPORT", "readOnly": True,
        "executionEnabled": False, "kind": kind, "symbol": symbol,
        "sha256": sha, "rows": len(data), "timezone": "UTC",
        "exportedAt": exported_at.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "window": {"from": start.strftime("%Y-%m-%dT%H:%M:%SZ"),
                   "to": end.strftime("%Y-%m-%dT%H:%M:%SZ")},
        "timeframe": timeframe if kind == "bars" else None,
        "payloadFilename": payload_path.name,
        "hashAlgorithm": "SHA-256",
        "sourceLimitations": "Local terminal account/server not independently authenticated by this manifest; broker data remains private",
    }
    # Preflight both paths to avoid replacing earlier exports. Use exclusive writes.
    if payload_path.exists() or manifest_path.exists():
        raise MT5ReadError("MT5_EXPORT_ALREADY_EXISTS")
    _private_write(payload_path, raw)
    try:
        _private_write(manifest_path, json.dumps(manifest, sort_keys=True, indent=2).encode("utf-8"))
    except BaseException:
        payload_path.unlink(missing_ok=True)
        raise
    return {"manifest": manifest, "payloadPath": str(payload_path), "manifestPath": str(manifest_path)}


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description="Private read-only MT5 historical export; no trading")
    parser.add_argument("--kind", choices=("bars", "ticks"), required=True)
    parser.add_argument("--symbol", required=True)
    parser.add_argument("--timeframe", choices=TIMEFRAMES, default="M1")
    parser.add_argument("--from-utc", required=True)
    parser.add_argument("--to-utc", required=True)
    parser.add_argument("--out-dir", required=True)
    args = parser.parse_args(argv)
    start, end = validate_window(parse_utc(args.from_utc), parse_utc(args.to_utc))
    symbol = _symbol(args.symbol)
    dest = Path(args.out_dir).expanduser()
    if not dest.is_absolute() or not dest.is_dir():
        parser.error("--out-dir must be an existing absolute private directory")
    with ReadOnlyMT5.from_local_terminal() as reader:
        result = export_local(reader=reader, kind=args.kind, symbol=symbol, start=start,
                              end=end, out_dir=dest, timeframe=args.timeframe)
    # Never print raw records or account identifiers.
    print(json.dumps({"sha256": result["manifest"]["sha256"],
                      "rows": result["manifest"]["rows"],
                      "manifestPath": result["manifestPath"]}, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
