#!/usr/bin/env python3
"""Repeat the saved development grids with strict historical news controls."""
import argparse
from concurrent.futures import ProcessPoolExecutor, as_completed
from dataclasses import asdict
import gzip
from importlib import import_module
import json
from pathlib import Path
import subprocess

import numpy as np

controls = import_module("xmi-session-event-controls")
research = controls.research
PERIOD = ("2022-01-01", "2025-01-01")
INPUTS = {
    "expanded": "increment-10-current-expanded.json",
    "targeted": "increment-10-current-targeted.json",
    "legacy": "increment-10-current-legacy.json",
    "opening-context": "increment-10-current-opening-context.json",
    "closing-context": "increment-10-current-closing-context.json",
    "intraday-context": "increment-10-current-intraday-context.json",
    "gold-sizing": "increment-10-current-gold-sizing.json",
    "structure": "increment-08-structure.json",
    "fx-opening": "increment-10-fx-opening.json",
}


def restrict_plan(times, plan, restrictions):
    """Keep full safe minutes and cap exits without changing session counters."""
    if restrictions.coverage_missing:
        raise ValueError("Calendar coverage must include the entire development period")
    first, last, side, atr, structure, limits = plan
    if not restrictions.intervals or not len(first):
        return plan
    starts = np.array([i[0] for i in restrictions.intervals], dtype=np.int64)
    ends = np.array([i[1] for i in restrictions.intervals], dtype=np.int64)
    entry_ms = times[first] * controls.MINUTE
    overlap = np.searchsorted(ends, entry_ms, side="left")
    safe = overlap == len(starts)
    bounded = np.minimum(overlap, len(starts) - 1)
    safe |= starts[bounded] > entry_ms + controls.MINUTE - 1
    first, last, side, atr, limits = [np.ascontiguousarray(a[safe]) for a in (first, last, side, atr, limits)]
    structure = None if structure is None else np.ascontiguousarray(structure[safe])
    next_interval = np.searchsorted(starts, times[first] * controls.MINUTE, side="right")
    has_next = next_interval < len(starts)
    next_starts = starts[np.minimum(next_interval, len(starts) - 1)] // controls.MINUTE
    last_safe = np.searchsorted(times, next_starts, side="left") - 1
    limits = np.where(has_next, np.minimum(limits, last_safe), limits).astype(np.int32)
    # Keep original window ends: a blackout must not reset a session's trade cap.
    return first, last, side, atr, structure, np.ascontiguousarray(limits)


class CalendarStudy(research.Study):
    def __init__(self, *args, restrictions, **kwargs):
        super().__init__(*args, **kwargs)
        self.restrictions = restrictions
        self.controlled = True
        self.control_cache = {}

    def plan(self, variant):
        plan = super().plan(variant)
        if not self.controlled:
            return plan
        key = (variant.rule, variant.minutes, variant.window, variant.rule_parameter)
        if key not in self.control_cache:
            self.control_cache[key] = restrict_plan(self.t, plan, self.restrictions)
        return self.control_cache[key]

    def audit_trades(self, trades):
        for trade in trades:
            self.restrictions.verify_trade(trade["entry_minute"] * controls.MINUTE,
                                           (trade["exit_minute"] + 1) * controls.MINUTE - 1)
            if trade["exit_minute"] < trade["entry_minute"]:
                raise ValueError("Trade ended before its entry")


def validation(folds):
    values = folds[2:]
    n = sum(f["n"] for f in values)
    net = sum(f["net_usd"] for f in values)
    gain = sum(f["gross_profit"] for f in values)
    loss = sum(f["gross_loss"] for f in values)
    return {"n": n, "net_usd": round(net, 6),
            "gross_pnl_before_cost_usd": round(net + sum(f["cost_usd"] for f in values), 6),
            "cost_usd": round(sum(f["cost_usd"] for f in values), 6),
            "expectancy_usd": round(net / n, 6) if n else None,
            "profit_factor": round(gain / loss, 6) if loss else None,
            "max_fold_drawdown": max(f["max_drawdown"] for f in values),
            "halted": any(f["halted"] for f in values)}


def score(row):
    v = validation(row["folds"])
    return (v["n"] >= 150 and not v["halted"] and v["max_fold_drawdown"] < .1,
            v["net_usd"] if v["n"] >= 150 else -1e9, v["n"])


def numeric_pass(base, stress):
    v, s = validation(base), validation(stress)
    return (v["n"] >= 200 and v["expectancy_usd"] > 0 and v["profit_factor"] is not None
            and v["profit_factor"] > 1.5 and v["max_fold_drawdown"] < .1 and not v["halted"]
            and s["net_usd"] > 0 and s["max_fold_drawdown"] < .1 and not s["halted"])


def make_inventory(directory, output):
    audit = json.loads((Path(__file__).resolve().parents[1] / "docs/xmi-session-screen-audit-checkpoint-10.json").read_text())
    inventories = {symbol: {} for symbol in research.SYMBOLS}
    sources = {}
    references = 0
    for profile, filename in INPUTS.items():
        path = directory / filename
        fingerprint = research.file_hash(path)
        audit_profile = "fx_opening" if profile == "fx-opening" else profile
        expected = audit["screens"][audit_profile]["output_sha256"]
        if fingerprint != expected:
            raise ValueError(f"Saved screen changed: {profile}: {fingerprint} != {expected}")
        screen = json.loads(path.read_text())
        if screen["source"] != research.source_identity():
            raise ValueError(f"Saved screen uses a different engine: {profile}")
        arms = screen["arms"] if profile == "gold-sizing" else screen["symbols"]
        count = 0
        for arm in arms:
            for row in arm["rows"]:
                symbol = row["symbol"]
                config = {"symbol": symbol, "variant": row["variant"],
                          "step_oz": row.get("step_oz", 1.0) if symbol == "XAUUSD" else None}
                key = research.digest(config)
                existing = inventories[symbol].get(key)
                if existing is None:
                    inventories[symbol][key] = {**config, "config_id": key, "profiles": [profile],
                                                "baseline_folds": row["folds"]}
                else:
                    if existing["baseline_folds"] != row["folds"]:
                        raise ValueError("Duplicate configuration has inconsistent saved results")
                    existing["profiles"].append(profile)
                count += 1
        if count != audit["screens"][audit_profile]["rows"]:
            raise ValueError(f"Saved screen row count changed: {profile}")
        references += count
        sources[profile] = {"file": filename, "sha256": fingerprint, "rows": count}
        del screen, arms
    paths = {}
    for symbol, entries in inventories.items():
        path = output / f"inventory-{symbol}.json"
        research.write_json(path, list(entries.values()))
        paths[symbol] = str(path)
    return paths, sources, references, sum(map(len, inventories.values()))


def run_symbol(symbol, inventory_path, cache, executable, calendar_path, settings, output):
    inventory = json.loads(Path(inventory_path).read_text())
    calendar = controls.load_calendar(calendar_path)
    profile = controls.build_profiles(symbol, calendar, settings, False, period=PERIOD)["news+rollover"]
    if profile.coverage_missing:
        raise ValueError(f"Missing calendar coverage for {symbol}")
    windows = sorted({r["variant"]["window"] for r in inventory})
    study = CalendarStudy(cache, symbol, research.DEVELOPMENT, executable, windows, restrictions=profile)
    path = output / f"calendar-screen-{symbol}.ndjson.gz"
    if path.exists():
        raise FileExistsError(path)
    leaders, counts = {}, {"configurations": 0, "development_passes": 0, "numeric_validation_passes": 0,
                           "validation_net_improved": 0, "validation_net_worsened": 0, "validation_net_unchanged": 0}
    parity = audits = 0
    previous_profiles = None
    with gzip.open(path, "wt", encoding="utf-8", compresslevel=3) as stream:
        for index, row in enumerate(inventory):
            variant = research.Variant(**row["variant"])
            step = row["step_oz"] or 1.0
            # Recheck one baseline per saved profile and each research leader below.
            if index == 0 or row["profiles"] != previous_profiles:
                study.signal_cache.clear()
                study.control_cache.clear()
                study.controlled = False
                baseline = [study.run(variant, fold, gold_step=step) for fold in research.FOLDS]
                if baseline != row["baseline_folds"]:
                    raise ValueError(f"Uncontrolled baseline parity failed for {row['config_id']}")
                parity += len(baseline)
                study.controlled = True
            previous_profiles = row["profiles"]
            base = [study.run(variant, fold, gold_step=step) for fold in research.FOLDS]
            stress = [study.run(variant, fold, stress=1.5, gold_step=step) for fold in research.FOLDS]
            stress_pass = all(f["net_usd"] > 0 and f["max_drawdown"] < .1 and not f["halted"] for f in stress)
            result = {**row, "folds": base, "stress_folds": stress,
                      "development_pass": research.eligible(base) and stress_pass,
                      "numeric_validation_pass": numeric_pass(base, stress)}
            stream.write(json.dumps(result, separators=(",", ":"), allow_nan=False) + "\n")
            counts["configurations"] += 1
            counts["development_passes"] += result["development_pass"]
            counts["numeric_validation_passes"] += result["numeric_validation_pass"]
            delta = validation(base)["net_usd"] - validation(row["baseline_folds"])["net_usd"]
            counts["validation_net_improved" if delta > 1e-6 else "validation_net_worsened" if delta < -1e-6 else "validation_net_unchanged"] += 1
            lane = research.lane_for(variant.window)
            if lane not in leaders or score(result) > score(leaders[lane]):
                leaders[lane] = result
            if (index + 1) % 5000 == 0:
                print(f"{symbol}: {index+1:,}/{len(inventory):,} configurations", flush=True)
    verified = {}
    for lane, row in leaders.items():
        variant = research.Variant(**row["variant"])
        step = row["step_oz"] or 1.0
        folds = [study.run(variant, fold, gold_step=step, retain=True) for fold in research.FOLDS]
        for actual, expected in zip(folds, row["folds"]):
            trades = actual.pop("trades")
            if actual != expected:
                raise ValueError("Retained leader replay changed")
            study.audit_trades(trades)
            audits += len(trades)
        verified[lane] = row
    result = {"symbol": symbol, "archives": study.manifest,
              "coverage": {name: s.coverage for name, s in study.sessions.items()},
              "calendar_intervals": len(profile.intervals), "counts": counts,
              "baseline_parity_accounts": parity, "audited_leader_trades": audits,
              "leaders": verified, "results_file": path.name, "results_sha256": research.file_hash(path)}
    research.write_json(output / f"summary-{symbol}.json", result)
    print(f"{symbol}: finished {counts}", flush=True)
    return result


def finalize(output, sources, references, unique, calendar_path, settings, *, recovery=None):
    root = Path(__file__).resolve().parents[1]
    calendar = controls.load_calendar(calendar_path)
    symbols = {}
    for symbol in research.SYMBOLS:
        result = json.loads((output / f"summary-{symbol}.json").read_text())
        if research.file_hash(output / result["results_file"]) != result["results_sha256"]:
            raise ValueError("Completed instrument result changed")
        symbols[symbol] = result
    if sum(s["counts"]["configurations"] for s in symbols.values()) != unique:
        raise ValueError("Completed configuration count differs from the frozen inventory")
    result = {"purpose": "Complete-calendar rerun of saved 2022-2024 grids", "starting_equity_usd": 1000,
              "source": research.source_identity(), "wrapper_sha256": research.file_hash(Path(__file__)),
              "event_controls_sha256": research.file_hash(Path(controls.__file__)),
              "calendar_sha256": research.file_hash(calendar_path), "calendar_coverage": calendar["coverage"],
              "calendar_point_in_time_snapshot": calendar["point_in_time_snapshot"],
              "folds": research.FOLDS, "source_screens": sources, "saved_grid_rows": references,
              "unique_effective_configurations": unique, "controlled_account_replays": unique * 8,
              "event_settings": settings, "spread_slippage_stress": 1.5,
              "cost_basis": "Conservative fixed modeled spreads; no fabricated historical spreads",
              "execution": "Closed-bar next-minute entries; full safe-minute positions; cap at preceding minute close before blackout",
              "holdout_archives_read": False, "qualification_count": 0,
              "qualification_status": "Development/validation evidence; point-in-time schedule proof and untouched holdout pending",
              "symbols": {symbol: symbols[symbol] for symbol in research.SYMBOLS}}
    if recovery:
        result["batch_recovery"] = recovery
    if (output / "summary.json").exists():
        raise FileExistsError(output / "summary.json")
    research.write_json(output / "summary.json", result)
    print("Summary SHA-256: " + research.file_hash(output / "summary.json"), flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ("cache", "saved-screens", "calendar", "output"):
        parser.add_argument(f"--{name}", type=Path, required=True)
    parser.add_argument("--workers", type=int, choices=range(1, 9), default=8)
    args = parser.parse_args()
    if args.output.exists():
        parser.error("Output exists; preserve the earlier run")
    args.output.mkdir(parents=True)
    root = Path(__file__).resolve().parents[1]
    calendar = controls.load_calendar(args.calendar)
    manifest = json.loads((root / "docs/xmi-calendar-coverage-2022-2024.json").read_text())
    if research.file_hash(args.calendar) != manifest["calendar_sha256"]:
        raise ValueError("Calendar differs from its audited source")
    command = "import {FOREX_STRATEGY_V1_CONFIG as c} from './lib/forexStrategyV1Config.js'; process.stdout.write(JSON.stringify(c.eventRisk));"
    settings = json.loads(subprocess.run(["node", "--input-type=module", "-e", command], cwd=root,
                                         capture_output=True, text=True, check=True).stdout)
    # Fail before starting a large grid if the existing locked legacy dependency is absent.
    subprocess.run(["node", "--input-type=module", "-e", "await import('trading-signals');"],
                   cwd=root, check=True, capture_output=True, text=True)
    paths, sources, references, unique = make_inventory(args.saved_screens, args.output)
    print(f"Inventory: {references:,} saved rows, {unique:,} unique effective configurations", flush=True)
    executable = research.build_executable(args.output)
    symbols = {}
    with ProcessPoolExecutor(max_workers=args.workers) as pool:
        futures = [pool.submit(run_symbol, symbol, paths[symbol], args.cache, executable,
                               args.calendar, settings, args.output) for symbol in research.SYMBOLS]
        for future in as_completed(futures):
            value = future.result()
            symbols[value["symbol"]] = value
    finalize(args.output, sources, references, unique, args.calendar, settings)


if __name__ == "__main__":
    main()
