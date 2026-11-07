#!/usr/bin/env python3
"""Reprice the fixed XMI development leaders on January 2024 paired quotes."""

import argparse
from concurrent.futures import ProcessPoolExecutor
from importlib import import_module
import json
from pathlib import Path
from tempfile import NamedTemporaryFile
from zipfile import ZipFile

import numpy as np
import pandas as pd

research = import_module("xmi-session-research")
FOLD = ("january_quotes", "2024-01-01", "2024-02-01")
CASES = ("fixed", "observed", "stressed")
MINUTE_MS = 60_000
SOURCE_UTC_OFFSET_MS = 5 * 60 * MINUTE_MS


def read_ticks(archive, symbol, cache, expected_hash):
    source_hash = research.file_hash(archive)
    if source_hash != expected_hash:
        raise ValueError(f"{symbol} tick archive differs from the spread audit")
    target = cache / f"{symbol.lower()}-202401-{source_hash}-ticks-v1.npz"
    if target.exists():
        with np.load(target, allow_pickle=False) as saved:
            times, bid, ask = (saved[name] for name in ("times", "bid", "ask"))
    else:
        member = f"DAT_ASCII_{symbol}_T_202401.csv"
        with ZipFile(archive) as zipped, zipped.open(member) as csv:
            data = pd.read_csv(csv, header=None, usecols=[0, 1, 2], names=["stamp", "bid", "ask", "volume"],
                               dtype={"stamp": str, "bid": np.float64, "ask": np.float64})
        if not data["stamp"].str.fullmatch(r"202401[0-9]{2} [0-9]{9}", na=False).all():
            raise ValueError(f"{symbol} has invalid tick date or clock fields")
        times = pd.to_datetime(data.pop("stamp"), format="%Y%m%d %H%M%S%f", utc=True)
        times = times.to_numpy(dtype="datetime64[ms]").astype(np.int64) + SOURCE_UTC_OFFSET_MS
        bid, ask = data["bid"].to_numpy(), data["ask"].to_numpy()
        cache.mkdir(parents=True, exist_ok=True)
        validate_quotes(symbol, times, bid, ask)
        with NamedTemporaryFile(dir=cache, suffix=".npz", delete=False) as file:
            temp = Path(file.name)
        try:
            np.savez(temp, times=times, bid=bid, ask=ask)
            temp.replace(target)
        finally:
            temp.unlink(missing_ok=True)
    validate_quotes(symbol, times, bid, ask)
    return times, bid, ask, {
        "zip_sha256": source_hash, "normalized_sha256": research.file_hash(target), "tick_rows": len(times),
        "repeated_timestamp_rows": int(np.count_nonzero(times[1:] == times[:-1])),
        "first_utc": pd.Timestamp(int(times[0]), unit="ms", tz="UTC").isoformat(),
        "last_utc": pd.Timestamp(int(times[-1]), unit="ms", tz="UTC").isoformat(),
    }


def validate_quotes(symbol, times, bid, ask):
    if (times.ndim != 1 or not len(times) or bid.shape != times.shape or ask.shape != times.shape
            or np.any(times[1:] < times[:-1]) or not np.isfinite(bid).all()
            or not np.isfinite(ask).all() or np.any(bid <= 0) or np.any(ask < bid)):
        raise ValueError(f"{symbol} has missing, unsorted, nonpositive or crossed quotes")


def align_minutes(study, times, bid):
    minute = times // MINUTE_MS
    first = np.r_[0, np.flatnonzero(minute[1:] != minute[:-1]) + 1]
    last = np.r_[first[1:] - 1, len(times) - 1]
    _, bar, tick = np.intersect1d(study.t, minute[first], assume_unique=True, return_indices=True)
    observed = np.stack((bid[first], np.maximum.reduceat(bid, first), np.minimum.reduceat(bid, first), bid[last]))
    equal = np.isclose(observed[:, tick], study.prices[:, bar], rtol=0.0, atol=1e-9)
    aligned = np.full(len(study.t), -1, dtype=np.int64)
    aligned[bar[equal.all(axis=0)]] = first[tick[equal.all(axis=0)]]
    return aligned, {
        "overlap_minutes": len(bar), "bid_open_matches": int(equal[0].sum()),
        "bid_ohlc_matches": int(equal.all(axis=0).sum()),
    }


def exit_trade(times, bid, ask, first, last, side, distance, model, equity, peak, units, time_reason):
    entry = (ask[first] if side > 0 else bid[first]) + side * model.slippage
    exit_quote = bid[first:last + 1] if side > 0 else ask[first:last + 1]
    # Anchor to the entry's exit-side quote. With a fixed spread the stop and
    # target are the same bid levels in either direction.
    anchor = exit_quote[0]
    move = side * (exit_quote - anchor)
    reward = distance * model.reward
    stop_hits = np.flatnonzero(move <= -distance)
    target_hits = np.flatnonzero(move >= reward)
    quote_pnl = side * (anchor - entry) + np.minimum(move, reward) - model.slippage
    if model.usd_base:
        conversion = np.where(quote_pnl >= 0, ask[first:last + 1], bid[first:last + 1])
        quote_pnl = quote_pnl / conversion
    net = units * (quote_pnl - 2 * model.commission_per_unit_side)
    peaks = np.maximum.accumulate(np.maximum(peak, equity + net))
    dd = (peaks - equity - net) / peaks
    halt_hits = np.flatnonzero(dd >= model.max_drawdown)

    # Tie-break quote events sharing one millisecond in the adverse direction.
    events = [(last - first, 3, time_reason)]
    for hits, priority, reason in ((stop_hits, 0, "stop"), (halt_hits, 1, "drawdown"), (target_hits, 2, "target")):
        if hits.size:
            events.append((int(hits[0]), priority, reason))
    i, _, reason = min(events, key=lambda event: (times[first + event[0]], event[1]))
    return first + i, float(net[i]), float(peaks[i]), float(dd[:i + 1].max()), reason


def replay(study, variant, step, fold_indexes, aligned, matched_ends, times, bid, ask, case, restrictions=None):
    model = research.money_model(study.symbol, variant, 1.5 if case == "stressed" else 1.0, step)
    if case == "fixed":
        ask = bid + model.spread
    elif case == "stressed":
        ask = bid + np.maximum(1.5 * (ask - bid), model.spread)
    first, ends, sides, atr, structure, limits = study.plan(variant)
    left, right = np.searchsorted(first, fold_indexes)
    first, ends, sides, limits = (array[left:right] for array in (first, ends, sides, limits))
    if variant.stop_atr:
        distances = variant.stop_atr * atr[left:right]
        if structure is not None:
            distances = np.maximum(distances, structure[left:right])
    elif structure is not None:
        distances = structure[left:right]
    else:
        fixed_stop = 4 if study.symbol == "XAUUSD" else 0.2 if study.symbol.endswith("JPY") else 0.002
        distances = np.full(len(first), fixed_stop)

    if model.reward <= 0 or variant.rule in (*research.LEGACY, "v1-usdchf-modeled"):
        raise ValueError("This quote replay requires a positive target and a non-legacy entry")
    equity = peak = 1000.0
    drawdown, next_minute, window_end, window_trades = 0.0, 0, -1, 0
    skips = {"stop_cost": 0, "min_size": 0}
    trades = []
    control_exits = {}
    for i, (entry, end, side, distance, limit) in enumerate(zip(first, ends, sides, distances, limits, strict=True)):
        entry_minute = study.t[entry]
        if end not in matched_ends or entry_minute < next_minute or not np.isfinite(distance) or distance <= 0:
            continue
        if end != window_end:
            window_end, window_trades = end, 0
        if window_trades >= model.trades_per_window:
            continue
        start = aligned[entry]
        if restrictions is not None:
            blocked = restrictions.entry_reason(int(times[start]))
            if blocked:
                skips[blocked] = skips.get(blocked, 0) + 1
                continue
        entry_spread = ask[start] - bid[start]
        commission = 2 * model.commission_per_unit_side
        friction = entry_spread + 2 * model.slippage
        if distance < variant.min_stop_to_cost * (friction + commission * (bid[start] if model.usd_base else 1.0)):
            skips["stop_cost"] += 1
            continue
        loss_conversion = min(bid[start], bid[start] - side * distance) if model.usd_base else 1.0
        loss_per_unit = (distance + friction) / loss_conversion + commission
        margin_per_unit = (1.0 if model.usd_base else ask[start]) / model.leverage
        capacity = min(equity * model.risk / loss_per_unit, 0.9 * equity / margin_per_unit, model.unit_cap)
        units = np.floor(capacity / model.unit_step + 1e-10) * model.unit_step
        if units < model.unit_step:
            skips["min_size"] += 1
            continue

        # Exit at the first quote of the final permitted minute, a time known at entry.
        final = min(end, limit, entry + model.max_minutes - 1)
        reason = "time"
        if model.exit_on_flip:
            for j in range(i + 1, len(first)):
                if first[j] >= final or ends[j] != end:
                    break
                if sides[j] != side:
                    final, reason = first[j], "flip"
                    break
        if restrictions is not None:
            minute, control_reason = restrictions.last_allowed_minute(int(times[start]), int(study.t[final]))
            if control_reason:
                final = int(np.searchsorted(study.t, minute))
                reason = control_reason
        finish, net, peak, dd, reason = exit_trade(
            times, bid, ask, start, aligned[final], side, distance, model, equity, peak, units, reason)
        if restrictions is not None:
            restrictions.verify_trade(int(times[start]), int(times[finish]))
            if reason in ("news", "rollover", "news+rollover"):
                control_exits[reason] = control_exits.get(reason, 0) + 1
        equity += net
        drawdown = max(drawdown, dd)
        next_minute = times[finish] // MINUTE_MS + 1 + model.cooldown_minutes
        window_trades += 1
        trades.append({"entry_ms": int(times[start]), "exit_ms": int(times[finish]), "side": int(side),
                       "units": float(units), "net_usd": net, "reason": reason})
        if drawdown >= model.max_drawdown:
            break

    pnl = np.array([trade["net_usd"] for trade in trades])
    wins, losses = float(pnl[pnl > 0].sum()), float(-pnl[pnl < 0].sum())
    result = {"trades": len(trades), "net_usd": round(equity - 1000, 6),
            "expectancy_usd": round(float(pnl.mean()), 6) if trades else None,
            "profit_factor": round(wins / losses, 6) if losses else None,
            "max_drawdown": round(drawdown, 8), "halted": bool(drawdown >= model.max_drawdown),
            "skip_counts": skips, "trade_ledger_sha256": research.digest(trades)}
    if restrictions is not None:
        result["control_exits"] = control_exits
    return result


def run_symbol(symbol, leaders, expected_ticks, expected_bars, cache, ticks, normalized, executable, control_profiles=None):
    windows = sorted({row["variant"]["window"] for row in leaders.values()})
    study = research.Study(cache, symbol, research.DEVELOPMENT, executable, windows)
    if study.manifest != expected_bars:
        raise ValueError(f"{symbol} minute archives differ from the frozen development manifest")
    archive = ticks / f"{symbol.lower()}-2024-01-ticks.zip"
    times, bid, ask, source = read_ticks(archive, symbol, normalized, expected_ticks["zip_sha256"])
    aligned, parity = align_minutes(study, times, bid)
    if (source["tick_rows"] != expected_ticks["tick_rows"]
            or source["repeated_timestamp_rows"] != expected_ticks["repeated_timestamp_rows"]
            or parity["bid_open_matches"] != expected_ticks["exact_bid_open_matches"]):
        raise ValueError(f"{symbol} quote counts or bid opens differ from the spread audit")
    fold_indexes = np.searchsorted(study.t, [research.utc_minute(day) for day in FOLD[1:]])
    results = {}
    for group, row in leaders.items():
        spec = {k: row[k] for k in ("symbol", "variant", "step_oz")}
        if research.digest(spec) != row["config_id"]:
            raise ValueError(f"Configuration ID mismatch for {group}")
        variant = research.Variant(**row["variant"])
        candidates = [(start, left, right) for start, left, right in study.sessions[variant.window].complete
                      if fold_indexes[0] <= left < right <= fold_indexes[1]]
        matched = [(start, left, right) for start, left, right in candidates if np.all(aligned[left:right] >= 0)]
        model = research.money_model(symbol, variant, 1.0, row["step_oz"])
        results[group] = {
            **spec, "config_id": row["config_id"], "windows_local": research.session_specs(variant.window),
            "complete_minute_windows": len(candidates), "matched_windows": len(matched),
            "matched_minutes": sum(right - left for _, left, right in matched),
            "execution": {
                "fixed_spread_quote": model.spread, "slippage_per_side_quote": model.slippage,
                "commission_usd_per_unit_per_side": model.commission_per_unit_side,
                "leverage": model.leverage, "minimum_and_step": model.unit_step,
                "max_trades_per_window": model.trades_per_window, "marked_drawdown_halt": model.max_drawdown,
            },
        }
        if matched:
            ends = {right - 1 for _, _, right in matched}
            results[group]["cases"] = {case: replay(study, variant, row["step_oz"], fold_indexes, aligned,
                                                   ends, times, bid, ask, case) for case in CASES}
            if control_profiles:
                results[group]["controls"] = {
                    name: {case: replay(study, variant, row["step_oz"], fold_indexes, aligned, ends,
                                        times, bid, ask, case, restrictions) for case in CASES}
                    for name, restrictions in control_profiles.items()
                }
        else:
            results[group]["blocked"] = "No complete session windows with exact bid OHLC parity"
    return symbol, {"paired_archive": source | parity, "m1_archives": study.manifest, "results": results}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ("cache", "ticks", "normalized", "output"):
        parser.add_argument(f"--{name}", type=Path, required=True)
    parser.add_argument("--workers", type=int, choices=range(1, 9), default=8)
    args = parser.parse_args()
    if args.output.exists():
        parser.error("Output exists. Use a new path.")
    docs = Path(__file__).resolve().parent.parent / "docs"
    paths = [docs / f"xmi-session-{name}.json" for name in
             ("leader-audit-checkpoint-11", "frozen-checkpoint-10", "spread-checkpoint-02")]
    leaders, freeze, spread = [json.loads(p.read_text()) for p in paths]
    freeze_hash = freeze.pop("freeze_sha256")
    expected_groups = {f"{lane}/{symbol}" for lane in ("open", "close", "intraday") for symbol in research.SYMBOLS}
    if (leaders["source"] != research.source_identity() or freeze["source"] != leaders["source"]
            or leaders["freeze_sha256"] != freeze_hash or research.digest(freeze) != freeze_hash
            or set(leaders["leaders"]) != expected_groups or freeze["finalists"] or freeze["holdout_archives"]):
        raise ValueError("Expected the audited leaders and an empty frozen shortlist")
    args.output.parent.mkdir(parents=True, exist_ok=True)
    executable = research.build_executable(args.output.parent)
    with ProcessPoolExecutor(max_workers=args.workers) as pool:
        tasks = [pool.submit(run_symbol, symbol, {k: v for k, v in leaders["leaders"].items() if v["symbol"] == symbol},
                             spread["symbols"][symbol]["paired_archive"], freeze["development_archives"][symbol],
                             args.cache, args.ticks, args.normalized, executable) for symbol in research.SYMBOLS]
        results = dict(task.result() for task in tasks)
    research.write_json(args.output, {
        "scope": "development-only paired-quote execution sensitivity",
        "evaluation_utc": FOLD[1:], "starting_equity_usd": 1000, "holdout_read": False,
        "source": research.source_identity() | {Path(__file__).name: research.file_hash(Path(__file__))},
        "inputs": {p.name: research.file_hash(p) for p in paths},
        "cost_cases": {
            "fixed": "original fixed spread on observed bids, original slippage",
            "observed": "observed bid/ask, original slippage",
            "stressed": "1.5x the greater of observed or original spread, 1.5x slippage",
        },
        "commission_unchanged": True, "entry_margin_cap_equity_fraction": 0.9,
        "development_freeze_sha256": freeze_hash, "symbols": results,
    })
    print(f"Wrote {args.output} ({research.file_hash(args.output)})", flush=True)


if __name__ == "__main__":
    main()
