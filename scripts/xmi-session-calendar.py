#!/usr/bin/env python3
"""Normalize complete monthly provider pages without publishing vendor event rows."""
import argparse
import calendar
from collections import Counter
from datetime import date, datetime, timedelta, timezone
from hashlib import sha256
from html import unescape
from json import JSONDecoder
import json
from pathlib import Path
import re
import time
from urllib.request import Request, urlopen
from zoneinfo import ZoneInfo

CURRENCIES = ("USD", "EUR", "GBP", "JPY", "CHF", "AUD", "CAD", "NZD")
YEARS = (2022, 2023, 2024)
LONDON = ZoneInfo("Europe/London")
POLICY = re.compile(r"policy rate|cash rate|bank rate|interest rate|refinancing rate|federal funds rate|monetary policy|rate statement|policy statement|press conference", re.I)


def digest(path):
    return sha256(path.read_bytes()).hexdigest()


def utc(stamp):
    return datetime.fromtimestamp(stamp, timezone.utc).isoformat().replace("+00:00", "Z")


def extract_days(raw, year, month):
    text = raw.decode("utf-8")
    copies = []
    for match in re.finditer(r"\bdays\s*:\s*", text):
        value, _ = JSONDecoder().raw_decode(text[match.end():])
        if isinstance(value, list):
            copies.append(value)
    if not copies or any(value != copies[0] for value in copies[1:]):
        raise ValueError(f"{year}-{month:02}: calendar state is missing or inconsistent")
    days = copies[0]
    actual = [datetime.fromtimestamp(day["dateline"], LONDON).date() for day in days]
    expected = [date(year, month, day) for day in range(1, calendar.monthrange(year, month)[1] + 1)]
    if actual != expected:
        raise ValueError(f"{year}-{month:02}: provider does not cover every requested day")
    rows = sum(len(day["events"]) for day in days)
    if len(re.findall(r'<tr\b[^>]*\bdata-event-id=', text)) != rows:
        raise ValueError(f"{year}-{month:02}: rendered table and serialized row counts differ")
    return days


def normalize_event(event, day):
    currency = event["currency"]
    if currency not in (*CURRENCIES, "All"):
        return None
    impact = event["impactName"]
    if impact not in ("high", "medium", "low", "holiday"):
        raise ValueError("Unknown provider impact category")
    name = unescape(event["name"]).strip()
    fed = currency == "USD" and name.startswith("FOMC") and "Member" not in name
    central_bank = bool(POLICY.search(name)) or fed
    holiday = impact == "holiday"
    active = impact == "high" or central_bank or holiday or currency == "All" and impact == "medium"
    at = datetime.fromtimestamp(int(event["dateline"]), timezone.utc)
    local_day = datetime.fromtimestamp(day["dateline"], LONDON).date()
    variable_boj = currency == "JPY" and bool(re.search(r"BOJ Policy Rate|Monetary Policy Statement|BOJ Press Conference", name, re.I))
    uncertain = bool(event["timeMasked"]) or variable_boj or at.second != 0
    result = {
        "id": f'ff-{event["id"]}-{local_day.isoformat()}',
        "name": name, "currencies": list(CURRENCIES) if currency == "All" else [currency],
        "kind": "fomc" if fed else "central_bank" if central_bank else "macro",
        "impact": impact, "risk_action": "blackout" if active else "observe",
        "source": "https://www.forexfactory.com" + event["url"],
        "provider_id": event["id"], "source_currency": currency, "provider_day": local_day.isoformat(),
        "provider_timestamp_utc": utc(int(event["dateline"])),
        "time_status": "uncertain" if uncertain else "scheduled",
    }
    if uncertain:
        before = datetime(local_day.year, local_day.month, local_day.day, tzinfo=LONDON)
        next_day = local_day + timedelta(days=1)
        after = datetime(next_day.year, next_day.month, next_day.day, tzinfo=LONDON)
        result["blackout_from"] = utc(int(before.timestamp()))
        result["blackout_to"] = utc(int(after.timestamp()))
    else:
        if at.astimezone(LONDON).date() != local_day:
            raise ValueError(f"Timed event {event['id']} disagrees with its source calendar day")
        result["scheduled_at"] = utc(int(event["dateline"]))
    return result


def verify_anchors(events, anchors):
    checks = []
    for anchor in anchors:
        matches = [e for e in events if anchor["currency"] in e["currencies"]
                   and ("provider_day" not in anchor or e["provider_day"] == anchor["provider_day"])
                   and re.search(anchor["name_pattern"], e["name"], re.I)]
        if "expected_utc" in anchor:
            matches = [e for e in matches if e["provider_timestamp_utc"] == anchor["expected_utc"]]
        if "official_local_date" in anchor:
            zone = ZoneInfo(anchor["official_zone"])
            matches = [e for e in matches if datetime.fromisoformat(e["provider_timestamp_utc"].replace("Z", "+00:00")).astimezone(zone).date().isoformat() == anchor["official_local_date"]]
        if not matches:
            raise ValueError(f"Official calendar check failed for {anchor['name']}")
        checks.append({**anchor, "matched_provider_ids": [e["provider_id"] for e in matches]})
    if {c["currency"] for c in checks} != set(CURRENCIES):
        raise ValueError("Official checks must cover all eight research currencies")
    return checks


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ("cache", "anchors", "output", "manifest"):
        parser.add_argument(f"--{name}", type=Path, required=True)
    parser.add_argument("--download", action="store_true", help="Fetch uncached public months, with one request every second")
    args = parser.parse_args()
    if args.output.exists() or args.manifest.exists():
        parser.error("Output exists. Use new paths.")
    args.cache.mkdir(parents=True, exist_ok=True)
    events, pages, identities = [], [], set()
    counts = Counter()
    for year in YEARS:
        for month in range(1, 13):
            path = args.cache / f"ff-{year}-{month:02}.html"
            url = f"https://www.forexfactory.com/calendar?month={calendar.month_abbr[month].lower()}.{year}"
            if not path.exists():
                if not args.download:
                    raise FileNotFoundError(path.name)
                time.sleep(1)
                with urlopen(Request(url, headers={"User-Agent": "XMI historical calendar research"}), timeout=30) as response:
                    raw = response.read()
                extract_days(raw, year, month)
                temporary = path.with_suffix(".partial")
                temporary.write_bytes(raw)
                temporary.replace(path)
            days = extract_days(path.read_bytes(), year, month)
            imported = []
            for day in days:
                for row in day["events"]:
                    event = normalize_event(row, day)
                    if event is None:
                        continue
                    if event["id"] in identities:
                        raise ValueError(f"Duplicate provider event identity {event['id']}")
                    identities.add(event["id"])
                    imported.append(event)
                    if event["source_currency"] in CURRENCIES:
                        counts[(event["source_currency"], year)] += 1
            per_currency = {c: sum(e["source_currency"] == c for e in imported) for c in CURRENCIES}
            if any(n == 0 for n in per_currency.values()):
                raise ValueError(f"{year}-{month:02}: missing research currency")
            pages.append({"year": year, "month": month, "source": url, "sha256": digest(path), "bytes": path.stat().st_size,
                          "days": len(days), "source_rows": sum(len(d["events"]) for d in days),
                          "imported_rows": len(imported), "per_currency": per_currency})
            events.extend(imported)
    checks = verify_anchors(events, json.loads(args.anchors.read_text())["checks"])
    value = {
        "schema_version": 2, "coverage": "complete", "valid_from": "2022-01-01T00:00:00Z", "valid_to": "2025-01-01T00:00:00Z",
        "complete_currencies": list(CURRENCIES), "coverage_scope": "All published provider events and holidays in 36 complete monthly pages",
        "risk_policy": "Black out high-impact releases, central-bank policy events, global medium/high events and currency holidays; retain other events for inspection.",
        "point_in_time_snapshot": False, "uncertain_time_policy": "Full provider calendar day with configured pre/post buffers",
        "limitations": ["Provider classifications and historical schedules can be revised after publication.",
                        "Surprise headlines and broker-specific calendars require separate controls.",
                        "Official spot checks audit timing but do not independently reverify every provider row."],
        "events": events,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(value, separators=(",", ":")) + "\n")
    manifest = {
        "scope": value["coverage_scope"], "coverage": "complete", "valid_from": value["valid_from"], "valid_to": value["valid_to"],
        "complete_currencies": list(CURRENCIES), "calendar_sha256": digest(args.output),
        "source_script_sha256": digest(Path(__file__)), "anchors_sha256": digest(args.anchors),
        "days_verified": sum(p["days"] for p in pages), "source_rows": sum(p["source_rows"] for p in pages),
        "imported_events": len(events), "blackout_events": sum(e["risk_action"] == "blackout" for e in events),
        "uncertain_events": sum(e["time_status"] == "uncertain" for e in events),
        "uncertain_blackout_events": sum(e["time_status"] == "uncertain" and e["risk_action"] == "blackout" for e in events),
        "per_currency_year": {c: {str(y): counts[(c, y)] for y in YEARS} for c in CURRENCIES},
        "official_checks": checks, "pages": pages, "holdout_prices_read": False,
    }
    args.manifest.parent.mkdir(parents=True, exist_ok=True)
    args.manifest.write_text(json.dumps(manifest, separators=(",", ":")) + "\n")
    print({k: manifest[k] for k in ("days_verified", "source_rows", "imported_events", "blackout_events", "uncertain_blackout_events")})


if __name__ == "__main__":
    main()
