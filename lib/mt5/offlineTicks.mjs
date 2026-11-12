/* Read-only, hashed MT5 offline Bid/Ask tick importer. Never connects to a terminal. */
import {createHash} from "node:crypto";
import {validateMt5Manifest,assertMt5OfflineOnly,MT5_SOURCE} from "./contract.mjs";
function fail(code){const e=new Error(code);e.code=code;throw e;}
function utcMs(value){
 if(typeof value!=="string"||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value))fail("MT5_TICK_UTC_REQUIRED");
 const t=Date.parse(value);
 if(!Number.isSafeInteger(t)||new Date(t).toISOString()!==new Date(value).toISOString())fail("MT5_TICK_INVALID_TIME");
 return t;
}
function price(value){if(typeof value!=="number"||!Number.isFinite(value)||value<=0)fail("MT5_TICK_INVALID_PRICE");return value;}
/** Hash exact original UTF-8 JSON bytes. Never interpolate, deduplicate or fabricate quotes. */
export function importMt5OfflineTicks({manifest,rawRows,maxBytes=16000000}={}){
 assertMt5OfflineOnly({provider:"MetaTrader 5",source:MT5_SOURCE,mode:"OFFLINE_HISTORICAL_RESEARCH"});
 // Validate manifest/holdout window BEFORE examining the payload.
 const m=validateMt5Manifest(manifest);
 if(m.kind!=="ticks")fail("MT5_TICK_KIND_REQUIRED");
 if(typeof rawRows!=="string"||!Number.isSafeInteger(maxBytes)||maxBytes<1||maxBytes>16000000||Buffer.byteLength(rawRows,"utf8")>maxBytes)fail("MT5_TICK_SIZE_LIMIT");
 if(createHash("sha256").update(rawRows,"utf8").digest("hex")!==m.sha256)fail("MT5_SOURCE_HASH_MISMATCH");
 let rows;try{rows=JSON.parse(rawRows);}catch{fail("MT5_TICK_INVALID_JSON");}
 if(!Array.isArray(rows)||rows.length<1||rows.length>1000000||rows.length!==m.rows)fail("MT5_TICK_ROW_COUNT");
 const from=Date.parse(m.window.from),to=Date.parse(m.window.to);
 let previous=-1,spreadMin=Infinity,spreadMax=-Infinity,spreadSum=0,sameMs=0;
 const ticks=rows.map(row=>{
  if(!row||typeof row!=="object"||Array.isArray(row))fail("MT5_TICK_INVALID_ROW");
  const ms=utcMs(row.time);
  if(ms<from||ms>=to)fail("MT5_TICK_OUTSIDE_WINDOW");
  if(ms<previous)fail("MT5_TICK_OUT_OF_ORDER");
  if(ms===previous)sameMs++;
  previous=ms;
  const bid=price(row.bid),ask=price(row.ask);
  if(ask<bid)fail("MT5_TICK_CROSSED_QUOTE");
  if(row.time_msc!==undefined&&(!Number.isSafeInteger(row.time_msc)||row.time_msc!==ms))fail("MT5_TICK_MILLISECOND_CONFLICT");
  if(row.flags!==undefined&&(!Number.isSafeInteger(row.flags)||row.flags<0))fail("MT5_TICK_INVALID_FLAGS");
  const spread=ask-bid;
  spreadMin=Math.min(spreadMin,spread);spreadMax=Math.max(spreadMax,spread);spreadSum+=spread;
  return Object.freeze({time:row.time,timeMsc:ms,bid,ask,spread,flags:row.flags??null});
 });
 return Object.freeze({ok:true,provider:"MetaTrader 5",source:MT5_SOURCE,mode:"OFFLINE_HISTORICAL_RESEARCH",
  readOnly:true,executionEnabled:false,symbol:m.symbol,sourceSha256:m.sha256,window:m.window,
  quoteBasis:"historical-bid-ask",spreadUnits:"absolute-price",
  diagnostics:Object.freeze({count:ticks.length,sameMillisecondEvents:sameMs,minSpread:spreadMin,maxSpread:spreadMax,meanSpread:spreadSum/ticks.length}),
  ticks:Object.freeze(ticks)});
}
