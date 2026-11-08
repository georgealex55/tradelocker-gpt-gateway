#!/usr/bin/env python3
"""Private, deterministic HistData -> 5-minute bid OHLC adapter for XMI AMD.

Reuses the existing audited 2022-2024 source parser and timezone correction.
No 2025 or live broker connectivity; writes data and hashes outside Git.
"""
import argparse
import csv
import hashlib
import importlib.util
import json
from pathlib import Path
import sys

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
PARSER = ROOT / "scripts/xmi-session-research.py"
SYMBOLS = {"EURUSD","GBPUSD","USDJPY","USDCHF","AUDUSD","USDCAD","NZDUSD","XAUUSD"}

def load_existing_reader():
    spec=importlib.util.spec_from_file_location("xmi_session_research_adapter",PARSER)
    mod=importlib.util.module_from_spec(spec)
    sys.modules[spec.name]=mod
    spec.loader.exec_module(mod)
    return mod

def export(cache, symbol, years, dest):
    if symbol not in SYMBOLS: raise ValueError("Unknown research symbol")
    if not years or any(y not in (2022,2023,2024) for y in years):
        raise ValueError("2025 is sealed; accepted years: 2022, 2023, 2024")
    if dest.exists(): raise FileExistsError(f"Refusing to overwrite {dest}")
    mod=load_existing_reader()
    t,p,manifest=mod.read_history(cache,symbol,sorted(set(years)))
    index=pd.to_datetime(t,unit="m",utc=True)
    original=pd.DataFrame({"o":p[0],"h":p[1],"l":p[2],"c":p[3],
                           "minute":np.asarray(t,dtype="int64")},index=index)
    grouped=original.resample("5min",origin="epoch",label="left",closed="left")
    df=grouped.agg({"o":"first","h":"max","l":"min","c":"last",
                    "minute":["count","min","max"]})
    df.columns=["o","h","l","c","count","min_minute","max_minute"]
    # Require all five distinct chronological minute source bars.
    valid=(df["count"]==5)&(df["max_minute"]-df["min_minute"]==4)&(
        df.index.asi8//60_000_000_000==df["min_minute"])
    clean=df.loc[valid,["o","h","l","c"]]
    dest.parent.mkdir(parents=True,exist_ok=True)
    digest=hashlib.sha256()
    with dest.open("x",encoding="utf-8",newline="") as stream:
        writer=csv.writer(stream,lineterminator="\n")
        writer.writerow(["t","o","h","l","c"])
        for row in clean.itertuples():
            timestamp=row.Index.strftime("%Y-%m-%dT%H:%M:%S.000Z")
            writer.writerow([timestamp,format(row.o,".12g"),format(row.h,".12g"),
                             format(row.l,".12g"),format(row.c,".12g")])
    with dest.open("rb") as stream:
        for chunk in iter(lambda:stream.read(1<<20),b""):
            digest.update(chunk)
    sidecar=dest.with_suffix(dest.suffix+".manifest.json")
    manifest_data={"symbol":symbol,"years":sorted(set(years)),"private_output":str(dest),
                   "sha256":digest.hexdigest(),"source_manifest":manifest,
                   "original_minute_rows":len(t),"complete_5minute_bars":len(clean),
                   "incomplete_5minute_groups_dropped":int((~valid).sum()),
                   "holdout_2025_read":False,"bid_ohlc_not_broker_ask":True}
    with sidecar.open("x",encoding="utf-8") as stream:
        json.dump(manifest_data,stream,indent=2)
    return manifest_data

def main():
    a=argparse.ArgumentParser()
    a.add_argument("--cache",type=Path,required=True)
    a.add_argument("--symbol",required=True)
    a.add_argument("--years",nargs="+",type=int,default=[2022,2023,2024])
    a.add_argument("--output",type=Path,required=True)
    opts=a.parse_args()
    result=export(opts.cache,opts.symbol,opts.years,opts.output)
    print(json.dumps({k:result[k] for k in (
        "symbol","years","complete_5minute_bars","sha256","holdout_2025_read")}))
if __name__=="__main__":
    main()
