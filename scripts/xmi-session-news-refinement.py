#!/usr/bin/env python3
"""Compare preregistered news policies with a training-only selection freeze."""
import argparse
from concurrent.futures import ProcessPoolExecutor
from importlib import import_module
import json
from pathlib import Path

screen = import_module("xmi-session-calendar-screen")
controls = screen.controls
research = screen.research
COSTS = (1., 1.5, 2.)


def build_policy(symbol, calendar, settings, policy):
    """Construct an overlay, retaining uncertainty and original holiday buffers."""
    coverage = controls.build_profiles(symbol, calendar, settings, False, period=screen.PERIOD)
    if coverage["news+rollover"].coverage_missing:
        raise ValueError("Incomplete calendar coverage")
    currencies = {symbol[:3], symbol[3:]} - {"XAU"}
    intervals = list(coverage["rollover"].intervals)
    for event in calendar["events"]:
        if event.get("risk_action", "blackout") == "observe" or not currencies.intersection(event["currencies"]):
            continue
        central = event["kind"] in ("fomc", "central_bank")
        holiday = event.get("impact") == "holiday"
        global_medium = event.get("source_currency") == "All" and event.get("impact") == "medium"
        if global_medium and not central and not holiday and policy["global_medium"] == "observe":
            continue
        if central:
            before, after = settings["fomcPreEventMinutes"], settings["fomcPostEventMinutes"]
        elif "scheduled_at" in event and not holiday:
            before, after = policy["timed_macro_pre_minutes"], policy["timed_macro_post_minutes"]
        else:
            before, after = settings["preEventMinutes"], settings["postEventMinutes"]
        if "scheduled_at" in event:
            left = right = controls.epoch_ms(event["scheduled_at"])
        else:
            left, right = controls.epoch_ms(event["blackout_from"]), controls.epoch_ms(event["blackout_to"])
        intervals.append((left - before * controls.MINUTE, right + after * controls.MINUTE, "news"))
    return controls.Restrictions(controls.merge_intervals(intervals))


def aggregate(folds):
    n = sum(f["n"] for f in folds)
    net = sum(f["net_usd"] for f in folds)
    cost = sum(f["cost_usd"] for f in folds)
    gain, loss = (sum(f[k] for f in folds) for k in ("gross_profit", "gross_loss"))
    return {"n": n, "net_usd": round(net, 6), "gross_before_cost_usd": round(net + cost, 6),
            "cost_usd": round(cost, 6), "expectancy_usd": round(net / n, 6) if n else None,
            "profit_factor": round(gain / loss, 6) if loss else None,
            "max_fold_drawdown": max(f["max_drawdown"] for f in folds),
            "halted": any(f["halted"] for f in folds)}


def select_training(cases, policies, requirements):
    """This accepts training folds only; no validation fields enter the decision."""
    eligible = []
    for policy in policies:
        identifier = policy["id"]
        if set(cases[identifier]) != {str(cost) for cost in COSTS} or any(
                len(folds) not in (1, 2) for folds in cases[identifier].values()):
            raise ValueError("Selection accepts one or two training years at the three fixed cost cases")
        all_folds = [f for folds in cases[identifier].values() for f in folds]
        passed = all(
            f["n"] >= requirements["minimum_completed_trades"]
            and f["net_usd"] > requirements["net_pnl_strictly_above_usd"]
            and f["profit_factor"] is not None and f["profit_factor"] > requirements["profit_factor_strictly_above"]
            and f["max_drawdown"] < requirements["max_equity_drawdown_strictly_below"]
            and not f["halted"] for f in all_folds)
        if passed:
            eligible.append((min(f["net_usd"] for f in all_folds), identifier))
    if not eligible:
        return {"eligible": [], "selected": policies[0]["id"], "fallback": True}
    # max retains the first preregistered candidate for ties.
    best = max(eligible, key=lambda item: item[0])
    return {"eligible": [item[1] for item in eligible], "selected": best[1], "fallback": False,
            "worst_training_account_net_usd": best[0]}


def study_for(symbol, cache, executable, source, calendar, catalog):
    rows = source["symbols"][symbol]["leaders"]
    profiles = {p["id"]: build_policy(symbol, calendar, source["event_settings"], p) for p in catalog["policies"]}
    baseline = controls.build_profiles(symbol, calendar, source["event_settings"], False, period=screen.PERIOD)["news+rollover"]
    if profiles["strict_60_30"] != baseline:
        raise ValueError("Strict policy differs from the previous execution policy")
    study = screen.CalendarStudy(cache, symbol, research.DEVELOPMENT, executable,
                                 sorted({r["variant"]["window"] for r in rows.values()}), restrictions=baseline)
    if study.manifest != source["symbols"][symbol]["archives"]:
        raise ValueError("Normalized price audit differs from the previous study")
    return study, profiles, rows


def run_training(symbol, cache, executable, source, calendar, catalog):
    study, profiles, rows = study_for(symbol, cache, executable, source, calendar, catalog)
    results, parity = {}, 0
    for lane, row in rows.items():
        variant, step = research.Variant(**row["variant"]), row["step_oz"] or 1.
        cases = {}
        for policy, profile in profiles.items():
            study.restrictions = profile
            study.control_cache.clear()
            cases[policy] = {str(cost): [study.run(variant, f, stress=cost, gold_step=step)
                                         for f in research.FOLDS[:2]] for cost in COSTS}
        if cases["strict_60_30"]["1.0"] != row["folds"][:2] or cases["strict_60_30"]["1.5"] != row["stress_folds"][:2]:
            raise ValueError("Training baseline parity failed")
        parity += 4
        requirements = catalog["selection"]["requirements_every_training_year_and_cost"]
        chosen = select_training(cases, catalog["policies"], requirements)
        year_2022_only = {policy: {cost: folds[:1] for cost, folds in costs.items()} for policy, costs in cases.items()}
        walk = select_training(year_2022_only, catalog["policies"], requirements)
        results[lane] = {"config_id": row["config_id"], "variant": row["variant"], "step_oz": row["step_oz"],
                         "training_cases": cases, "selection": chosen, "2022_only_selection": walk,
                         "reused_2023_chronological_diagnostic": cases[walk["selected"]]["1.0"][1]}
    print(f"{symbol}: training complete; {sum(not r['selection']['fallback'] for r in results.values())}/3 eligible benchmark selections", flush=True)
    return {"symbol": symbol, "benchmarks": results, "parity_accounts": parity}


def run_validation(symbol, cache, executable, source, calendar, catalog, frozen):
    study, profiles, rows = study_for(symbol, cache, executable, source, calendar, catalog)
    results, audited, parity = {}, 0, 0
    for lane, row in rows.items():
        variant, step = research.Variant(**row["variant"]), row["step_oz"] or 1.
        cases, trade_hashes = {}, {}
        for policy, profile in profiles.items():
            study.restrictions = profile
            study.control_cache.clear()
            costs = {}
            for cost in COSTS:
                folds, logs = [], []
                for fold in research.FOLDS[2:]:
                    result = study.run(variant, fold, stress=cost, gold_step=step, retain=True)
                    trades = result.pop("trades")
                    study.audit_trades(trades)
                    audited += len(trades)
                    folds.append(result)
                    logs.extend(trades)
                costs[str(cost)] = {"folds": folds, "aggregate": aggregate(folds)}
                trade_hashes[f"{policy}/{cost}"] = research.digest(logs)
            cases[policy] = costs
        if cases["strict_60_30"]["1.0"]["folds"] != row["folds"][2:] or cases["strict_60_30"]["1.5"]["folds"] != row["stress_folds"][2:]:
            raise ValueError("Reused validation baseline parity failed")
        parity += 4
        results[lane] = {**frozen["benchmarks"][lane], "reused_validation_cases": cases, "trade_log_sha256": trade_hashes,
                         "selected_before_validation": frozen["benchmarks"][lane]["selection"]["selected"]}
    print(f"{symbol}: reused-validation complete; {audited:,} trade audits", flush=True)
    return {"symbol": symbol, "benchmarks": results, "audited_validation_trades": audited, "parity_accounts": parity,
            "archives": study.manifest, "coverage": {k: s.coverage for k, s in study.sessions.items()}}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ("cache", "calendar", "output"):
        parser.add_argument(f"--{name}", type=Path, required=True)
    parser.add_argument("--workers", type=int, choices=range(1, 9), default=8)
    args = parser.parse_args()
    if args.output.exists():
        parser.error("Output exists; preserve earlier results")
    root = Path(__file__).resolve().parents[1]
    source_path = root / "docs/xmi-session-calendar-rerun-2022-2024.json"
    catalog_path = root / "docs/xmi-session-news-policy-candidates-20261107.json"
    source, catalog = (json.loads(p.read_text()) for p in (source_path, catalog_path))
    if source["source"] != research.source_identity() or source["calendar_sha256"] != research.file_hash(args.calendar):
        raise ValueError("Source engine or calendar changed")
    # Require exact original input bytes before normalizing or evaluating.
    for symbol, data in source["symbols"].items():
        for archive in data["archives"]:
            if research.file_hash(args.cache / f"{symbol.lower()}-{archive['year']}.zip") != archive["archive_sha256"]:
                raise ValueError(f"Archive hash mismatch: {symbol} {archive['year']}")
    calendar = controls.load_calendar(args.calendar)
    args.output.mkdir(parents=True)
    preregistration = {"catalog": catalog, "catalog_sha256": research.file_hash(catalog_path),
                       "source_summary_sha256": research.file_hash(source_path), "source": research.source_identity(),
                       "calendar_sha256": research.file_hash(args.calendar), "wrapper_sha256": research.file_hash(Path(__file__)),
                       "benchmarks": {s: {lane: row['config_id'] for lane, row in d['leaders'].items()} for s, d in source['symbols'].items()},
                       "validation_evaluated_in_this_batch": False, "holdout_archives_read": False}
    research.write_json(args.output / "preregistration.json", preregistration)
    executable = research.build_executable(args.output)
    with ProcessPoolExecutor(max_workers=args.workers) as pool:
        jobs = [pool.submit(run_training, s, args.cache, executable, source, calendar, catalog) for s in research.SYMBOLS]
        trained = {r['symbol']: r for r in (j.result() for j in jobs)}
    frozen = {"preregistration_sha256": research.file_hash(args.output / "preregistration.json"),
              "training": trained, "selection_input_years": [2022, 2023], "validation_evaluated_in_this_batch": False,
              "holdout_archives_read": False}
    research.write_json(args.output / "training-selection-freeze.json", frozen)
    freeze_hash = research.file_hash(args.output / "training-selection-freeze.json")
    with ProcessPoolExecutor(max_workers=args.workers) as pool:
        jobs = [pool.submit(run_validation, s, args.cache, executable, source, calendar, catalog, trained[s]) for s in research.SYMBOLS]
        results = {r['symbol']: r for r in (j.result() for j in jobs)}
    eligible = sum(not r['selection']['fallback'] for s in trained.values() for r in s['benchmarks'].values())
    result = {"purpose": "Preregistered event-class refinement; no production policy promotion", "starting_equity_usd": 1000,
              "source": research.source_identity(), "catalog_sha256": research.file_hash(catalog_path),
              "wrapper_sha256": research.file_hash(Path(__file__)), "calendar_sha256": research.file_hash(args.calendar),
              "preregistration_sha256": research.file_hash(args.output / "preregistration.json"),
              "training_selection_freeze_sha256": freeze_hash, "selection_used_validation": False,
              "2024_status": "Reused development/validation after prior attribution; not fresh out-of-sample proof",
              "source_summary_sha256": research.file_hash(source_path), "policies": catalog["policies"],
              "cost_multipliers": COSTS, "benchmark_count": 24, "policy_configurations": 96, "account_replays": 1152,
              "eligible_training_selections": eligible, "qualified_strategies": 0, "holdout_archives_read": False,
              "active_production_policy_changed": False,
              "baseline_parity_accounts": sum(s['parity_accounts'] for s in trained.values()) + sum(s['parity_accounts'] for s in results.values()),
              "audited_validation_trades": sum(s['audited_validation_trades'] for s in results.values()), "symbols": results}
    research.write_json(args.output / "results.json", result)
    print(json.dumps({"eligible_training_selections": eligible, "baseline_parity_accounts": result['baseline_parity_accounts'],
                      "audited_validation_trades": result['audited_validation_trades'], "results_sha256": research.file_hash(args.output / 'results.json')}), flush=True)


if __name__ == "__main__":
    main()
