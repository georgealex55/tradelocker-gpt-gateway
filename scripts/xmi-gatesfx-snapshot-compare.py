#!/usr/bin/env python3
"""Provisional, UNRANKED seven-pair historical 2022/2023 GatesFX screenshot sensitivity.
Reads ONLY result JSON created from public FXCM / separately labeled Duka W27 inputs.
No 2024/2025 or raw vendor files; no profit qualification.
"""
import argparse
import hashlib
import json
import statistics
from pathlib import Path

YEARS=(2022,2023)
SIZINGS=("risk_0.0025","risk_0.005","risk_0.01","fixed_0.01")
PAIR_SET={"EURUSD","GBPUSD","USDJPY","USDCHF","AUDUSD","USDCAD","NZDUSD"}

def summary(rows):
    selected=[r for r in rows if r["lane"]=="risk_fit" and r["carry"]=="session_flat"]
    out={}
    for tier in sorted({r["sizing"] for r in selected}):
        vals=[r for r in selected if r["sizing"]==tier]
        assert len(vals)==8, (tier,len(vals))
        eligible=[r for r in vals if r["settledFunded"]>=20]
        out[tier]=dict(configurations=len(vals),configs_with_20_funded_trades=len(eligible),
            configs_positive_net_with_20_trades=sum(r["netFundedUSD"]>0 for r in eligible),
            funded_trade_count_range=[min(r["settledFunded"] for r in vals),
                                      max(r["settledFunded"] for r in vals)],
            eligible_net_usd_range=[min((r["netFundedUSD"] for r in eligible),default=None),
                                    max((r["netFundedUSD"] for r in eligible),default=None)],
            eligible_median_net_usd=(statistics.median(r["netFundedUSD"] for r in eligible)
                                     if eligible else None))
    return out

def key(row):
    return tuple(row[k] for k in ("rangeModel","entryModel","exitModel","carry","sizing","lane"))

def load(directory,symbol,year,flavor):
    suffix="amd" if flavor=="baseline" else flavor
    name=f"{symbol}-{suffix}-{year}.json"
    o=json.loads((directory/name).read_text())
    assert o["symbol"]==symbol and o["fold"]==f"training_{year}"
    assert o["startingUSD"]==1000 and not o["holdoutRead"] and not o["productionChanged"]
    assert o["historicalSTPBidAskVerified"] is False and o["qualifiers"]==0
    assert len(o["rows"])==o["variants"]
    assert len({key(r) for r in o["rows"]})==len(o["rows"])
    return o

def execute(symbol,directory):
    if symbol not in PAIR_SET:raise ValueError("Only seven registered majors; 2025 sealed")
    years={}
    for year in YEARS:
        baseline=load(directory,symbol,year,"baseline")
        snapshot=load(directory,symbol,year,"snapshot")
        aggressive=load(directory,symbol,year,"experimental2pct")
        assert baseline["inputSHA256"]==snapshot["inputSHA256"]==aggressive["inputSHA256"]
        assert baseline["dataRows"]==snapshot["dataRows"]==aggressive["dataRows"]
        assert baseline["variants"]==192 and snapshot["variants"]==192
        assert aggressive["variants"]==48 and aggressive["experimentalHighRiskOnly"] is True
        assert snapshot["experimentalHighRiskOnly"] is False
        assert {r["sizing"] for r in aggressive["rows"]}=={"risk_0.02"}
        assert {r["sizing"] for r in baseline["rows"]}==set(SIZINGS)
        b={key(r):r for r in baseline["rows"]}
        n={key(r):r for r in snapshot["rows"]}
        assert set(b)==set(n)
        eligible_pairs=[(b[k],n[k]) for k in b if
           k[3]=="session_flat" and k[5]=="risk_fit"
           and b[k]["settledFunded"]>=20 and n[k]["settledFunded"]>=20]
        per_tier_delta={}
        for tier in SIZINGS:
            diffs=[new["netFundedUSD"]-old["netFundedUSD"] for old,new in eligible_pairs
                   if new["sizing"]==tier]
            per_tier_delta[tier]={
                "matched_eligible_configs":len(diffs),
                "net_delta_range_USD":[min(diffs),max(diffs)] if diffs else None,
                "net_delta_median_USD":statistics.median(diffs) if diffs else None}
        years[str(year)]={
            "m5_rows":baseline["dataRows"],
            "reused_input_m5_sha256":baseline["inputSHA256"],
            "baseline_catalog_sha256":baseline["catalogSHA256"],
            "baseline_scenarios":baseline["variants"],
            "snapshot_scenarios":snapshot["variants"],
            "experimental_2pct_scenarios":aggressive["variants"],
            "baseline_same_day_funded":summary(baseline["rows"]),
            "snapshot_same_day_funded":summary(snapshot["rows"]),
            "experimental_2pct_same_day_funded":summary(aggressive["rows"]),
            "paired_snapshot_minus_baseline":per_tier_delta,
            "zero_broker_trade_orders":True,"sealed_2025_unread":True
        }
    report={
        "symbol":symbol,"status":"PROVISIONAL_UNRANKED",
        "historical_broker_execution_verified":False,
        "account_contract_status":"USER_PLATFORM_SNAPSHOT_PARTIAL_LOT_STEP_ASSUMED",
        "data_source":"FXCM M1 bid/ask -> M5 bid, Dukascopy M5 bid substitution for 2023 week27",
        "data_periods":["2022 training","2023 training"],
        "starting_usd_per_independent_scenario":1000,
        "common_cost_assumption":"0.3 pip adverse slippage per side unverified historical GatesFX",
        "spread_scenario":"selected upper user-screenshot observed spread, fixed throughout replay, not historical",
        "lot_step_assumption":"0.01 inherited research model; not verified instrument lot increment",
        "experimental_risk_tier":"risk_0.02 isolated; not live sizing approval",
        "qualification":"NONE: no independent OOS, historical GatesFX spreads or slippage",
        "2024":"previously exposed development, not accessed",
        "2025_holdout":"SEALED_UNREAD",
        "years":years,
        "cautions":["per-tier config net ranges are diagnostics, not portfolios or strategy rankings",
            "all row counts represent independently simulated scenarios, not independent OOS samples",
            "no correlated-capital contention modeling across all seven symbols",
            "historical margin closeout, swaps, price gaps and fills not broker verified"]
        }
    p=directory/f"{symbol}-gatesfx-snapshot-comparison.json"
    p.write_text(json.dumps(report,indent=2)+"\n")
    print(json.dumps({"symbol":symbol,"status":report["status"],
        "years":{y:{"m5_rows":v["m5_rows"],
        "baseline":v["baseline_scenarios"],"snapshot":v["snapshot_scenarios"],
        "experimental2pct":v["experimental_2pct_scenarios"],
        "snapshot_same_day":v["snapshot_same_day_funded"],
        "experimental_2pct_same_day":v["experimental_2pct_same_day_funded"],
        "paired_delta":v["paired_snapshot_minus_baseline"]} for y,v in years.items()}},sort_keys=True))
    return report

if __name__=="__main__":
    a=argparse.ArgumentParser()
    a.add_argument("--symbol",required=True)
    a.add_argument("--out-dir",type=Path,required=True)
    args=a.parse_args()
    execute(args.symbol,args.out_dir)
