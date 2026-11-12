"""Fail-closed, read-only MT5 symbol specification comparison against captured GatesFX snapshots.

The screenshot values are observed TradeLocker platform display, NOT authenticated
MT5/GatesFX broker history. Unknown values never become defaults.
"""
from __future__ import annotations

from math import isfinite
from typing import Mapping, Any

# User-supplied Nov 8 platform screenshots; see documentation evidence SHA list.
SNAPSHOTS = {
    "EURUSD": {"contract": 100000, "min_lot": 0.01, "margin_percent": 0.20, "leverage": 500},
    "GBPUSD": {"contract": 100000, "min_lot": 0.01, "margin_percent": 0.20, "leverage": 500},
    "USDJPY": {"contract": 100000, "min_lot": 0.01, "margin_percent": 0.20, "leverage": 500},
    "USDCHF": {"contract": 100000, "min_lot": 0.01, "margin_percent": 0.20, "leverage": 500},
    "AUDUSD": {"contract": 100000, "min_lot": 0.01, "margin_percent": 0.20, "leverage": 500},
    "USDCAD": {"contract": 100000, "min_lot": 0.01, "margin_percent": 0.20, "leverage": 500},
    "NZDUSD": {"contract": 100000, "min_lot": 0.01, "margin_percent": 0.20, "leverage": 500},
    "XAUUSD": {"contract": 100, "min_lot": 0.01, "margin_percent": 0.50, "leverage": 200},
}

FIELDS = ("trade_contract_size", "volume_min", "volume_step", "volume_max",
          "trade_tick_size", "trade_tick_value", "point", "digits",
          "swap_long", "swap_short", "swap_mode", "margin_initial",
          "margin_maintenance", "trade_stops_level", "trade_freeze_level")


def _positive(value: Any) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool) and isfinite(value) and value > 0


def compare_symbol(symbol: str, info: Mapping[str, Any] | None,
                   account: Mapping[str, Any] | None = None) -> dict:
    """Compare *observations* only. Never infer historical execution conditions."""
    if symbol not in SNAPSHOTS:
        raise ValueError("MT5_UNSUPPORTED_SNAPSHOT_SYMBOL")
    expected = SNAPSHOTS[symbol]
    observed = dict(info or {})
    account = dict(account or {})
    issues = []
    checks = {}
    for key, target in (("trade_contract_size", expected["contract"]),
                        ("volume_min", expected["min_lot"])):
        value = observed.get(key)
        if not _positive(value):
            checks[key] = "unknown"
        elif abs(value - target) > max(1e-9, abs(target) * 1e-8):
            checks[key] = "conflict"
            issues.append(key + "_DIFFERS_FROM_TRADELOCKER_SNAPSHOT")
        else:
            checks[key] = "matches_snapshot"
    step, min_lot, max_lot = (observed.get(k) for k in ("volume_step", "volume_min", "volume_max"))
    if all(_positive(v) for v in (step, min_lot, max_lot)):
        checks["volume_range"] = "consistent" if min_lot <= max_lot and step <= max_lot else "conflict"
        if checks["volume_range"] == "conflict":
            issues.append("MT5_VOLUME_RANGE_INCONSISTENT")
    else:
        checks["volume_range"] = "unknown"
    point, tick_size = observed.get("point"), observed.get("trade_tick_size")
    if _positive(point) and _positive(tick_size):
        checks["price_increment"] = "consistent" if tick_size >= point * (1 - 1e-8) else "conflict"
        if checks["price_increment"] == "conflict":
            issues.append("MT5_TICK_SIZE_BELOW_POINT")
    else:
        checks["price_increment"] = "unknown"
    # Account leverage alone is NOT proof of symbol leverage/margin tiers.
    leverage = account.get("leverage")
    checks["account_leverage"] = ("matches_snapshot" if leverage == expected["leverage"]
                                   else "differs_from_snapshot" if _positive(leverage) else "unknown")
    if checks["account_leverage"] == "differs_from_snapshot":
        issues.append("ACCOUNT_LEVERAGE_DIFFERS_FROM_SNAPSHOT")
    # No screenshot provided lot steps/max lots, stopout or reliable swap schedule.
    missing = [k for k in FIELDS if observed.get(k) is None]
    if not _positive(observed.get("volume_step")):
        issues.append("VOLUME_STEP_UNVERIFIED")
    if not _positive(observed.get("volume_max")):
        issues.append("VOLUME_MAX_UNVERIFIED")
    if account.get("margin_so_call") is None or account.get("margin_so_so") is None:
        issues.append("ACCOUNT_STOPOUT_UNVERIFIED")
    issues.extend(("HISTORICAL_BID_ASK_UNVERIFIED", "HISTORICAL_SLIPPAGE_UNVERIFIED",
                   "HISTORICAL_SWAP_SCHEDULE_UNVERIFIED", "HISTORICAL_MARGIN_TIERS_UNVERIFIED",
                   "BROKER_SERVER_IDENTITY_UNVERIFIED"))
    return {
        "symbol": symbol,
        "category": "gold_separate" if symbol == "XAUUSD" else "forex_major",
        "snapshot_provenance": "user TradeLocker screenshot 2026-11-08; not historical",
        "checks": checks,
        "missing_mt5_fields": missing,
        "issues": sorted(set(issues)),
        "research_status": "PROVISIONAL_UNRANKED",
        "broker_authenticated": False,
        "historical_terms_verified": False,
        "observed_fields": {key: observed.get(key) for key in FIELDS},
    }
