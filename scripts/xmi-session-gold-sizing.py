#!/usr/bin/env python3
"""Replay the gold intraday grid with matched ounce minimums and increments."""
import argparse
from concurrent.futures import ProcessPoolExecutor
from dataclasses import asdict
from importlib import import_module
from pathlib import Path

research = import_module("xmi-session-research")
SYMBOL = "XAUUSD"
STEPS = (1.0, 0.1)
STRESSES = (1.0, 1.5)


def compare(cache, executable, window, step):
    study = research.Study(cache, SYMBOL, research.DEVELOPMENT, executable, [window])
    rows = []
    for variant in research.strategies(SYMBOL, [window], "intraday-context"):
        config = {"symbol": SYMBOL, "variant": asdict(variant), "step_oz": step}
        base, stress = (
            [study.run(variant, fold, stress=cost, gold_step=step) for fold in research.FOLDS]
            for cost in STRESSES
        )
        base_pass = research.eligible(base)
        stress_pass = all(f["net_usd"] > 0 and f["max_drawdown"] < 0.1 and not f["halted"] for f in stress)
        rows.append({
            **config, "config_id": research.digest(config), "base_pass": base_pass,
            "stress_pass": stress_pass, "development_pass": base_pass and stress_pass,
            "folds": base, "stress_folds": stress,
        })
    return {"window": window, "step_oz": step, "archives": study.manifest,
            "coverage": study.sessions[window].coverage, "rows": rows}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cache", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    if args.output.exists():
        parser.error("Output exists. Choose a new path to preserve the earlier result.")
    args.output.parent.mkdir(parents=True, exist_ok=True)
    executable = research.build_executable(args.output.parent)
    with ProcessPoolExecutor(max_workers=4) as pool:
        tasks = [
            pool.submit(compare, args.cache, executable, window, step)
            for window in research.INTRADAY_CONTEXT_WINDOWS for step in STEPS
        ]
        arms = [task.result() for task in tasks]
    research.write_json(args.output, {
        "phase": "gold-sizing-sensitivity", "source": research.source_identity(),
        "wrapper_sha256": research.file_hash(Path(__file__)), "years": research.DEVELOPMENT,
        "folds": research.FOLDS, "starting_equity_usd": 1000,
        "costs": {"spread_per_oz": 0.45, "slippage_per_oz_side": 0.07,
                  "commission_per_oz_side": 0.035, "spread_slippage_multipliers": STRESSES,
                  "leverage": 20},
        "arms": arms,
    })
    print(research.file_hash(args.output), flush=True)


if __name__ == "__main__":
    main()
