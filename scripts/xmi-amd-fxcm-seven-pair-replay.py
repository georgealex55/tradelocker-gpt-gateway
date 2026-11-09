#!/usr/bin/env python3
"""Read-only public FXCM M1 bid/ask fetch, strict M5 conversion, frozen AMD run.
Research folds: 2022, 2023 only. Never requests 2024/2025 or broker APIs.
No credentials or live order operations. Source costs are NOT GatesFX STP fills.
"""
import argparse, csv, gzip, hashlib, json, math, os, statistics, subprocess, sys, time
import urllib.error, urllib.request
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path

PAIRS=("EURUSD","GBPUSD","USDJPY","USDCHF","AUDUSD","USDCAD","NZDUSD")
YEARS=(2022,2023)
BASE="https://candledata.fxcorporate.com/m1/{pair}/{year}/{week}.csv.gz"
UTC=timezone.utc

def sha(x):
    return hashlib.sha256(x).hexdigest()

def fetch_one(pair,year,week):
    url=BASE.format(pair=pair,year=year,week=week)
    error=None
    for retry in range(3):
        try:
            req=urllib.request.Request(url,headers={"User-Agent":"XMI-Research-Historical-Replay/1.0"})
            with urllib.request.urlopen(req,timeout=25) as response:
                payload=response.read(5_000_000)
                if response.read(1): raise ValueError("Abnormally large weekly gzip")
            data=gzip.decompress(payload)
            if len(data)<100: return week,payload,None
            return week,payload,data
        except (OSError,ValueError,urllib.error.URLError) as exc:
            error=str(exc)
            if retry<2: time.sleep(1.5*(retry+1))
    raise RuntimeError(f"{pair} {year} week {week}: {error}")

def timestamp(s):
    s=s.strip().removesuffix("Z")
    if len(s)==16: s+=":00"
    try:
        if "/" in s.split(" ")[0]:
            dt=datetime.strptime(s,"%m/%d/%Y %H:%M:%S.%f" if "." in s else "%m/%d/%Y %H:%M:%S")
        else:
            dt=datetime.fromisoformat(s.replace(" ","T"))
    except ValueError: raise ValueError(f"Bad UTC timestamp {s!r}")
    if dt.tzinfo is not None:
        if dt.utcoffset() != timezone.utc.utcoffset(None):
            raise ValueError(f"Non-UTC timezone offset in FXCM source timestamp {s!r}")
        dt=dt.astimezone(UTC)
    else:
        dt=dt.replace(tzinfo=UTC)
    return int(dt.timestamp())

def parse_minute(text,year,week,crossed_policy="reject",quote_audit=None):
    if crossed_policy not in ("reject","quarantine"):
        raise ValueError("Unregistered crossed quote policy")
    rows=csv.DictReader(text.decode("utf-8-sig").splitlines())
    if not rows.fieldnames: raise ValueError("Missing CSV header")
    norm={name.strip().lower():name for name in rows.fieldnames}
    def pick(*names):
        for name in names:
            if name in norm:return norm[name]
        raise ValueError("Missing column "+"/".join(names)+"; got "+repr(rows.fieldnames))
    date=pick("datetime","date","timestamp","time")
    op=pick("bidopen","bid_open","openbid")
    hi=pick("bidhigh","bid_high","highbid")
    lo=pick("bidlow","bid_low","lowbid")
    cl=pick("bidclose","bid_close","closebid")
    ask=pick("askopen","ask_open")
    n=0
    for rec in rows:
        t=timestamp(rec[date])
        if datetime.fromtimestamp(t,UTC).year != year: continue
        if t%60:raise ValueError("Non-minute timestamp")
        o,h,l,c=(*(float(rec[x]) for x in (op,hi,lo,cl)),)
        if not all(math.isfinite(x) and x>0 for x in (o,h,l,c)):
            raise ValueError("Invalid bid price")
        if h<max(o,c)-1e-10 or l>min(o,c)+1e-10:
            raise ValueError("Invalid bid high/low")
        if rec[ask] is None or not rec[ask].strip():
            raise ValueError(f"Missing ask open at {t}; cannot establish bid/ask source integrity")
        a=float(rec[ask])
        if a is not None and (not math.isfinite(a) or a<=0):
            raise ValueError(f"Nonpositive or invalid ask at {t}")
        if a is not None and a < o:
            if crossed_policy=="quarantine":
                if quote_audit is not None:
                    quote_audit["crossed_open_quotes_quarantined"]+=1
                continue  # Never invent/reprice invalid quote; incompletely formed M5 bar is discarded.
            raise ValueError(f"Crossed bid/ask open at {t}: ask {a} < bid {o}")
        n+=1
        yield t,(o,h,l,c,a)


def dukascopy_missing_2023_w27(pair,outdir):
    """Use only actual independent Dukascopy M5 bids in blank FXCM week 27."""
    dest=outdir/"duka-week27"
    dest.mkdir(parents=True,exist_ok=True)
    cmd=["npx","--yes","dukascopy-node@1.51.1","-i",pair.lower(),
         "-from","2023-07-02","-to","2023-07-10","-t","m5","-f","csv",
         "-dir",str(dest),"--retries","2","--batch-size","10","--batch-pause","200","-s"]
    proc=subprocess.run(cmd,text=True,capture_output=True,timeout=240)
    if proc.returncode:
        raise ValueError(f"Dukascopy 2023 W27 failed {pair}: {(proc.stderr or proc.stdout)[-500:]}")
    candidates=list(dest.glob("*.csv"))
    if len(candidates)!=1:raise ValueError(f"Dukascopy segment count {len(candidates)}")
    raw=candidates[0].read_bytes()
    records=[]
    start=int(datetime(2023,7,2,tzinfo=UTC).timestamp())
    end=int(datetime(2023,7,9,tzinfo=UTC).timestamp())
    seen=set()
    with candidates[0].open(newline="") as stream:
        reader=csv.DictReader(stream)
        if reader.fieldnames!=["timestamp","open","high","low","close"]:
            raise ValueError(f"Dukascopy schema mismatch: {reader.fieldnames!r}")
        for row in reader:
            ms=int(row["timestamp"])
            if ms%300000:raise ValueError("Dukascopy timestamp not UTC 5m-aligned")
            t=ms//1000
            if not start<=t<end:continue
            dt=datetime.fromtimestamp(t,UTC)
            if dt.weekday()==5 or (dt.weekday()==6 and dt.hour<21) or (dt.weekday()==4 and dt.hour>=21):
                continue
            if t in seen:raise ValueError("Dukascopy duplicate timestamp")
            seen.add(t)
            o,h,l,c=[float(row[x]) for x in ("open","high","low","close")]
            if not all(math.isfinite(x) and x>0 for x in (o,h,l,c)) or h<max(o,c)-1e-8 or l>min(o,c)+1e-8:
                raise ValueError(f"Invalid Dukascopy OHLC at {t}")
            records.append((t,o,h,l,c))
    if len(records)<1200:raise ValueError(f"Incomplete Dukascopy M5 week27: {len(records)} bars")
    daycounts=defaultdict(int)
    for t,*_ in records:daycounts[datetime.fromtimestamp(t,UTC).strftime("%Y-%m-%d")]+=1
    for day in ("2023-07-03","2023-07-04","2023-07-05","2023-07-06","2023-07-07"):
        if daycounts[day]<180:
            raise ValueError(f"Missing Dukascopy {day}: {daycounts[day]} bars")
    records.sort()
    print(f"{pair} 2023 week27: {len(records):,} observed Dukascopy M5 bids (separate provider)",flush=True)
    return records,{"provider":"Dukascopy indicative M5 bid, not FXCM or GatesFX",
                    "source_sha256":sha(raw),"replacement_week":27,"replacement_m5_bars":len(records),
                    "day_counts":dict(daycounts),"mixed_provider":True,
                    "historical_gatesfx_quote_verified":False}

def run(pair,outdir,crossed_policy="reject"):
    if crossed_policy not in ("reject","quarantine"):
        raise ValueError("Unsupported crossed quote policy")
    outdir.mkdir(parents=True,exist_ok=True)
    if pair not in PAIRS:raise ValueError("Unregistered pair")
    allstats={}
    raw_all={}
    by_year={}
    for year in YEARS:
        by_minute={}
        week_hashes={}
        missing_weeks=[]
        duplicates=0
        quote_audit={"crossed_open_quotes_quarantined":0}
        print(f"{pair} {year}: fetching 52 FXCM UTC M1 weeks (crossed policy: {crossed_policy})",flush=True)
        with ThreadPoolExecutor(max_workers=12) as pool:
            jobs={pool.submit(fetch_one,pair,year,w):w for w in range(1,53)}
            results=[]
            for job in as_completed(jobs):
                results.append(job.result())
        for week,payload,raw in sorted(results):
            week_hashes[str(week)]=sha(payload)
            if raw is None:
                missing_weeks.append(week)
                continue
            for t,values in parse_minute(raw,year,week,crossed_policy,quote_audit):
                if datetime.fromtimestamp(t,UTC).year!=year:continue
                old=by_minute.get(t)
                if old is not None:
                    if old!=values:raise ValueError(f"Conflicting duplicate minute {pair} {t}")
                    duplicates+=1
                else:by_minute[t]=values
        # Cap excluded provider-quote anomalies; refuse to silently pass poor-quality years.
        quarantined=quote_audit["crossed_open_quotes_quarantined"]
        if quarantined>max(100,int(len(by_minute)*0.005)):
            raise ValueError(f"Too many crossed quote minutes quarantined: {quarantined} of {len(by_minute)+quarantined}; source must be reviewed")
        print(f"{pair} {year}: quarantined {quarantined} crossed bid/ask M1 observations",flush=True)
        groups=defaultdict(list)
        for t,row in by_minute.items():
            groups[t-(t%300)].append((t,row))
        bars=[]
        replacement_meta=None
        missing_groups=0
        spreads=[]
        for base,items in sorted(groups.items()):
            items.sort()
            if [t-base for t,_ in items]!=[0,60,120,180,240]:
                missing_groups+=1;continue
            vals=[rec for _,rec in items]
            bars.append((base,vals[0][0],max(v[1] for v in vals),
                         min(v[2] for v in vals),vals[-1][3]))
            for v in vals:
                if v[4] is not None:spreads.append(v[4]-v[0])
        if missing_weeks:
            if year==2023 and missing_weeks==[27]:
                replacement,replacement_meta=dukascopy_missing_2023_w27(pair,outdir)
                existing={b[0] for b in bars}
                if any(b[0] in existing for b in replacement):
                    raise ValueError("Overlapping provider M5 bars")
                bars=sorted(bars+replacement,key=lambda x:x[0])
                if len({b[0] for b in bars})!=len(bars):
                    raise ValueError("Duplicate combined M5")
                missing_weeks=[]
            else:
                raise ValueError(f"Unresolved FXCM weeks: {missing_weeks}")
        monthly=defaultdict(int)
        for bar in bars:
            monthly[datetime.fromtimestamp(bar[0],UTC).strftime("%Y-%m")]+=1
        # Decline incomplete or truncated yearly feeds. Do not label partial-year returns as full years.
        if missing_weeks or len(bars)<45000 or len(monthly)!=12 or min(monthly.values())<2000:
            raise ValueError(f"Insufficient {pair} {year} coverage: missing source weeks {missing_weeks}, {len(bars)} M5 bars, monthly {dict(monthly)}")
        csv_path=outdir/f"{pair}-{year}-bid-m5.csv"
        with csv_path.open("x",newline="") as f:
            writer=csv.writer(f);writer.writerow(("t","o","h","l","c"))
            for t,o,h,l,c in bars:
                writer.writerow((datetime.fromtimestamp(t,UTC).strftime("%Y-%m-%dT%H:%M:%S.000Z"),
                                 f"{o:.12g}",f"{h:.12g}",f"{l:.12g}",f"{c:.12g}"))
        stats={"pair":pair,"year":year,"source_url_template":BASE,
               "minute_rows":len(by_minute),"duplicate_minutes":duplicates,
               "valid_m5_bars":len(bars),"incomplete_m5_groups":missing_groups,
               "monthly_m5":dict(monthly),"missing_weeks_after_replacement":missing_weeks,
               "2023_week27_independent_source":replacement_meta,
               "weekly_gzip_sha256":week_hashes,
               "raw_source_timezone":"UTC reported by FXCM",
               "first":datetime.fromtimestamp(bars[0][0],UTC).isoformat(),
               "last":datetime.fromtimestamp(bars[-1][0],UTC).isoformat(),
               "crossed_bid_ask_minute_quotes":sum(x<0 for x in spreads),
               "crossed_quote_policy":crossed_policy,
               "crossed_open_quotes_quarantined":quote_audit["crossed_open_quotes_quarantined"],
               "crossed_quote_quarantine_max_fraction_of_valid_minutes":0.005,
               "sample_bid_ask_spread_median":statistics.median(spreads) if spreads else None,
               "sample_bid_ask_spread_p95":sorted(spreads)[int(.95*(len(spreads)-1))] if spreads else None,
               "broker_execution_verified":False,"holdout_2025_read":False,
               "homogeneous_provider_year":replacement_meta is None}
        allstats[year]=stats
        raw_all[year]=csv_path
        print(f"{pair} {year}: {len(by_minute):,} M1 rows -> {len(bars):,} complete M5 bars",flush=True)
        path=outdir/f"{pair}-amd-{year}.json"
        cmd=["node","scripts/xmi-amd-retest-runner.mjs",
             "--input",str(raw_all[year]),"--symbol",pair,
             "--fold",f"training_{year}","--output",str(path)]
        completed=subprocess.run(cmd,capture_output=True,text=True,check=True)
        print(completed.stdout.strip(),flush=True)
        by_year[year]=json.loads(path.read_text())
        one_year=[r for r in by_year[year]["rows"] if r["lane"]=="risk_fit" and r["carry"]=="session_flat" and r["settledFunded"]>=20]
        one_year.sort(key=lambda r:r["netFundedUSD"],reverse=True)
        print("ANNUAL "+json.dumps({"symbol":pair,"year":year,"complete_m5_bars":len(bars),
            "configurations":len(by_year[year]["rows"]),"risk_fit_session_flat_ge20":len(one_year),
            "positive_net_ge20":sum(r["netFundedUSD"]>0 for r in one_year),
            "top_2022_or_2023_training_only": [{k:r[k] for k in ("rangeModel","entryModel","exitModel","sizing","settledFunded","netFundedUSD","grossFundedUSD")} for r in one_year[:2]]}),flush=True)
    def k(row):
        return tuple(row[x] for x in ("profile","rangeModel","entryModel","exitModel","carry","sizing","lane"))
    yrmaps={year:{k(row):row for row in by_year[year]["rows"]} for year in YEARS}
    pairs=[]
    for config,x in yrmaps[2022].items():
        if x["lane"]!="risk_fit" or x["carry"]!="session_flat":continue
        y=yrmaps[2023].get(config)
        if y is None:continue
        n1=x["settledFunded"];n2=y["settledFunded"]
        if n1>=20 and n2>=20:
            pairs.append({"config":dict(zip(("profile","rangeModel","entryModel","exitModel","carry","sizing","lane"),config)),
              "trades2022":n1,"trades2023":n2,"net2022":x["netFundedUSD"],
              "net2023":y["netFundedUSD"],"combined_net_diagnostic":x["netFundedUSD"]+y["netFundedUSD"],
              "positive_both":x["netFundedUSD"]>0 and y["netFundedUSD"]>0})
    pairs.sort(key=lambda x:x["combined_net_diagnostic"],reverse=True)
    result={"symbol":pair,"source":"FXCM public M1 indicative bid/ask, not GatesFX",
      "folds":[2022,2023],"starting_equity_per_scenario":1000,
      "2023_fxcm_week27_replaced_by_independent_dukascopy_m5":True,
      "m5_count_by_year":{str(y):allstats[y]["valid_m5_bars"] for y in YEARS},
      "tested_scenarios_by_year":{str(y):len(by_year[y]["rows"]) for y in YEARS},
      "matched_risk_fit_session_flat_both_years_n20":len(pairs),
      "positive_both_years_n20":sum(p["positive_both"] for p in pairs),
      "best_matched":pairs[:5],
      "annual_data":allstats,"2025_holdout_read":False,
      "broker_standard_stp_spread_verified":False,"production_changed":False,
      "notes":["Separate independent $1,000 accounts for each scenario/year",
               "Zero-commission fixed 2.0-pip spread plus 0.3-pip per-side slippage from frozen catalog",
               "When crossed_policy is quarantine, crossed bid/ask minutes are excluded, incomplete M5 groups dropped, no prices fabricated",
               "2023 FXCM week27 is blank; observed independent Dukascopy M5 bid candles were used only for that week, changing the source",
                "FXCM and Dukascopy indicative quotes are not historical GatesFX fills",
               "Overnight unknown-swap outcomes excluded from funded cash return",
               "Only same-day funded risk-fit accounts ranked; no scenario selected for live trading"]}
    (outdir/f"{pair}-summary.json").write_text(json.dumps(result,indent=2)+"\n")
    print("SUMMARY "+json.dumps({k:v for k,v in result.items() if k in
      ("symbol","m5_count_by_year","matched_risk_fit_session_flat_both_years_n20",
       "positive_both_years_n20","best_matched")}),flush=True)
    return result

if __name__=="__main__":
    p=argparse.ArgumentParser()
    p.add_argument("--symbol",choices=PAIRS,required=True)
    p.add_argument("--out",type=Path,required=True)
    p.add_argument("--crossed-open-quote-policy",choices=("reject","quarantine"),default="reject")
    a=p.parse_args()
    try:run(a.symbol,a.out,a.crossed_open_quote_policy)
    except Exception as exc:
        a.out.mkdir(parents=True,exist_ok=True)
        completed={}
        for year in YEARS:
            file=a.out/f"{a.symbol}-amd-{year}.json"
            if file.exists():
                js=json.loads(file.read_text())
                completed[str(year)]={"dataRows":js["dataRows"],"variants":js["variants"]}
        (a.out/f"{a.symbol}-BLOCKED.json").write_text(json.dumps(
          {"symbol":a.symbol,"status":"PARTIAL_YEAR_DATA_BLOCKER","reason":str(exc),
           "completed_training_years":completed,"two_year_replay_completed":False,
           "holdout_2025_read":False},indent=2))
        print("BLOCKED "+str(exc),file=sys.stderr)
        sys.exit(2)
