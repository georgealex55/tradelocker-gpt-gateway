#!/usr/bin/env python3
"""Read-only continuity audit for XMI FXCM/Dukascopy-derived M5 research CSV.
Usage: python3 scripts/xmi-m5-continuity-audit.py --input /path/EURUSD-2023-bid-m5.csv --pair EURUSD --year 2023
Never downloads data, calls brokers, or reads 2025. Does not classify market-closed gaps as bad data.
"""
import argparse
import csv
import json
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

PAIRS = ("EURUSD","GBPUSD","USDJPY","USDCHF","AUDUSD","USDCAD","NZDUSD")
def audit(path, pair, year):
    if pair not in PAIRS or year not in (2022, 2023):
        raise ValueError("Only seven registered FX pairs and 2022/2023 training years")
    counts=Counter()
    prev=None
    first=None
    last=None
    missing_intervals=0
    gap_events=0
    largest_gap_minutes=0
    non_monotonic=0
    rows=0
    with path.open(newline="") as stream:
        reader=csv.DictReader(stream)
        if reader.fieldnames != ["t","o","h","l","c"]:
            raise ValueError("Expected exact M5 bid CSV header t,o,h,l,c")
        for row in reader:
            dt=datetime.fromisoformat(row["t"].replace("Z","+00:00"))
            if dt.tzinfo is None or dt.utcoffset().total_seconds()!=0 or dt.year!=year:
                raise ValueError("Non-UTC or outside requested training year")
            epoch=int(dt.timestamp())
            if epoch%300: raise ValueError("M5 timestamp not five-minute aligned")
            o,h,l,c=(float(row[k]) for k in ("o","h","l","c"))
            if not (0<l<=min(o,c)<=max(o,c)<=h):
                raise ValueError("Invalid bid OHLC")
            if prev is not None:
                if epoch<=prev:
                    non_monotonic+=1
                    raise ValueError("Non-monotonic or duplicate timestamp")
                delta=epoch-prev
                if delta>300:
                    gap_events+=1
                    missing_intervals+=delta//300-1
                    largest_gap_minutes=max(largest_gap_minutes,delta//60-5)
                    # Classify gap boundaries, not inferred missing candles.
                    counts["gap_start_utc_hour_"+str(datetime.fromtimestamp(prev,timezone.utc).hour).zfill(2)]+=1
            counts["observed_utc_hour_"+str(dt.hour).zfill(2)]+=1
            counts["observed_utc_weekday_"+str(dt.weekday())]+=1
            counts["observed_month_"+dt.strftime("%Y-%m")]+=1
            first=epoch if first is None else first
            last=epoch
            prev=epoch
            rows+=1
    if not rows: raise ValueError("No bars")
    return {"pair":pair,"year":year,"source_file":path.name,
            "first_utc":datetime.fromtimestamp(first,timezone.utc).isoformat(),
            "last_utc":datetime.fromtimestamp(last,timezone.utc).isoformat(),
            "observed_m5_bars":rows,"gap_events":gap_events,
            "missing_m5_slots_between_observed_bars_including_weekends":missing_intervals,
            "largest_gap_excluding_endpoint_bar_minutes":largest_gap_minutes,
            "non_monotonic":non_monotonic,"counts":dict(sorted(counts.items())),
            "data_quality_note":"Raw gaps include normal market closures; review session/holiday calendar and DST before classifying missing data.",
            "mixed_source_2023_week27":"Must be independently identified from upstream source manifest; not derivable from this bid-only CSV.",
            "historical_gatesfx_execution_verified":False,
            "holdout_2025_read":False}
if __name__=="__main__":
    p=argparse.ArgumentParser()
    p.add_argument("--input",required=True,type=Path)
    p.add_argument("--pair",required=True,choices=PAIRS)
    p.add_argument("--year",required=True,type=int,choices=(2022,2023))
    args=p.parse_args()
    print(json.dumps(audit(args.input,args.pair,args.year),indent=2))
