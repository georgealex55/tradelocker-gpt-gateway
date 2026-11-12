"""Fail-closed 2026-only sanitized MT5 deals accounting; no terminal or order APIs."""
from __future__ import annotations
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
from hashlib import sha256
import json
from pathlib import Path
import re

MAX_BYTES=8*1024*1024
MAX_ROWS=10000
UTC=re.compile(r"^2026-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$")
HASH=re.compile(r"^[a-f0-9]{64}$")
SYMBOL=re.compile(r"^[A-Za-z0-9_.#-]{1,32}$")
class ClosedDealsError(ValueError): pass
def fail(code): raise ClosedDealsError(code)
def timestamp(value):
    if not isinstance(value,str) or not UTC.fullmatch(value): fail("MT5_DEALS_2026_UTC_REQUIRED")
    try: stamp=datetime.fromisoformat(value.replace("Z","+00:00"))
    except ValueError: fail("MT5_DEALS_INVALID_TIMESTAMP")
    if stamp.year!=2026: fail("MT5_DEALS_YEAR_FORBIDDEN")
    return stamp.astimezone(timezone.utc)
def money(value,field):
    if isinstance(value,bool) or not isinstance(value,(str,int)): fail("MT5_DEALS_INVALID_"+field.upper())
    try: n=Decimal(str(value))
    except InvalidOperation: fail("MT5_DEALS_INVALID_"+field.upper())
    if not n.is_finite() or abs(n)>Decimal("100000000000"): fail("MT5_DEALS_INVALID_"+field.upper())
    return n
def validate_manifest(m):
    # This MUST happen before opening the payload, even for zero-row exports.
    if not isinstance(m,dict): fail("MT5_DEALS_MANIFEST_REQUIRED")
    if (m.get("contractVersion")!=1 or m.get("source")!="MT5_LOCAL_EXPORT"
        or m.get("kind")!="deals" or m.get("readOnly") is not True
        or m.get("executionEnabled") is not False): fail("MT5_DEALS_UNTRUSTED_SOURCE")
    if m.get("timezone")!="UTC" or m.get("currency")!="USD": fail("MT5_DEALS_CURRENCY_OR_TIMEZONE_UNVERIFIED")
    w=m.get("window")
    if not isinstance(w,dict): fail("MT5_DEALS_WINDOW_REQUIRED")
    start,end=timestamp(w.get("from")),timestamp(w.get("to"))
    if start>=end or (end-start).total_seconds()>31*86400: fail("MT5_DEALS_INVALID_WINDOW")
    digest=m.get("sha256")
    if not isinstance(digest,str) or not HASH.fullmatch(digest): fail("MT5_DEALS_HASH_REQUIRED")
    if type(m.get("rows")) is not int or not 0<=m["rows"]<=MAX_ROWS: fail("MT5_DEALS_ROW_LIMIT")
    if m.get("privacy")!="sanitized_2026_only": fail("MT5_DEALS_SANITIZATION_NOT_ATTESTED")
    return start,end,digest,m["rows"]
def import_closed_deals(manifest,payload):
    start,end,digest,count=validate_manifest(manifest)
    if not isinstance(payload,bytes) or len(payload)>MAX_BYTES: fail("MT5_DEALS_PAYLOAD_SIZE")
    if sha256(payload).hexdigest()!=digest: fail("MT5_DEALS_HASH_MISMATCH")
    try: rows=json.loads(payload)
    except (ValueError,UnicodeDecodeError): fail("MT5_DEALS_INVALID_JSON")
    if not isinstance(rows,list) or len(rows)!=count: fail("MT5_DEALS_ROW_COUNT")
    seen=set(); groups={}; total={k:Decimal(0) for k in ("profit","commission","swap","fee","net")}
    for row in rows:
        if not isinstance(row,dict): fail("MT5_DEALS_INVALID_ROW")
        if row.get("entry") not in ("IN","OUT","INOUT","OUT_BY"): fail("MT5_DEALS_UNKNOWN_ENTRY")
        ts=timestamp(row.get("time_utc"))
        if not start<=ts<end: fail("MT5_DEALS_OUTSIDE_WINDOW")
        sym=row.get("symbol")
        if not isinstance(sym,str) or not SYMBOL.fullmatch(sym): fail("MT5_DEALS_INVALID_SYMBOL")
        deal_id,pos_id=row.get("deal_id"),row.get("position_id")
        if not isinstance(deal_id,str) or not deal_id or not isinstance(pos_id,str) or not pos_id: fail("MT5_DEALS_MISSING_IDS")
        if deal_id in seen: fail("MT5_DEALS_DUPLICATE_ID")
        seen.add(deal_id)
        if row.get("currency")!="USD": fail("MT5_DEALS_CURRENCY_MISMATCH")
        vals={k:money(row.get(k),k) for k in ("profit","commission","swap","fee")}
        vals["net"]=sum(vals.values(),Decimal(0))
        if "reported_net" in row and money(row["reported_net"],"reported_net")!=vals["net"]: fail("MT5_DEALS_NET_MISMATCH")
        if pos_id in groups and groups[pos_id]!=sym: fail("MT5_DEALS_POSITION_SYMBOL_CONFLICT")
        groups[pos_id]=sym
        for k,v in vals.items(): total[k]+=v
    # Never leak deal/position IDs or imply that an exit means full closure.
    return {"ok":True,"source":"MT5_LOCAL_EXPORT","readOnly":True,"executionEnabled":False,
            "currency":"USD","year":2026,"dealCount":len(rows),"positionGroups":len(groups),
            "positionsConfirmedClosed":False,"accounting":{k:format(v,"f") for k,v in total.items()},
            "sourceSha256":digest,
            "limitations":["Full position closure requires volume/lifecycle reconciliation",
                           "Historical Bid/Ask, slippage and swap schedules not inferred"]}
def import_private_files(manifest_path,payload_path):
    a,b=Path(manifest_path),Path(payload_path)
    if a.is_symlink() or b.is_symlink(): fail("MT5_DEALS_SYMLINK_FORBIDDEN")
    if a.stat().st_size>16384: fail("MT5_DEALS_MANIFEST_SIZE")
    manifest=json.loads(a.read_text(encoding="utf-8"))
    validate_manifest(manifest) # BEFORE touching payload metadata or content
    if b.stat().st_size>MAX_BYTES: fail("MT5_DEALS_PAYLOAD_SIZE")
    return import_closed_deals(manifest,b.read_bytes())
