#!/usr/bin/env python3
"""Verify the sealed empty freeze and audit descriptive leaders on development only."""
import argparse
from concurrent.futures import ProcessPoolExecutor
from datetime import datetime, timezone
from importlib import import_module
import json
from pathlib import Path
from zoneinfo import ZoneInfo

research = import_module("xmi-session-research")
STRESSES = (1.0, 1.5, 2.0)


def summarize(folds):
    n = sum(f["n"] for f in folds)
    net = sum(f["net_usd"] for f in folds)
    cost = sum(f["cost_usd"] for f in folds)
    loss = sum(f["gross_loss"] for f in folds)
    return {
        "trades": n, "net_usd": round(net, 6), "gross_before_costs_usd": round(net + cost, 6),
        "expectancy_usd": round(net / n, 6) if n else None,
        "profit_factor": round(sum(f["gross_profit"] for f in folds) / loss, 6) if loss else None,
        "max_drawdown": max(f["max_drawdown"] for f in folds),
    }


def audit_trade(trade, plan, windows, model, fold_bounds, previous_exit):
    entry, exit = trade["entry_minute"], trade["exit_minute"]
    side, last = plan[entry]
    fold_start, fold_end = fold_bounds
    if not (side == trade["side"] and previous_exit < entry and fold_start <= entry <= exit < fold_end
            and exit <= last and exit - entry < model.max_minutes):
        raise ValueError(f"Invalid planned trade timing at minute {entry}")
    for zone, start, cutoff in windows:
        opened = datetime.fromtimestamp(entry * 60, timezone.utc).astimezone(zone)
        closed = datetime.fromtimestamp(exit * 60, timezone.utc).astimezone(zone)
        if opened.date() == closed.date() and start <= opened.hour * 60 + opened.minute <= closed.hour * 60 + closed.minute < cutoff:
            break
    else:
        raise ValueError(f"Trade outside local session at minute {entry}")
    steps = trade["units"] / model.unit_step
    if steps < 1 or abs(steps - round(steps)) > 1e-8:
        raise ValueError(f"Invalid position size at minute {entry}")
    if not model.usd_base:
        expected = trade["units"] * (model.spread + 2 * model.slippage + 2 * model.commission_per_unit_side)
        if abs(expected - trade["cost_usd"]) > 1e-8:
            raise ValueError(f"Unexpected modeled cost at minute {entry}")


def replay(cache, executable, symbol, rows, archives):
    study = research.Study(cache, symbol, research.DEVELOPMENT, executable,
                           sorted({row["variant"]["window"] for row in rows.values()}))
    if study.manifest != archives:
        raise ValueError(f"Archive mismatch for {symbol}")
    output = {}
    for group, row in rows.items():
        config = {k: row[k] for k in ("symbol", "variant", "step_oz")}
        if research.digest(config) != row["config_id"]:
            raise ValueError(f"Configuration ID mismatch for {group}")
        variant = research.Variant(**row["variant"])
        entries, ends, sides, _, _, limits = study.plan(variant)
        plan = {int(study.t[a]): (int(b), int(study.t[min(c, d)]))
                for a, b, c, d in zip(entries, sides, ends, limits, strict=True)}
        windows = [(ZoneInfo(z), a, b) for z, a, b, _ in research.session_specs(variant.window)]
        cases = {}
        for stress in STRESSES:
            folds = []
            model = research.money_model(symbol, variant, stress, row["step_oz"])
            for fold in research.FOLDS:
                result = study.run(variant, fold, stress=stress, gold_step=row["step_oz"], retain=True)
                trades = result.pop("trades")
                bounds = tuple(research.utc_minute(date) for date in fold[1:])
                if len(trades) != result["n"] or abs(sum(t["pnl_usd"] for t in trades) - result["net_usd"]) > 1e-5:
                    raise ValueError(f"Trade totals mismatch for {group}")
                previous_exit = bounds[0] - 1
                for trade in trades:
                    audit_trade(trade, plan, windows, model, bounds, previous_exit)
                    previous_exit = trade["exit_minute"]
                folds.append(result)
            validation = summarize(folds[2:])
            if stress == 1.0 and (validation != row["validation"]
                                  or [f["net_usd"] for f in folds[:2]] != row["train_net_usd"]):
                raise ValueError(f"Base benchmark mismatch for {group}")
            if stress == 1.5 and row["stress_validation"] is not None and validation != row["stress_validation"]:
                raise ValueError(f"Stressed benchmark mismatch for {group}")
            cases[str(stress)] = {"validation": validation, "folds": folds}
        output[group] = {**config, "config_id": row["config_id"], "profile": row["profile"], "cases": cases}
    return output


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ("cache", "freeze", "screen-audit", "output"):
        parser.add_argument(f"--{name}", type=Path, required=True)
    args = parser.parse_args()
    if args.output.exists():
        parser.error("Output exists. Use a new path.")
    freeze = json.loads(args.freeze.read_text())
    freeze_id = freeze.pop("freeze_sha256")
    audit = json.loads(args.screen_audit.read_text())
    if (freeze["phase"] != "freeze" or freeze["holdout_year"] != research.HOLDOUT or freeze["finalists"]
            or freeze["holdout_archives"] or freeze["source"] != research.source_identity()
            or freeze_id != research.digest(freeze) or freeze_id != audit["freeze_sha256"]):
        raise ValueError("Expected the verified empty freeze and its matching screen audit")
    groups = {}
    for group, row in audit["descriptive_2024_leaders"].items():
        groups.setdefault(row["symbol"], {})[group] = row
    args.output.parent.mkdir(parents=True, exist_ok=True)
    executable = research.build_executable(args.output.parent)
    with ProcessPoolExecutor(max_workers=8) as pool:
        futures = [pool.submit(replay, args.cache, executable, symbol, rows, freeze["development_archives"][symbol])
                   for symbol, rows in sorted(groups.items())]
        leaders = {key: row for future in futures for key, row in future.result().items()}
    research.write_json(args.output, {
        "phase": "development-leader-audit", "freeze_sha256": freeze_id, "holdout_read": False,
        "holdout_replays": 0, "starting_equity_usd": 1000, "folds": research.FOLDS,
        "screen_audit_sha256": research.file_hash(args.screen_audit), "source": research.source_identity(),
        "wrapper_sha256": research.file_hash(Path(__file__)), "leaders": leaders,
    })


if __name__ == "__main__":
    main()
