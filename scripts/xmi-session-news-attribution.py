#!/usr/bin/env python3
"""Diagnose news-window opportunity costs without changing the frozen strategy."""
import argparse
from collections import Counter, defaultdict
from datetime import datetime, timezone
from importlib import import_module
import json
from pathlib import Path
from zoneinfo import ZoneInfo

screen = import_module("xmi-session-calendar-screen")
controls = screen.controls
research = screen.research
NY = ZoneInfo("America/New_York")


def news_records(calendar, settings):
    records = []
    for event in calendar["events"]:
        if event.get("risk_action", "blackout") == "observe" or "USD" not in event["currencies"]:
            continue
        policy = event["kind"] in ("fomc", "central_bank")
        before = settings["fomcPreEventMinutes" if policy else "preEventMinutes"]
        after = settings["fomcPostEventMinutes" if policy else "postEventMinutes"]
        if "scheduled_at" in event:
            left = right = controls.epoch_ms(event["scheduled_at"])
        else:
            left, right = controls.epoch_ms(event["blackout_from"]), controls.epoch_ms(event["blackout_to"])
        records.append({"id": event["id"], "name": event["name"], "left": left - before * controls.MINUTE,
                        "right": right + after * controls.MINUTE, "kind": event["kind"],
                        "uncertain": event["time_status"] == "uncertain", "source": event["source"]})
    return records


def restriction(records, rollover, exclude=()):
    excluded = set(exclude)
    return controls.Restrictions(controls.merge_intervals(
        [(r["left"], r["right"], "news") for r in records if r["id"] not in excluded] + list(rollover)))


def components(records, period):
    left, right = (research.utc_minute(d) * controls.MINUTE for d in period)
    intervals = controls.merge_intervals((r["left"], r["right"], "news") for r in records)
    output = []
    for start, end, _ in intervals:
        if start >= right or end < left:
            continue
        members = [r for r in records if r["left"] <= end and r["right"] >= start]
        output.append({"left": start, "right": end, "ids": sorted(r["id"] for r in members),
                       "names": sorted({r["name"] for r in members}), "uncertain": any(r["uncertain"] for r in members),
                       "local_start": datetime.fromtimestamp(start / 1000, NY).isoformat(),
                       "local_end": datetime.fromtimestamp(end / 1000, NY).isoformat()})
    return output


def entry_key(trade):
    return trade["entry_minute"], trade["side"]


def accounting(base, controlled, records):
    a, b = {entry_key(t): t for t in base}, {entry_key(t): t for t in controlled}
    if len(a) != len(base) or len(b) != len(controlled):
        raise ValueError("Trade entry identity is ambiguous")
    removed, added, common = set(a) - set(b), set(b) - set(a), set(a) & set(b)
    bundles = defaultdict(lambda: {"trades": 0, "wins": 0, "losses": 0, "baseline_net_usd": 0.})
    unassigned = []
    for key in sorted(removed):
        trade = a[key]
        first, last = trade["entry_minute"] * controls.MINUTE, (trade["entry_minute"] + 1) * controls.MINUTE - 1
        names = tuple(sorted({r["name"] for r in records if first <= r["right"] and last >= r["left"]}))
        if not names:
            unassigned.append(trade)
            continue
        item = bundles[names]
        item["trades"] += 1
        item["wins"] += trade["pnl_usd"] > 0
        item["losses"] += trade["pnl_usd"] < 0
        item["baseline_net_usd"] += trade["pnl_usd"]
    shared_change = sum(b[k]["pnl_usd"] - a[k]["pnl_usd"] for k in common)
    removed_net, added_net = sum(a[k]["pnl_usd"] for k in removed), sum(b[k]["pnl_usd"] for k in added)
    total_change = sum(t["pnl_usd"] for t in controlled) - sum(t["pnl_usd"] for t in base)
    if abs(-removed_net + added_net + shared_change - total_change) > 1e-8:
        raise ValueError("Trade accounting does not reconcile")
    early = []
    for key in sorted(common):
        old, new = a[key], b[key]
        if new["exit_minute"] >= old["exit_minute"]:
            continue
        begin = (new["exit_minute"] + 1) * controls.MINUTE
        triggers = [r for r in records if r["left"] == begin]
        # Separate exit-price effects at original units from downstream equity-sizing changes.
        exit_effect = old["units"] * (new["pnl_usd"] / new["units"] - old["pnl_usd"] / old["units"])
        size_effect = (new["units"] - old["units"]) * new["pnl_usd"] / new["units"]
        if abs(exit_effect + size_effect - (new["pnl_usd"] - old["pnl_usd"])) > 1e-8:
            raise ValueError("Early-exit accounting does not reconcile")
        early.append({"entry_minute": old["entry_minute"], "original_exit_minute": old["exit_minute"],
                      "controlled_exit_minute": new["exit_minute"], "event_names": sorted({r["name"] for r in triggers}),
                      "event_ids": sorted(r["id"] for r in triggers), "net_change_usd": new["pnl_usd"] - old["pnl_usd"],
                      "exit_effect_at_original_units_usd": exit_effect, "size_effect_usd": size_effect})
    return {"baseline_trades": len(a), "controlled_trades": len(b), "removed_original_trades": len(removed),
            "removed_winners": sum(a[k]["pnl_usd"] > 0 for k in removed),
            "removed_losers": sum(a[k]["pnl_usd"] < 0 for k in removed), "removed_net_usd": removed_net,
            "new_entry_trades": len(added), "new_entry_net_usd": added_net,
            "shared_entries": len(common), "shared_entry_net_change_usd": shared_change,
            "total_net_change_usd": total_change,
            "blocked_entry_bundles": sorted(({"names": list(names), **value} for names, value in bundles.items()),
                                              key=lambda r: r["baseline_net_usd"], reverse=True),
            "removed_entries_without_direct_blackout": len(unassigned),
            "removed_unassigned_net_usd": sum(t["pnl_usd"] for t in unassigned), "early_exits": early}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ("cache", "calendar", "output"):
        parser.add_argument(f"--{name}", type=Path, required=True)
    args = parser.parse_args()
    if args.output.exists():
        parser.error("Output exists; preserve the earlier analysis")
    root = Path(__file__).resolve().parents[1]
    source_path = root / "docs/xmi-session-calendar-rerun-2022-2024.json"
    source = json.loads(source_path.read_text())
    calendar = controls.load_calendar(args.calendar)
    if (research.file_hash(args.calendar) != source["calendar_sha256"] or research.source_identity() != source["source"]):
        raise ValueError("Frozen price engine or calendar changed")
    row = source["symbols"]["XAUUSD"]["leaders"]["intraday"]
    variant = research.Variant(**row["variant"])
    records = news_records(calendar, source["event_settings"])
    expected = controls.build_profiles("XAUUSD", calendar, source["event_settings"], False, period=screen.PERIOD)
    rollover = expected["rollover"].intervals
    full = restriction(records, rollover)
    if full != expected["news+rollover"]:
        raise ValueError("Attribution intervals differ from the original policy")
    executable = research.build_executable(args.output.parent)
    study = screen.CalendarStudy(args.cache, "XAUUSD", research.DEVELOPMENT, executable, [variant.window], restrictions=full)
    step = row["step_oz"]

    def run(profile, *, retain=False, stress=1.):
        study.restrictions = profile
        study.control_cache.clear()
        folds, trades = [], []
        for fold in research.FOLDS[2:]:
            result = study.run(variant, fold, gold_step=step, retain=retain, stress=stress)
            if retain:
                log = result.pop("trades")
                if study.controlled:
                    study.audit_trades(log)
                trades.extend(log)
            folds.append(result)
        return folds, trades

    study.controlled = False
    baseline, original_trades = run(full, retain=True)
    study.controlled = True
    complete, controlled_trades = run(full, retain=True)
    stressed, _ = run(full, stress=1.5)
    if baseline != row["baseline_folds"][2:] or complete != row["folds"][2:] or stressed != row["stress_folds"][2:]:
        raise ValueError("Matched results do not reproduce")
    full_net = sum(f["net_usd"] for f in complete)
    year_left, year_right = (research.utc_minute(d) * controls.MINUTE for d in ("2024-01-01", "2025-01-01"))
    relevant = [r for r in records if r["left"] < year_right and r["right"] >= year_left]
    types = []
    for name in sorted({r["name"] for r in relevant}):
        ids = [r["id"] for r in relevant if r["name"] == name]
        profile = restriction(records, rollover, ids)
        folds, _ = run(profile)
        stress, _ = run(profile, stress=1.5)
        net, stress_net = sum(f["net_usd"] for f in folds), sum(f["net_usd"] for f in stress)
        types.append({"name": name, "events_removed": len(ids), "net_usd": net,
                      "profit_recovered_usd": net - full_net, "trades": sum(f["n"] for f in folds),
                      "stressed_net_usd": stress_net, "folds": folds, "stress_folds": stress})
    print(f"Event types completed: {len(types)}", flush=True)
    windows = []
    for component in components(records, ("2024-01-01", "2025-01-01")):
        folds, _ = run(restriction(records, rollover, component["ids"]))
        net = sum(f["net_usd"] for f in folds)
        windows.append({**component, "net_usd": net, "profit_recovered_usd": net - full_net,
                        "trades": sum(f["n"] for f in folds), "folds": folds})
    types.sort(key=lambda r: r["profit_recovered_usd"], reverse=True)
    windows.sort(key=lambda r: r["profit_recovered_usd"], reverse=True)
    result = {"purpose": "Frozen gold intraday news-window attribution; diagnostic ablations, no rule changes",
              "source_summary_sha256": research.file_hash(source_path), "calendar_sha256": research.file_hash(args.calendar),
              "source": research.source_identity(), "wrapper_sha256": research.file_hash(Path(__file__)),
              "config": {k: row[k] for k in ("symbol", "variant", "step_oz", "config_id")},
              "folds": research.FOLDS[2:], "starting_equity_usd": 1000,
              "baseline_folds": baseline, "complete_calendar_folds": complete, "stressed_complete_folds": stressed,
              "matched_accounting": accounting(original_trades, controlled_trades, records),
              "event_type_ablations": types, "window_ablations": windows,
              "account_replays": 6 + 4 * len(types) + 2 * len(windows), "holdout_archives_read": False,
              "limitations": ["Ablation effects are conditional, nonlinear, and cannot be added across rows.",
                              "Calendar overlap identifies policy exposure, not the cause of market price movement.",
                              "This is 2024 validation diagnosis; no policy was selected or qualified from the ablations.",
                              "Costs are modeled; holiday and announcement spreads are not independently observed."]}
    research.write_json(args.output, result)
    print(json.dumps({"types": len(types), "windows": len(windows), "account_replays": result["account_replays"],
                      "top_types": [{k: r[k] for k in ("name", "profit_recovered_usd", "events_removed")} for r in types[:8]],
                      "top_windows": [{k: r[k] for k in ("names", "local_start", "local_end", "profit_recovered_usd")} for r in windows[:8]]}), flush=True)


if __name__ == "__main__":
    main()
