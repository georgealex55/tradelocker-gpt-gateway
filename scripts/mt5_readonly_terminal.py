"""Read-only, dependency-injected Windows-local MetaTrader 5 terminal reader.

No network server, login/password handling, order placement or file writes.
Inject an SDK object for deterministic tests; import MetaTrader5 only on demand.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

APPROVED_YEARS = frozenset((2022, 2023, 2024, 2026))
MAX_RANGE_DAYS = 31
MAX_ROWS = 100_000
MAX_SYMBOL_LENGTH = 32
ALLOWED_TIMEFRAMES = frozenset(("M1", "M5", "M15", "M30", "H1", "H4", "D1"))


class MT5ReadError(RuntimeError):
    """Stable fail-closed error with no broker account secrets."""


def _utc(value: datetime) -> datetime:
    if not isinstance(value, datetime) or value.tzinfo is None or value.utcoffset() != timezone.utc.utcoffset(value):
        raise MT5ReadError("MT5_EXPLICIT_UTC_REQUIRED")
    return value.astimezone(timezone.utc)


def validate_window(start: datetime, end: datetime) -> tuple[datetime, datetime]:
    start, end = _utc(start), _utc(end)
    if start >= end or (end - start).total_seconds() > MAX_RANGE_DAYS * 86400:
        raise MT5ReadError("MT5_INVALID_OR_OVERSIZED_WINDOW")
    # End is exclusive; ensure no query touches the sealed calendar year.
    from datetime import timedelta
    years = range(start.year, (end - timedelta(microseconds=1)).year + 1)
    if any(year not in APPROVED_YEARS for year in years):
        raise MT5ReadError("MT5_UNAPPROVED_RESEARCH_YEAR")
    return start, end


def _symbol(value: str) -> str:
    if not isinstance(value, str) or not 1 <= len(value) <= MAX_SYMBOL_LENGTH:
        raise MT5ReadError("MT5_INVALID_SYMBOL")
    if not all(ch.isascii() and (ch.isalnum() or ch in "_.#-") for ch in value):
        raise MT5ReadError("MT5_INVALID_SYMBOL")
    return value


def _safe_dict(record: Any, fields: tuple[str, ...]) -> dict:
    if record is None:
        raise MT5ReadError("MT5_MISSING_RECORD")
    return {field: getattr(record, field, None) for field in fields}


def _rows(value: Any) -> list:
    if value is None:
        raise MT5ReadError("MT5_NO_DATA")
    if len(value) > MAX_ROWS:
        raise MT5ReadError("MT5_ROW_LIMIT")
    # NumPy structured arrays expose named dtype fields. .tolist() loses field
    # names and returns tuples, which cannot be converted with dict(row).
    # Convert each record by name before returning to the exporter.
    names = getattr(getattr(value, "dtype", None), "names", None)
    if names:
        return [{name: _scalar(row[name]) for name in names} for row in value]
    records = list(value)
    result = []
    for row in records:
        if isinstance(row, dict):
            result.append(row)
        elif hasattr(row, "_asdict"):
            result.append(row._asdict())
        else:
            raise MT5ReadError("MT5_UNSUPPORTED_ROW_FORMAT")
    return result


def _scalar(value: Any) -> Any:
    # NumPy scalar -> native Python scalar without importing NumPy at runtime.
    if hasattr(value, "item"):
        return value.item()
    return value


class ReadOnlyMT5:
    """SDK is injected; no terminal initialization occurs in the constructor."""

    def __init__(self, sdk: Any):
        if sdk is None:
            raise MT5ReadError("MT5_SDK_NOT_CONFIGURED")
        self._sdk = sdk
        self._connected = False

    @classmethod
    def from_local_terminal(cls) -> "ReadOnlyMT5":
        try:
            import MetaTrader5 as mt5  # type: ignore
        except ImportError as exc:
            raise MT5ReadError("MT5_SDK_NOT_INSTALLED") from exc
        return cls(mt5)

    def connect(self) -> dict:
        # No credentials, server selection or account switching permitted.
        if self._connected:
            raise MT5ReadError("MT5_ALREADY_CONNECTED")
        if self._sdk.initialize() is not True:
            raise MT5ReadError("MT5_TERMINAL_UNAVAILABLE")
        self._connected = True
        try:
            info = self._sdk.terminal_info()
            if info is None:
                raise MT5ReadError("MT5_TERMINAL_INFO_UNAVAILABLE")
            return {
                "connected": bool(getattr(info, "connected", False)),
                "trade_allowed": bool(getattr(info, "trade_allowed", False)),
                "execution_enabled": False,
                "read_only": True,
            }
        except BaseException:
            self.close()
            raise

    def close(self) -> None:
        if self._connected:
            self._sdk.shutdown()
            self._connected = False

    def _ready(self) -> None:
        if not self._connected:
            raise MT5ReadError("MT5_NOT_CONNECTED")

    def account_snapshot(self) -> dict:
        self._ready()
        return _safe_dict(self._sdk.account_info(), (
            "currency", "leverage", "margin_mode", "balance", "equity", "margin",
            "margin_free", "margin_level", "margin_so_mode", "margin_so_call", "margin_so_so",
        ))

    def symbol_snapshot(self, symbol: str) -> dict:
        self._ready()
        info = self._sdk.symbol_info(_symbol(symbol))
        return _safe_dict(info, (
            "name", "digits", "point", "trade_contract_size", "trade_tick_size",
            "trade_tick_value", "volume_min", "volume_max", "volume_step",
            "trade_stops_level", "trade_freeze_level", "swap_long", "swap_short",
            "swap_mode", "currency_base", "currency_profit", "currency_margin",
            "trade_mode", "filling_mode", "expiration_mode",
        ))

    def rates(self, symbol: str, timeframe: str, start: datetime, end: datetime) -> list:
        self._ready()
        symbol = _symbol(symbol)
        start, end = validate_window(start, end)
        if timeframe not in ALLOWED_TIMEFRAMES:
            raise MT5ReadError("MT5_UNSUPPORTED_TIMEFRAME")
        constant = getattr(self._sdk, "TIMEFRAME_" + timeframe, None)
        if constant is None:
            raise MT5ReadError("MT5_SDK_TIMEFRAME_UNAVAILABLE")
        # MT5 range end is inclusive; preflight guards against sealed-year access.
        data = _rows(self._sdk.copy_rates_range(symbol, constant, start, end))
        result = []
        for row in data:
            record = dict(row) if not isinstance(row, dict) else row
            if "time" not in record:
                raise MT5ReadError("MT5_RATE_TIMESTAMP_MISSING")
            ts = datetime.fromtimestamp(int(record["time"]), timezone.utc)
            if not start <= ts < end:
                raise MT5ReadError("MT5_RATE_OUTSIDE_WINDOW")
            result.append(record)
        return result

    def ticks(self, symbol: str, start: datetime, end: datetime) -> list:
        self._ready()
        symbol = _symbol(symbol)
        start, end = validate_window(start, end)
        data = _rows(self._sdk.copy_ticks_range(symbol, start, end, self._sdk.COPY_TICKS_ALL))
        result = []
        for row in data:
            record = dict(row) if not isinstance(row, dict) else row
            ms = record.get("time_msc")
            if not isinstance(ms, (int, float)):
                raise MT5ReadError("MT5_TICK_TIMESTAMP_MISSING")
            ts = datetime.fromtimestamp(ms / 1000, timezone.utc)
            if not start <= ts < end:
                raise MT5ReadError("MT5_TICK_OUTSIDE_WINDOW")
            result.append(record)
        return result

    def quote(self, symbol: str) -> dict:
        self._ready()
        return _safe_dict(self._sdk.symbol_info_tick(_symbol(symbol)), (
            "time", "time_msc", "bid", "ask", "last", "volume", "flags",
        ))

    def open_positions(self) -> list:
        self._ready()
        return _rows(self._sdk.positions_get())

    def pending_orders(self) -> list:
        self._ready()
        return _rows(self._sdk.orders_get())

    def historical_deals(self, start: datetime, end: datetime) -> list:
        self._ready()
        start, end = validate_window(start, end)
        data = _rows(self._sdk.history_deals_get(start, end))
        # Filter by entry time; never return out-of-window data.
        for row in data:
            ts = datetime.fromtimestamp(int(getattr(row, "time", row.get("time") if isinstance(row, dict) else -1)), timezone.utc)
            if not start <= ts < end:
                raise MT5ReadError("MT5_DEAL_OUTSIDE_WINDOW")
        return data

    def __enter__(self):
        self.connect()
        return self

    def __exit__(self, *_):
        self.close()
