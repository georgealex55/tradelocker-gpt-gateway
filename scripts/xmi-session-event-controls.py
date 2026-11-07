#!/usr/bin/env python3
"""Apply calendar coverage and DST-aware entry and flattening windows in research."""
import argparse
from concurrent.futures import ProcessPoolExecutor
from dataclasses import dataclass
from datetime import datetime, timedelta
from importlib import import_module
import json
from pathlib import Path
import subprocess
from zoneinfo import ZoneInfo

quote = import_module("xmi-session-quote-replay")
research = quote.research
MINUTE = quote.MINUTE_MS
NY = ZoneInfo("America/New_York")


def epoch_ms(value):
    stamp = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if stamp.tzinfo is None:
        raise ValueError("Calendar timestamps require an explicit timezone")
    return int(stamp.timestamp() * 1000)


@dataclass(frozen=True)
class Restrictions:
    intervals: tuple
    coverage_missing: bool = False

    def entry_reason(self, stamp):
        if self.coverage_missing:
            return "calendar_incomplete"
        for start, end, reason in self.intervals:
            if start <= stamp <= end:
                return reason
        return None

    def last_allowed_minute(self, entry_ms, planned_minute):
        for start, _, reason in self.intervals:
            if entry_ms < start <= (planned_minute + 1) * MINUTE - 1:
                return min(planned_minute, start // MINUTE - 1), reason
        return planned_minute, None

    def verify_trade(self, entry_ms, exit_ms):
        if self.coverage_missing or any(entry_ms <= end and exit_ms >= start for start, end, _ in self.intervals):
            raise ValueError("A controlled trade overlapped a blackout")


def merge_intervals(intervals):
    merged = []
    for start, end, reason in sorted(intervals):
        if start > end:
            raise ValueError("Blackout starts after its end")
        if merged and start <= merged[-1][1] + 1:
            left, right, labels = merged.pop()
            reason = "+".join(sorted(set(labels.split("+") + reason.split("+"))))
            merged.append((left, max(end, right), reason))
        else:
            merged.append((start, end, reason))
    return tuple(merged)


def rollover_windows(start, end):
    first = datetime.fromtimestamp(start / 1000, NY).date() - timedelta(days=3)
    last = datetime.fromtimestamp(end / 1000, NY).date() + timedelta(days=1)
    intervals = []
    day = first
    while day <= last:
        if day.weekday() < 5:
            before = datetime(day.year, day.month, day.day, 16, 45, tzinfo=NY)
            after_day = day + timedelta(days=2) if day.weekday() == 4 else day
            after = datetime(after_day.year, after_day.month, after_day.day, 17, 15, tzinfo=NY)
            intervals.append((int(before.timestamp() * 1000), int(after.timestamp() * 1000), "rollover"))
        day += timedelta(days=1)
    return intervals


def load_calendar(path):
    calendar = json.loads(path.read_text())
    if calendar["schema_version"] not in (1, 2) or calendar["coverage"] not in ("partial", "complete"):
        raise ValueError("Unknown calendar format or completeness")
    start, end = epoch_ms(calendar["valid_from"]), epoch_ms(calendar["valid_to"])
    if start >= end:
        raise ValueError("Calendar coverage is reversed")
    complete = calendar["complete_currencies"]
    known = {s[:3] for s in research.SYMBOLS} | {s[3:] for s in research.SYMBOLS}
    if (not isinstance(complete, list) or any(c not in known for c in complete)
            or len(set(complete)) != len(complete) or calendar["coverage"] == "partial" and complete):
        raise ValueError("Invalid complete currency coverage")
    identities = set()
    for event in calendar["events"]:
        if "scheduled_at" in event:
            at = epoch_ms(event["scheduled_at"])
            valid_time = start <= at < end and at % MINUTE == 0
            identity_time = at
        else:
            left, right = epoch_ms(event["blackout_from"]), epoch_ms(event["blackout_to"])
            valid_time = start - 86400000 <= left < right <= end + 86400000
            identity_time = (left, right)
        if (not valid_time or event["kind"] not in ("macro", "fomc", "central_bank")
                or event.get("risk_action", "blackout") not in ("blackout", "observe")
                or not isinstance(event["currencies"], list) or not event["currencies"]
                or any(c not in known for c in event["currencies"])
                or not event["source"].startswith("https://")):
            raise ValueError("Event is invalid or outside declared coverage")
        identity = event.get("id", (identity_time, event["name"], tuple(event["currencies"])))
        if identity in identities:
            raise ValueError("Duplicate calendar event")
        identities.add(identity)
    return calendar


def build_profiles(symbol, calendar, settings, partial):
    start, end = (research.utc_minute(d) * MINUTE for d in quote.FOLD[1:])
    currencies = {symbol[:3], symbol[3:]} - {"XAU"}
    full = (calendar["coverage"] == "complete" and currencies <= set(calendar["complete_currencies"])
            and epoch_ms(calendar["valid_from"]) <= start and epoch_ms(calendar["valid_to"]) >= end)
    news = []
    for event in calendar["events"]:
        if event.get("risk_action", "blackout") == "observe" or not currencies.intersection(event["currencies"]):
            continue
        prefix = "fomc" if event["kind"] in ("fomc", "central_bank") else ""
        before = settings["fomcPreEventMinutes" if prefix else "preEventMinutes"]
        after = settings["fomcPostEventMinutes" if prefix else "postEventMinutes"]
        if "scheduled_at" in event:
            left = right = epoch_ms(event["scheduled_at"])
        else:
            left, right = epoch_ms(event["blackout_from"]), epoch_ms(event["blackout_to"])
        news.append((left - before * MINUTE, right + after * MINUTE, "news"))
    rollover = rollover_windows(start, end)
    missing = not full and not partial
    return {
        "news": Restrictions(merge_intervals(news), missing),
        "rollover": Restrictions(merge_intervals(rollover)),
        "news+rollover": Restrictions(merge_intervals(news + rollover), missing),
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ("cache", "ticks", "normalized", "calendar", "output"):
        parser.add_argument(f"--{name}", type=Path, required=True)
    parser.add_argument("--allow-partial-news", action="store_true", help="Diagnostic comparison with declared incomplete coverage")
    args = parser.parse_args()
    if args.output.exists():
        parser.error("Output exists. Use a new path.")
    root = Path(__file__).resolve().parent.parent
    setting_file = root / "lib/forexStrategyV1Config.js"
    command = "import {FOREX_STRATEGY_V1_CONFIG as c} from './lib/forexStrategyV1Config.js'; process.stdout.write(JSON.stringify(c.eventRisk));"
    settings = json.loads(subprocess.run(["node", "--input-type=module", "-e", command],
                                         cwd=root, check=True, capture_output=True, text=True).stdout)
    calendar = load_calendar(args.calendar)
    docs = root / "docs"
    leaders, freeze, spread, baseline = [json.loads((docs / name).read_text()) for name in
        ("xmi-session-leader-audit-checkpoint-11.json", "xmi-session-frozen-checkpoint-10.json",
         "xmi-session-spread-checkpoint-02.json", "xmi-session-quote-replay-202401.json")]
    if (freeze["source"] != research.source_identity() or freeze["finalists"]
            or research.digest({k: v for k, v in freeze.items() if k != "freeze_sha256"}) != freeze["freeze_sha256"]):
        raise ValueError("Frozen research engine or shortlist changed")
    args.output.parent.mkdir(parents=True, exist_ok=True)
    executable = research.build_executable(args.output.parent)
    with ProcessPoolExecutor(max_workers=8) as pool:
        tasks = [pool.submit(
            quote.run_symbol, symbol, {k: v for k, v in leaders["leaders"].items() if v["symbol"] == symbol},
            spread["symbols"][symbol]["paired_archive"], freeze["development_archives"][symbol],
            args.cache, args.ticks, args.normalized, executable,
            build_profiles(symbol, calendar, settings, args.allow_partial_news)) for symbol in research.SYMBOLS]
        symbols = dict(task.result() for task in tasks)
    for symbol, data in symbols.items():
        for group, row in data["results"].items():
            if row["cases"] != baseline["symbols"][symbol]["results"][group]["cases"]:
                raise ValueError(f"Uncontrolled quote replay differs for {group}")
    research.write_json(args.output, {
        "purpose": "calendar and rollover research controls", "evaluation_utc": quote.FOLD[1:],
        "starting_equity_usd": 1000, "holdout_read": False, "calendar_mode": "partial diagnostic" if args.allow_partial_news else "strict",
        "calendar_sha256": research.file_hash(args.calendar), "calendar_coverage": calendar["coverage"],
        "event_settings": {k: settings[k] for k in ("preEventMinutes", "postEventMinutes", "fomcPreEventMinutes", "fomcPostEventMinutes")},
        "settings_source_sha256": research.file_hash(setting_file), "source": research.source_identity() | {
            p.name: research.file_hash(p) for p in (Path(__file__), Path(quote.__file__))},
        "baseline_sha256": research.file_hash(docs / "xmi-session-quote-replay-202401.json"),
        "rollover": {"zone": "America/New_York", "entry_blackout_local": ["16:45", "17:15"], "friday_to_sunday": True},
        "symbols": symbols,
    })
    print(research.file_hash(args.output), flush=True)


if __name__ == "__main__":
    main()
