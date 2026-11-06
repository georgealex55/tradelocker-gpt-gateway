#!/usr/bin/env python3
"""Replay development leaders and immediate parameter neighbors without the holdout."""
import argparse
from collections import defaultdict
from concurrent.futures import ProcessPoolExecutor
from importlib import import_module
import json
from pathlib import Path

research = import_module("xmi-session-research")
AXES = ("risk", "stop_atr", "reward")
STRESSES = (1.0, 1.5, 2.0)


def read_screens(paths):
    configs = {}
    archives = {}
    sources = {}
    for path in paths:
        screen = json.loads(path.read_text(encoding="utf-8"))
        if screen["years"] != list(research.DEVELOPMENT) or screen["folds"] != [list(f) for f in research.FOLDS]:
            raise ValueError(f"Unexpected development dates in {path.name}")
        if screen["phase"] not in ("screen", "gold-sizing-sensitivity"):
            raise ValueError(f"Unexpected phase in {path.name}")
        sources[path.name] = research.file_hash(path)
        for arm in screen.get("symbols", screen.get("arms", [])):
            for row in arm["rows"]:
                symbol = row["symbol"]
                if archives.setdefault(symbol, arm["archives"]) != arm["archives"]:
                    raise ValueError(f"Archives differ for {symbol}")
                config = {"symbol": symbol, "variant": row["variant"], "step_oz": row.get("step_oz", 1.0)}
                key = research.digest(config)
                folds = row["folds"]
                fold_hash = research.digest(folds)
                if key in configs:
                    if configs[key]["base_sha256"] != fold_hash:
                        raise ValueError(f"Conflicting base results for {key}")
                    continue
                configs[key] = {
                    **config, "base_sha256": fold_hash,
                    "train": [{k: f[k] for k in ("n", "net_usd", "expectancy_r", "halted")} for f in folds[:2]],
                    "validation_net": sum(f["net_usd"] for f in folds[2:]),
                    "validation_n": sum(f["n"] for f in folds[2:]),
                    "validation_dd": max(f["max_drawdown"] for f in folds[2:]),
                }
    return configs, archives, sources


def lane(row):
    return research.lane_for(row["variant"]["window"])


def select(configs):
    training = defaultdict(list)
    descriptive = defaultdict(list)
    neighborhoods = defaultdict(list)
    for key, row in configs.items():
        symbol, variant, step = row["symbol"], row["variant"], row["step_oz"]
        if all(f["n"] >= 25 and f["net_usd"] > 0 and not f["halted"] for f in row["train"]):
            training[(symbol, lane(row))].append(key)
        if row["validation_n"] >= 150 and row["validation_dd"] < 0.1:
            descriptive[("gold" if symbol == "XAUUSD" else "forex", lane(row))].append(key)
        for axis in AXES:
            fixed = tuple((k, v) for k, v in sorted(variant.items()) if k != axis)
            neighborhoods[(symbol, step, axis, fixed)].append((variant[axis], key))
    seeds = {}
    for group, keys in sorted(training.items()):
        seeds["train/" + "/".join(group)] = max(keys, key=lambda k: (
            min(f["expectancy_r"] for f in configs[k]["train"]),
            sum(f["net_usd"] for f in configs[k]["train"]), k))
    for group, keys in sorted(descriptive.items()):
        seeds["diagnostic/" + "/".join(group)] = max(keys, key=lambda k: (configs[k]["validation_net"], k))
    adjacent = defaultdict(dict)
    for (_, _, axis, _), entries in neighborhoods.items():
        ordered = [key for _, key in sorted(entries)]
        for i, key in enumerate(ordered):
            if key in seeds.values():
                adjacent[key][axis] = ordered[max(i - 1, 0):i] + ordered[i + 1:i + 2]
    return seeds, dict(adjacent)


def replay(cache, executable, symbol, configs, archives):
    windows = sorted({x["variant"]["window"] for x in configs.values()})
    study = research.Study(cache, symbol, research.DEVELOPMENT, executable, windows)
    if study.manifest != archives:
        raise ValueError(f"Replay archive mismatch for {symbol}")
    results = {}
    for key, row in configs.items():
        variant = research.Variant(**row["variant"])
        cases = {}
        for stress in STRESSES:
            folds, trades = [], []
            for index, fold in enumerate(research.FOLDS):
                keep = stress == 1.0 and index >= 2
                result = study.run(variant, fold, stress=stress, gold_step=row["step_oz"], retain=keep)
                if keep:
                    trades.extend(result.pop("trades"))
                folds.append(result)
            cases[str(stress)] = folds
            if stress == 1.0 and research.digest(folds) != row["base_sha256"]:
                raise ValueError(f"Base replay differs for {key}")
            if stress == 1.0:
                weekly = research.bootstrap_weekly(trades)
        results[key] = {
            **{k: row[k] for k in ("symbol", "variant", "step_oz")},
            "folds_by_cost": cases, "weekly_validation_base": weekly,
            "development_base_pass": research.eligible(cases["1.0"]),
            "stress_pass": all(f["net_usd"] > 0 and f["max_drawdown"] < 0.1 and not f["halted"]
                               for f in cases["1.5"]),
        }
    return results


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cache", type=Path, required=True)
    parser.add_argument("--input", type=Path, nargs="+", required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    if args.output.exists():
        parser.error("Output exists. Use a new path.")
    configs, archives, sources = read_screens(args.input)
    seeds, adjacent = select(configs)
    selected = set(seeds.values())
    for axes in adjacent.values():
        selected.update(key for keys in axes.values() for key in keys)
    groups = defaultdict(dict)
    for key in sorted(selected):
        groups[configs[key]["symbol"]][key] = configs[key]
    args.output.parent.mkdir(parents=True, exist_ok=True)
    executable = research.build_executable(args.output.parent)
    with ProcessPoolExecutor(max_workers=8) as pool:
        futures = [pool.submit(replay, args.cache, executable, symbol, rows, archives[symbol])
                   for symbol, rows in sorted(groups.items())]
        results = {key: row for future in futures for key, row in future.result().items()}
    research.write_json(args.output, {
        "phase": "development-robustness", "years": research.DEVELOPMENT, "folds": research.FOLDS,
        "source": research.source_identity(), "wrapper_sha256": research.file_hash(Path(__file__)),
        "starting_equity_usd": 1000, "sources": sources, "archives": archives,
        "unique_source_configurations": len(configs), "seeds": seeds, "adjacent": adjacent, "results": results,
    })
    print(len(results), research.file_hash(args.output), flush=True)


if __name__ == "__main__":
    main()
