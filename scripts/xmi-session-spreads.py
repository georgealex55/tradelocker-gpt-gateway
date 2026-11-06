#!/usr/bin/env python3
"""Audit historical paired quotes and replay a fixed development-month cost comparison."""

import argparse
from concurrent.futures import ProcessPoolExecutor
from dataclasses import asdict
from pathlib import Path
from runpy import run_path
from tempfile import NamedTemporaryFile
from zipfile import BadZipFile, ZipFile

import numpy as np
import pandas as pd


SCRIPT = Path(__file__).resolve()
ENGINE = run_path(str(SCRIPT.with_name("xmi-session-research.py")))
COVERAGE = run_path(str(SCRIPT.with_name("xmi-session-coverage.py")))
CALIBRATION = ("2024-01-01", "2024-01-16")
EVALUATION = ("spread_january", "2024-01-16", "2024-02-01")
MIN_CALIBRATION_WINDOWS = 5
TIMESTAMP_PATTERN = r"202401(?:0[1-9]|[12][0-9]|3[01]) (?:[01][0-9]|2[0-3])[0-5][0-9][0-5][0-9][0-9]{3}"


def paired_minutes(path, symbol):
    member = f"DAT_ASCII_{symbol}_T_202401.csv"
    first_ticks, count, crossed, duplicate_times = [], 0, 0, 0
    previous = None
    with ZipFile(path) as archive, archive.open(member) as source:
        for chunk in pd.read_csv(source, header=None, names=["stamp", "bid", "ask", "v"],
                                 dtype={"stamp": str}, chunksize=400_000):
            stamps = chunk["stamp"]
            if not stamps.str.fullmatch(TIMESTAMP_PATTERN, na=False).all():
                raise ValueError("Tick archive has timestamps outside January 2024 or invalid clock fields")
            if not stamps.is_monotonic_increasing or previous is not None and stamps.iloc[0] < previous:
                raise ValueError("Tick archive has backward timestamps")
            quotes = chunk[["bid", "ask"]].to_numpy(dtype=np.float64)
            if not np.isfinite(quotes).all() or (quotes <= 0).any():
                raise ValueError("Tick archive has invalid bid or ask prices")
            count += len(chunk)
            crossed += int(np.count_nonzero(quotes[:, 1] < quotes[:, 0]))
            duplicate_times += int(stamps.duplicated().sum()) + int(stamps.iloc[0] == previous)
            previous = stamps.iloc[-1]
            minute = stamps.str.slice(0, 13)
            first = ~minute.duplicated()
            first_ticks.append(chunk.loc[first, ["bid", "ask"]].assign(minute=minute[first]))
    if not first_ticks:
        raise ValueError("Tick archive is empty")
    samples = pd.concat(first_ticks, ignore_index=True).drop_duplicates("minute")
    times = pd.DatetimeIndex(pd.to_datetime(samples["minute"], format="%Y%m%d %H%M", utc=True))
    times += pd.Timedelta(hours=5)
    minutes = times.asi8 // 60_000_000_000
    spread = (samples["ask"] - samples["bid"]).to_numpy()
    return minutes, samples["bid"].to_numpy(), spread, {
        "zip_sha256": ENGINE["file_hash"](path), "tick_rows": count, "crossed_tick_rows": crossed,
        "repeated_timestamp_rows": duplicate_times, "first_tick_minutes": len(minutes),
        "first_utc": times[0].isoformat(), "last_utc": times[-1].isoformat(),
    }


def compare_bid(study, times, bid, spread):
    _, original, tick = np.intersect1d(study.t, times, assume_unique=True, return_indices=True)
    difference = np.abs(study.prices[0, original] - bid[tick])
    identical = difference <= 1e-9
    valid_spread = spread[tick] >= 0
    selected = identical & valid_spread
    aligned = np.full(len(study.t), np.nan)
    aligned[original[selected]] = spread[tick[selected]]
    stats = {"overlap_minutes": len(original), "exact_bid_open_matches": int(identical.sum()),
             "crossed_first_ticks": int((~valid_spread).sum()),
             "usable_minutes": int(selected.sum())}
    return aligned, stats


def within(slots, start, end):
    lower, upper = ENGINE["utc_minute"](start), ENGINE["utc_minute"](end)
    return [slot for slot in slots if lower <= slot[0] < upper]


def paired_slots(slots, aligned):
    return [slot for slot in slots if np.isfinite(aligned[slot[1]:slot[2]]).all()]


def spread_stats(slots, aligned):
    if not slots:
        return None
    values = np.concatenate([aligned[left:right] for _, left, right in slots])
    percentiles = np.quantile(values, [0.5, 0.9, 0.95, 0.99], method="higher")
    return {"minutes": len(values), **{k: round(float(v), 9)
            for k, v in zip(("p50", "p90", "p95", "p99"), percentiles, strict=True)},
            "max": round(float(values.max()), 9)}


def save_paired_cache(directory, study, aligned, source_hash):
    target = directory / f"{study.symbol.lower()}-202401-{source_hash}.npz"
    valid = np.isfinite(aligned)
    with NamedTemporaryFile(dir=directory, suffix=".npz", delete=False) as output:
        temporary = Path(output.name)
    try:
        np.savez(temporary, utc_minute=study.t[valid], spread_quote=aligned[valid],
                 source_zip_sha256=source_hash)
        temporary.replace(target)
    finally:
        temporary.unlink(missing_ok=True)
    return {"file": target.name, "sha256": ENGINE["file_hash"](target)}


def analyze_symbol(cache, ticks, symbol, executable, include_legacy, paired_cache):
    windows = tuple(w for w in ENGINE["PILOT_WINDOWS"] if w not in ENGINE["GOLD_WINDOWS"] or symbol == "XAUUSD")
    study = ENGINE["Study"](cache, symbol, ENGINE["DEVELOPMENT"], executable, windows)
    path = ticks / f"{symbol.lower()}-2024-01-ticks.zip"
    try:
        times, bid, spread, metadata = paired_minutes(path, symbol)
        aligned, parity = compare_bid(study, times, bid, spread)
        paired = metadata | parity
    except (OSError, BadZipFile, KeyError, ValueError) as error:
        paired = {"blocked": f"{type(error).__name__}: {str(error).replace(str(path), path.name)}"}
        aligned = np.full(len(study.t), np.nan)
    if paired_cache and "zip_sha256" in paired:
        paired["normalized_cache"] = save_paired_cache(paired_cache, study, aligned, paired["zip_sha256"])

    coverage, selection = {}, {}
    for window in windows:
        slots = study.sessions[window].complete
        early = within(slots, *CALIBRATION)
        late = within(slots, *EVALUATION[1:])
        calibration, evaluation = paired_slots(early, aligned), paired_slots(late, aligned)
        calibrated = len(calibration) >= MIN_CALIBRATION_WINDOWS and bool(evaluation)
        selected = evaluation if calibrated else late
        selection[window] = tuple(t for t, _, _ in selected)
        coverage[window] = {
            "calibration_minute_complete": len(early), "calibration_paired": len(calibration),
            "evaluation_minute_complete": len(late), "evaluation_paired": len(evaluation),
            "evaluated_windows": len(selected), "calibrated": calibrated,
            "calibration_spread": spread_stats(calibration, aligned),
            "evaluation_spread_diagnostic": spread_stats(evaluation, aligned),
        }
    COVERAGE["restrict"](study, selection)
    rows = []
    for profile, variant in COVERAGE["variants"](symbol, windows, include_legacy):
        original = ENGINE["money_model"](symbol, variant, 1.0, 1.0)
        spread_info = coverage[variant.window]
        scenarios = {"modeled_base": (None, 1.0), "modeled_stress": (None, 1.5)}
        if spread_info["calibrated"]:
            p90 = spread_info["calibration_spread"]["p90"]
            floor = max(p90, original.spread)
            scenarios.update({"observed_p90": (p90, 1.0), "conservative_base": (floor, 1.0),
                              "conservative_stress": (floor, 1.5)})
        spec = asdict(variant)
        results = {}
        for name, (override, stress) in scenarios.items():
            results[name] = {
                "metrics": study.run(variant, EVALUATION, stress=stress, spread_override=override),
                "spread": (original.spread if override is None else override) * stress,
                "slippage_per_side": original.slippage * stress,
            }
        rows.append({"config_id": ENGINE["digest"]({"symbol": symbol, "variant": spec}),
                     "profile": profile, "lane": ENGINE["lane_for"](variant.window), "variant": spec,
                     "commission_usd_per_unit_per_side": original.commission_per_unit_side,
                     "unit_step": original.unit_step, "leverage": original.leverage, "results": results})
    print(f"{symbol}: {len(rows)} configurations, {sum(v['calibrated'] for v in coverage.values())} calibrated windows",
          flush=True)
    return {"symbol": symbol, "m1_archives": study.manifest, "paired_archive": paired, "windows": coverage,
            "evaluated_window_starts_utc_minute": selection, "rows": rows}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cache", type=Path, required=True)
    parser.add_argument("--ticks", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--paired-cache", type=Path, help="Private directory for aligned minute spreads")
    parser.add_argument("--include-legacy", action="store_true")
    parser.add_argument("--workers", type=int, choices=range(1, 9), default=4)
    args = parser.parse_args()
    if args.output.exists():
        parser.error("Output exists. Choose a new path to preserve the earlier comparison.")
    if args.paired_cache:
        args.paired_cache.mkdir(parents=True, exist_ok=True)
    executable = ENGINE["build_executable"](args.output.parent)
    with ProcessPoolExecutor(max_workers=args.workers) as pool:
        tasks = [pool.submit(analyze_symbol, args.cache, args.ticks, s, executable,
                             args.include_legacy, args.paired_cache) for s in ENGINE["SYMBOLS"]]
        data = [task.result() for task in tasks]
    output = {"purpose": "short development-only spread sensitivity",
              "calibration_utc": CALIBRATION, "evaluation_utc": EVALUATION[1:],
              "starting_equity_usd": 1000, "minimum_calibration_windows": MIN_CALIBRATION_WINDOWS,
              "source": ENGINE["source_identity"]() | {p.name: ENGINE["file_hash"](p) for p in
                         (SCRIPT, SCRIPT.with_name("xmi-session-coverage.py"))}, "symbols": data}
    ENGINE["write_json"](args.output, output)
    print(f"{args.output} {ENGINE['file_hash'](args.output)}", flush=True)


if __name__ == "__main__":
    main()
