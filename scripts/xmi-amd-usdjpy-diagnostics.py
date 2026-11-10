#!/usr/bin/env python3
"""Analyze frozen USDJPY AMD historical ledgers and cost-stress sensitivity.
Reads only isolated 2022/2023 results; never accesses 2024 or 2025.
"""
import json, math, sys
from pathlib import Path

d=Path(sys.argv[1])
sel={"rangeModel":"session_asia_london","entryModel":"range_reclaim_retest",
     "exitModel":"bracket_2r","carry":"session_flat","sizing":"risk_0.01",
     "lane":"risk_fit","profile":"modeled_base_stp"}
def selected(year,which="amd"):
    result=json.loads((d/f"USDJPY-{which}-{year}.json").read_text())
    matches=[x for x in result["rows"] if all(x.get(k)==v for k,v in sel.items())]
    if len(matches)!=1:raise ValueError(f"Expected one match for {year}/{which}, got {len(matches)}")
    return matches[0]

res={"symbol":"USDJPY","type":"diagnostic_training_only","years":[2022,2023],
     "zero_commission":True,"starting_account_each_year_usd":1000,
     "source_2022":"FXCM M1 bid",
     "source_2023":"FXCM M1 bid with independent Dukascopy M5 bid 2023 week27",
     "historical_gatesfx_execution_verified":False,
     "2025_holdout_read":False,"production_changed":False,
     "configuration":sel,
     "base_cost":{"spread_price_jpy":0.02,"slippage_price_jpy_per_side":0.003},
     "yearly":{},"cost_stress":{}}
for year in (2022,2023):
    base=selected(year)
    ledger=json.loads((d/f"ledger-{year}"/(base["configId"]+".json")).read_text())
    observations=[x for x in ledger["decisions"] if x.get("closed") and x.get("swapKnown") and x.get("status") not in ("shadow_only","unpriced_swap_unresolved")]
    if len(observations)!=base["settledFunded"]:
        raise ValueError(f"Ledger count mismatch {year}")
    if abs(sum(x["netUSD"] for x in observations)-base["netFundedUSD"])>0.00001:
        raise ValueError(f"Ledger net mismatch {year}")
    positives=[x["netUSD"] for x in observations if x["netUSD"]>0]
    negatives=[x["netUSD"] for x in observations if x["netUSD"]<0]
    peak=1000.0
    eq=1000.0
    worst=0.0
    for x in observations:
        eq+=x["netUSD"]
        peak=max(peak,eq)
        worst=max(worst,(peak-eq)/peak*100)
    res["yearly"][str(year)]={
        "completed_funded_trades":len(observations),
        "win_trades":len(positives),"loss_trades":len(negatives),
        "win_rate_percent":round(100*len(positives)/len(observations),4) if observations else None,
        "net_profit_factor":round(sum(positives)/-sum(negatives),5) if negatives else None,
        "gross_profit_usd":round(sum(x["grossUSD"] for x in observations),4),
        "net_profit_usd":round(sum(x["netUSD"] for x in observations),4),
        "spread_slippage_cost_usd":round(sum(x["spreadAndSlippageCostUSD"] for x in observations),4),
        "max_closed_trade_equity_drawdown_percent":round(worst,5),
        "end_equity_usd":round(eq,4),
        "mean_trade_usd":round(sum(x["netUSD"] for x in observations)/len(observations),5) if observations else None,
        "funded_overrisk_count":sum(x.get("riskExceeded",False) for x in observations),
        "model_real_orders_sent":0
    }
for name in ("stress15","stress20"):
    res["cost_stress"][name]={}
    for year in (2022,2023):
        row=selected(year,name)
        res["cost_stress"][name][str(year)]={
            "funded_trades":row["settledFunded"],
            "net_usd":round(row["netFundedUSD"],4),
            "gross_usd":round(row["grossFundedUSD"],4)
        }
res["cost_stress"]["stress15"]["assumed_spread_jpy"]=0.03
res["cost_stress"]["stress15"]["assumed_adverse_slippage_jpy_each_side"]=0.0045
res["cost_stress"]["stress20"]["assumed_spread_jpy"]=0.04
res["cost_stress"]["stress20"]["assumed_adverse_slippage_jpy_each_side"]=0.006
res["notes"]=[
 "One preregistered training-only configuration observed; no 2025 holdout opened",
 "2022/2023 each start at $1000 independently; summed net is not one compounded account",
 "2023 week27 independent Dukascopy M5 quote provenance, not GatesFX or FXCM",
 "Drawdown computed on closed trades and does not model intrabar mark-to-market liquidation",
 "All fills and stress spreads/slippage are modeled, not actual GatesFX executions",
 "Not out-of-sample qualification; requires untouched future validation and broker contract checks"]
out=d/"USDJPY-candidate-diagnostics.json"
out.write_text(json.dumps(res,indent=2)+"\n")
print("DIAGNOSTICS "+json.dumps(res,sort_keys=True))
