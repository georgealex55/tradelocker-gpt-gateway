/* Explicit opt-in offline MT5 bar adapter. No broker/network/terminal/order dependencies. */
import {createHash} from "node:crypto";
import {validateMt5Manifest,assertMt5OfflineOnly,mt5Unavailable,MT5_SOURCE} from "./contract.mjs";
import {normalizeBars,FX_RESOLUTIONS} from "../xmiLiveMath.mjs";
const ALLOWED_RESOLUTIONS=new Set(["1m","5m","15m","30m","1H","4H","1D"]);
function fail(code){const e=new Error(code);e.code=code;throw e;}
function utcMs(value){
 if(typeof value!=="string"||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value))fail("MT5_BAR_UTC_REQUIRED");
 const t=Date.parse(value);if(!Number.isFinite(t)||new Date(t).toISOString()!==new Date(value).toISOString())fail("MT5_BAR_INVALID_TIME");return t;
}
function asNumber(value){if(typeof value!=="number"||!Number.isFinite(value))fail("MT5_BAR_INVALID_NUMBER");return value;}
export function selectMt5ResearchSource({source="existing",mode="OFFLINE_HISTORICAL_RESEARCH"}={}){
 if(source==="existing")return Object.freeze({source:"existing",selected:false});
 if(source!=="mt5")fail("MT5_SOURCE_NOT_SUPPORTED");
 assertMt5OfflineOnly({provider:"MetaTrader 5",source:MT5_SOURCE,mode});
 return Object.freeze({source:MT5_SOURCE,selected:true,readOnly:true,executionEnabled:false,mode});
}
/** Manifest sha256 is the digest of exact raw UTF-8 JSON rows bytes, not reserialized parsed values. */
export function importMt5OfflineBars({manifest,rawRows,resolution,asOf}={}){
 selectMt5ResearchSource({source:"mt5"});
 const m=validateMt5Manifest(manifest);
 if(m.kind!=="bars")fail("MT5_BAR_KIND_REQUIRED");
 if(!ALLOWED_RESOLUTIONS.has(resolution))fail("MT5_UNSUPPORTED_TIMEFRAME");
 if(typeof rawRows!=="string"||Buffer.byteLength(rawRows,"utf8")>900000)fail("MT5_BAR_SIZE_LIMIT");
 const actual=createHash("sha256").update(rawRows,"utf8").digest("hex");
 if(actual!==m.sha256)fail("MT5_SOURCE_HASH_MISMATCH");
 let rows;try{rows=JSON.parse(rawRows);}catch{fail("MT5_BAR_INVALID_JSON");}
 if(!Array.isArray(rows)||rows.length<2||rows.length>400||m.rows!==rows.length)fail("MT5_BAR_ROW_COUNT");
 const from=Date.parse(m.window.from),to=Date.parse(m.window.to);
 const now=asOf===undefined?to:Number(asOf);
 if(!Number.isSafeInteger(now)||now<to)fail("MT5_BAR_ASOF_BEFORE_WINDOW_END");
 const step=FX_RESOLUTIONS[resolution]*1000,seen=new Set(),normalized=[];
 for(const row of rows){
  if(!row||typeof row!=="object"||Array.isArray(row))fail("MT5_BAR_INVALID_ROW");
  const time=utcMs(row.time);
  if(time<from||time>=to)fail("MT5_BAR_OUTSIDE_WINDOW");
  if(time%step!==0)fail("MT5_BAR_UNALIGNED");
  if(seen.has(time))fail("MT5_BAR_DUPLICATE_TIME");seen.add(time);
  const open=asNumber(row.open),high=asNumber(row.high),low=asNumber(row.low),close=asNumber(row.close);
  if(open<=0||close<=0||low<=0||high<Math.max(open,close)||low>Math.min(open,close))fail("MT5_BAR_INVALID_OHLC");
  const volume=row.tick_volume==null?null:asNumber(row.tick_volume);
  if(volume!==null&&(!Number.isSafeInteger(volume)||volume<0))fail("MT5_BAR_INVALID_VOLUME");
  normalized.push({time:time/1000,open,high,low,close,volume});
 }
 const bars=normalizeBars(normalized,resolution,now);
 if(bars.length!==rows.length)fail("MT5_BAR_NORMALIZATION_MISMATCH");
 // Do not expose an incomplete last bar as a historical observation.
 if(bars.some(b=>!b.closed))fail("MT5_BAR_INCOMPLETE");
 return Object.freeze({ok:true,provider:"MetaTrader 5",source:MT5_SOURCE,mode:"OFFLINE_HISTORICAL_RESEARCH",
  readOnly:true,executionEnabled:false,symbol:m.symbol,resolution,sourceSha256:m.sha256,
  window:m.window,volumeBasis:"broker-tick",bars:Object.freeze(bars.map(b=>Object.freeze(b)))});
}
export function getMt5SourceStatus(){return mt5Unavailable("MT5_LOCAL_TERMINAL_NOT_CONNECTED");}
