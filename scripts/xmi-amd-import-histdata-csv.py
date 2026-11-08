#!/usr/bin/env python3
"""Offline original-format HistData M1 text -> validated M5 bid bars.

Input: YYYYMMDD HHMMSS;Open;High;Low;Close;Volume, broker-independent
HistData fixed EST timestamps. Sorts the known DST overlap, de-duplicates
identical minute bars, and rejects conflicting duplicates.
No download, no broker connection, no 2025 read, no Git-committed prices.
"""
import argparse
import hashlib
import json
from pathlib import Path
import pandas as pd
import numpy as np

VALID_SYMBOLS={"EURUSD","GBPUSD","USDJPY","USDCHF","AUDUSD","USDCAD","NZDUSD","XAUUSD"}

def sha256_file(path):
    digest=hashlib.sha256()
    with path.open("rb") as inp:
        for chunk in iter(lambda:inp.read(1024*1024),b""):digest.update(chunk)
    return digest.hexdigest()

def convert(source,symbol,year,output):
    if symbol not in VALID_SYMBOLS: raise ValueError("Unsupported instrument")
    if year not in (2022,2023,2024): raise ValueError("Only 2022–2024 development years; 2025 sealed")
    if output.exists(): raise FileExistsError(f"Output exists: {output}")
    raw=pd.read_csv(source,sep=";",header=None,
        names=["time","o","h","l","c","volume"],dtype={"time":"string"})
    if raw.empty or raw[["o","h","l","c"]].isna().any().any():
        raise ValueError("Missing numeric OHLC data")
    times=pd.DatetimeIndex(pd.to_datetime(raw["time"],format="%Y%m%d %H%M%S",errors="raise",utc=True))+pd.Timedelta(hours=5)
    # For HistData this timezone shift is constant EST, including local summer.
    if (times.year!=year).any():
        raise ValueError("Archive contains bars outside selected UTC year")
    raw=raw.drop(columns=["time","volume"])
    raw.index=times
    backwards=int(np.count_nonzero(np.diff(times.asi8)<0))
    raw=raw.sort_index(kind="stable")
    if (raw["h"] < raw[["o","c"]].max(axis=1)).any() or \
       (raw["l"] > raw[["o","c"]].min(axis=1)).any():
        raise ValueError("Invalid bar envelope")
    grouped=raw.groupby(level=0,sort=True)
    for stamp,group in grouped:
        if len(group)>1 and not group.eq(group.iloc[0]).all().all():
            raise ValueError(f"Conflicting duplicate minute rows at {stamp}")
    duplicates=len(raw)-raw.index.nunique()
    raw=raw[~raw.index.duplicated(keep="first")]
    minute_epoch=raw.index.asi8//60_000_000_000
    work=raw.assign(epochminute=minute_epoch)
    g=work.resample("5min",origin="epoch",label="left",closed="left").agg(
        {"o":"first","h":"max","l":"min","c":"last",
         "epochminute":["count","min","max"]})
    g.columns=["o","h","l","c","count","first","last"]
    bucket_minutes=g.index.asi8//60_000_000_000
    valid=(g["count"]==5)&(g["first"]==bucket_minutes)&(g["last"]==bucket_minutes+4)
    bar=g.loc[valid,["o","h","l","c"]]
    if bar.empty:raise ValueError("No complete M5 groups")
    output.parent.mkdir(parents=True,exist_ok=True)
    with output.open("x",encoding="utf-8",newline="") as f:
        f.write("t,o,h,l,c\n")
        for row in bar.itertuples():
            f.write(f'{row.Index.strftime("%Y-%m-%dT%H:%M:%S.000Z")},{row.o:.12g},{row.h:.12g},{row.l:.12g},{row.c:.12g}\n')
    summary={"source":str(source),"symbol":symbol,"year":year,
       "source_sha256":sha256_file(source),"output_sha256":sha256_file(output),
       "raw_minute_rows":len(times),"backward_clock_transitions":backwards,
       "exact_duplicate_minutes":duplicates,"complete_M5_bars":len(bar),
       "dropped_incomplete_groups":int((~valid).sum()),
       "source_timezone":"HistData fixed EST interpreted as UTC+05",
       "first_utc":bar.index[0].isoformat(),"last_utc":bar.index[-1].isoformat(),
       "holdout_2025_read":False,"broker_spread_verified":False}
    with output.with_suffix(output.suffix+".manifest.json").open("x",encoding="utf-8") as f:
        json.dump(summary,f,indent=2)
    return summary

if __name__=="__main__":
    parser=argparse.ArgumentParser()
    parser.add_argument("--input",type=Path,required=True)
    parser.add_argument("--symbol",required=True)
    parser.add_argument("--year",type=int,required=True)
    parser.add_argument("--output",type=Path,required=True)
    args=parser.parse_args()
    print(json.dumps(convert(args.input,args.symbol,args.year,args.output)))
