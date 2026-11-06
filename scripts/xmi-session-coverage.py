#!/usr/bin/env python3
"""Audit XMI session coverage and compare fixed rules on matched development windows."""

import argparse
from collections import Counter
from concurrent.futures import ProcessPoolExecutor
from dataclasses import asdict
import json
from pathlib import Path
from runpy import run_path
from tempfile import NamedTemporaryFile

import numpy as np
import pandas as pd


SCRIPT = Path(__file__).resolve()
ENGINE = run_path(str(SCRIPT.with_name("xmi-session-research.py")))
YEARS = ENGINE["DEVELOPMENT"]
FOLDS = ENGINE["FOLDS"]
SYMBOLS = ENGINE["SYMBOLS"]
WINDOWS = ENGINE["WINDOWS"]
PREFIX_MINUTES = 120
OUTAGE_START, OUTAGE_END = "2023-02-20", "2023-07-28"
COST_SCENARIOS = {
    "complete_base": 1.0,
    "complete_stress": 1.5,
    "matched_base": 1.0,
    "matched_stress": 1.5,
}


def session_calendar(times, spec):
    zone, start, end, _ = spec
    days = pd.bdate_range(f"{YEARS[0]}-01-01", f"{YEARS[-1]}-12-31")
    local = (days + pd.Timedelta(minutes=start)).tz_localize(zone)
    starts = local.tz_convert("UTC").asi8 // 60_000_000_000
    duration = end - start
    left = np.searchsorted(times, starts)
    right = np.searchsorted(times, starts + duration)
    prefix = left - np.searchsorted(times, starts - PREFIX_MINUTES)
    iso = days.isocalendar()
    return pd.DataFrame({
        "day": days, "start": starts, "observed": right - left,
        "minutes": duration, "full": right - left == duration,
        "prefix_full": prefix == PREFIX_MINUTES,
        "year": days.year, "iso_year": iso["year"].to_numpy(dtype=int),
        "iso_key": 7 * iso["week"].to_numpy(dtype=int) + days.dayofweek,
    })


def coverage_table(calendar):
    grouped = calendar.assign(
        month=calendar["day"].dt.strftime("%Y-%m"),
        empty=calendar["observed"] == 0,
        missing=calendar["minutes"] - calendar["observed"],
    ).groupby("month", sort=True)
    return {
        month: {"weekdays": len(rows), "complete": int(rows["full"].sum()),
                "empty": int(rows["empty"].sum()), "missing_minutes": int(rows["missing"].sum())}
        for month, rows in grouped
    }


def matched_starts(calendar):
    # Match ISO week and weekday in local time within the same calendar year.
    # Only quote timestamps inform inclusion. All OHLC stays in indicator history.
    eligible = calendar[calendar["full"] & calendar["prefix_full"] &
                        (calendar["year"] == calendar["iso_year"])]
    by_year = [set(eligible.loc[eligible["year"] == year, "iso_key"]) for year in YEARS]
    keys = set.intersection(*by_year)
    matched = eligible[eligible["iso_key"].isin(keys)]
    return tuple(int(start) for start in matched["start"])


def outage_detail(calendar, times):
    period = calendar[calendar["day"].between(OUTAGE_START, OUTAGE_END)]
    missing = []
    hour_patterns = Counter()
    for row in period.itertuples():
        if row.full:
            continue
        expected = np.arange(row.start, row.start + row.minutes)
        start, end = np.searchsorted(times, [row.start, row.start + row.minutes])
        absent = np.setdiff1d(expected, times[start:end], assume_unique=True)
        missing.extend(absent.tolist())
        if len(absent) == 60 and int(absent[-1] - absent[0]) == 59:
            offset = int(absent[0] - row.start)
            hour_patterns[offset] += 1
    return {
        "weekdays": len(period), "complete": int(period["full"].sum()),
        "absent_minutes": len(missing), "exact_hour_gap_offsets": dict(hour_patterns),
    }, missing


def restrict(study, selection):
    for window, starts in selection.items():
        session = study.sessions[window]
        keep = set(starts)
        # Only session eligibility changes. The original price and indicator arrays
        # remain available, including actual quotes outside the matched windows.
        for start, left, right in session.complete:
            if start not in keep:
                session.begin[left:right] = -1
                session.end[left:right] = -1
        session.complete = [slot for slot in session.complete if slot[0] in keep]
    study.signal_cache.clear()


def variants(symbol, windows, include_legacy):
    for variant in ENGINE["strategies"](symbol, windows, "expanded"):
        if variant.stop_atr == 1.8 and variant.reward == 1.8:
            yield "expanded", variant
    if symbol == "USDCHF" and include_legacy:
        yield from (("legacy", v) for v in ENGINE["strategies"](symbol, windows, "legacy"))
    if symbol == "XAUUSD":
        yield "checkpoint_gold", ENGINE["Variant"](
            "trend-momentum", 15, "ny-intraday", 0.01, 1.7, 2.2, 210, min_stop_to_cost=2.5,
        )


def cost_model(symbol, variant, stress):
    model = ENGINE["money_model"](symbol, variant, stress, 1.0)
    return {name: getattr(model, name) for name, _ in model._fields_}


def replay(study, variant, stress):
    folds = [study.run(variant, fold, stress=stress) for fold in FOLDS]
    return {"folds": folds, "meets_original_development_filter": ENGINE["eligible"](folds)}


def save_normalized(study, directory):
    provenance = {"normalizer_sha256": ENGINE["file_hash"](SCRIPT.with_name("xmi-session-research.py")),
                  "symbol": study.symbol, "archives": study.manifest}
    key = ENGINE["digest"](provenance)
    target = directory / f"{study.symbol.lower()}-development-{key}.npz"
    with NamedTemporaryFile(dir=directory, suffix=".npz", delete=False) as output:
        temp = Path(output.name)
    try:
        np.savez(temp, utc_minute=study.t, bid_ohlc=study.prices,
                 provenance_json=json.dumps(provenance, sort_keys=True))
        temp.replace(target)
    finally:
        temp.unlink(missing_ok=True)
    return {"file": target.name, "sha256": ENGINE["file_hash"](target), "bars": len(study.t)}


def audit_symbol(cache, symbol, executable, include_legacy, normalized_cache):
    windows = tuple(name for name in ENGINE["PILOT_WINDOWS"]
                    if name not in ENGINE["GOLD_WINDOWS"] or symbol == "XAUUSD")
    study = ENGINE["Study"](cache, symbol, YEARS, executable, windows)
    coverage, outage, missing, matched = {}, {}, {}, {}
    for window in windows:
        calendar = session_calendar(study.t, WINDOWS[window])
        coverage[window] = coverage_table(calendar)
        if set(calendar.loc[calendar["full"], "start"]) != {t for t, _, _ in study.sessions[window].complete}:
            raise ValueError(f"{symbol} {window}: audit and replay disagree on complete sessions")
        matched[window] = matched_starts(calendar)
        if window.startswith("ny-"):
            outage[window], missing[window] = outage_detail(calendar, study.t)

    selected = list(variants(symbol, windows, include_legacy))
    rows = []
    for profile, variant in selected:
        spec = asdict(variant)
        row = {
            "config_id": ENGINE["digest"]({"symbol": symbol, "variant": spec}),
            "profile": profile, "variant": spec, "lane": ENGINE["lane_for"](variant.window),
            "base_execution": cost_model(symbol, variant, 1.0),
            "stress_execution": cost_model(symbol, variant, 1.5),
        }
        for scenario in ("complete_base", "complete_stress"):
            row[scenario] = replay(study, variant, COST_SCENARIOS[scenario])
        rows.append(row)

    restrict(study, matched)
    for row, (_, variant) in zip(rows, selected, strict=True):
        for scenario in ("matched_base", "matched_stress"):
            row[scenario] = replay(study, variant, COST_SCENARIOS[scenario])
    print(f"{symbol}: {len(rows)} configurations", flush=True)
    return {
        "symbol": symbol, "archives": study.manifest,
        "normalized_cache": save_normalized(study, normalized_cache) if normalized_cache else None,
        "monthly_coverage": coverage, "outage": outage,
        "outage_missing_utc_minutes": missing, "matched_window_starts_utc_minute": matched,
        "rows": rows,
    }


def simultaneous_outage(symbols):
    output = {}
    for window in ("ny-open", "ny-intraday", "ny-close"):
        absent = [set(item["outage_missing_utc_minutes"][window]) for item in symbols]
        fx = [minutes for item, minutes in zip(symbols, absent, strict=True) if item["symbol"] != "XAUUSD"]
        all_symbols = set.intersection(*absent)
        output[window] = {
            "all_seven_fx_absent": len(set.intersection(*fx)),
            "all_eight_absent": len(all_symbols),
            "any_symbol_absent": len(set.union(*absent)),
            "all_eight_absent_by_utc_hour": dict(sorted(Counter((t // 60) % 24 for t in all_symbols).items())),
        }
    return output


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cache", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--normalized-cache", type=Path, help="Private directory for verified minute arrays")
    parser.add_argument("--include-legacy", action="store_true")
    parser.add_argument("--workers", type=int, choices=range(1, 9), default=4)
    args = parser.parse_args()
    if args.output.exists():
        parser.error("Output exists. Choose a new path to preserve the earlier comparison.")
    if args.normalized_cache:
        args.normalized_cache.mkdir(parents=True, exist_ok=True)
    executable = ENGINE["build_executable"](args.output.parent)
    with ProcessPoolExecutor(max_workers=args.workers) as pool:
        tasks = [pool.submit(audit_symbol, args.cache, symbol, executable, args.include_legacy, args.normalized_cache)
                 for symbol in SYMBOLS]
        results = [task.result() for task in tasks]
    output = {
        "purpose": "development availability sensitivity, separate from finalist selection",
        "years": YEARS, "folds": FOLDS, "starting_equity_usd": 1000,
        "source": ENGINE["source_identity"]() | {SCRIPT.name: ENGINE["file_hash"](SCRIPT)},
        "windows_local": {name: WINDOWS[name] for name in ENGINE["PILOT_WINDOWS"]},
        "prefix_minutes": PREFIX_MINUTES,
        "outage_local_dates_inclusive": [OUTAGE_START, OUTAGE_END],
        "simultaneous_outage": simultaneous_outage(results),
        "cost_scenarios": COST_SCENARIOS, "symbols": results,
    }
    ENGINE["write_json"](args.output, output)
    print(f"{args.output} {ENGINE['file_hash'](args.output)}", flush=True)


if __name__ == "__main__":
    main()
