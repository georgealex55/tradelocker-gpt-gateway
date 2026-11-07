#!/usr/bin/env python3
"""Independently count complete-calendar results and match the prior 24 leaders."""
import argparse
from concurrent.futures import ProcessPoolExecutor
import gzip
from importlib import import_module
import json
from pathlib import Path

screen = import_module("xmi-session-calendar-screen")
research = screen.research


def audit_symbol(directory, symbol, saved, prior):
    inventory = {r["config_id"]: r for r in json.loads((directory / f"inventory-{symbol}.json").read_text())}
    seen, leaders = set(), {}
    gates = dict(total=0, n_at_least_200=0, positive_expectancy=0, profit_factor_above_1_5=0,
                 drawdown_below_10_percent=0, positive_stress_under_drawdown_limit=0,
                 all_numeric_gates=0, development_passes=0, profitable_supported_validation=0)
    changes = dict(improved=0, worsened=0, unchanged=0)
    with gzip.open(directory / saved["results_file"], "rt") as stream:
        for line in stream:
            row = json.loads(line)
            identity = research.digest({key: row[key] for key in ("symbol", "variant", "step_oz")})
            if identity != row["config_id"] or identity in seen:
                raise ValueError("Result configuration identity changed or duplicated")
            seen.add(identity)
            reference = inventory[identity]
            if row["baseline_folds"] != reference["baseline_folds"] or row["profiles"] != reference["profiles"]:
                raise ValueError("Result differs from the saved source inventory")
            v, s = screen.validation(row["folds"]), screen.validation(row["stress_folds"])
            baseline = screen.validation(row["baseline_folds"])
            gates["total"] += 1
            gates["n_at_least_200"] += v["n"] >= 200
            gates["positive_expectancy"] += v["n"] > 0 and v["net_usd"] > 0
            gates["profit_factor_above_1_5"] += v["profit_factor"] is not None and v["profit_factor"] > 1.5
            gates["drawdown_below_10_percent"] += v["max_fold_drawdown"] < .1 and not v["halted"]
            gates["positive_stress_under_drawdown_limit"] += s["net_usd"] > 0 and s["max_fold_drawdown"] < .1 and not s["halted"]
            passed = screen.numeric_pass(row["folds"], row["stress_folds"])
            if passed != row["numeric_validation_pass"]:
                raise ValueError("Numeric gate flag disagrees with the recorded metrics")
            gates["all_numeric_gates"] += passed
            development = (research.eligible(row["folds"]) and
                           all(f["net_usd"] > 0 and f["max_drawdown"] < .1 and not f["halted"] for f in row["stress_folds"]))
            if development != row["development_pass"]:
                raise ValueError("Development gate flag disagrees with the recorded metrics")
            gates["development_passes"] += development
            gates["profitable_supported_validation"] += (v["n"] >= 150 and v["net_usd"] > 0 and
                                                          v["max_fold_drawdown"] < .1 and not v["halted"])
            delta = v["net_usd"] - baseline["net_usd"]
            changes["improved" if delta > 1e-6 else "worsened" if delta < -1e-6 else "unchanged"] += 1
            if identity in prior:
                leaders[prior[identity]] = row
    if seen != set(inventory) or len(seen) != saved["counts"]["configurations"]:
        raise ValueError("Result coverage is incomplete")
    if research.file_hash(directory / saved["results_file"]) != saved["results_sha256"]:
        raise ValueError("Result file hash changed")
    return {"symbol": symbol, "gate_counts": gates, "net_changes": changes, "prior_leaders": leaders}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--workers", type=int, choices=range(1, 9), default=8)
    args = parser.parse_args()
    if args.output.exists():
        parser.error("Output exists; preserve the earlier audit")
    summary = json.loads((args.input / "summary.json").read_text())
    prior = json.loads((Path(__file__).resolve().parents[1] / "docs/xmi-session-leader-audit-checkpoint-11.json").read_text())
    ids = {research.digest({"symbol": row["symbol"], "variant": row["variant"],
                            "step_oz": row["step_oz"] if row["symbol"] == "XAUUSD" else None}): group
           for group, row in prior["leaders"].items()}
    with ProcessPoolExecutor(max_workers=args.workers) as pool:
        futures = [pool.submit(audit_symbol, args.input, symbol, summary["symbols"][symbol], ids)
                   for symbol in research.SYMBOLS]
        symbols = {value["symbol"]: value for value in (f.result() for f in futures)}
    leaders = {key: row for value in symbols.values() for key, row in value["prior_leaders"].items()}
    if set(leaders) != set(prior["leaders"]):
        raise ValueError("The prior 24 fixed leaders were not all compared")
    counts = {key: sum(v["gate_counts"][key] for v in symbols.values()) for key in next(iter(symbols.values()))["gate_counts"]}
    changes = {key: sum(v["net_changes"][key] for v in symbols.values()) for key in ("improved", "worsened", "unchanged")}
    research.write_json(args.output, {"summary_sha256": research.file_hash(args.input / "summary.json"),
                                    "wrapper_sha256": research.file_hash(Path(__file__)), "gate_counts": counts,
                                    "net_changes": changes, "prior_leaders": leaders,
                                    "by_symbol": {s: {k: v for k, v in r.items() if k != "prior_leaders"} for s, r in symbols.items()},
                                    "full_inventory_and_baseline_rows_verified": counts["total"],
                                    "matched_prior_leaders": len(leaders), "holdout_archives_read": False})
    print(json.dumps({"gate_counts": counts, "net_changes": changes, "matched_prior_leaders": len(leaders)}), flush=True)


if __name__ == "__main__":
    main()
