import test from "node:test";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {importMt5OfflineBars,selectMt5ResearchSource,getMt5SourceStatus} from "../lib/mt5/offlineBars.mjs";
const rows=[{time:"2022-01-03T00:00:00Z",open:1.1,high:1.2,low:1,close:1.15,tick_volume:12},
 {time:"2022-01-03T00:05:00Z",open:1.15,high:1.21,low:1.11,close:1.2,tick_volume:9}];
function input(data=rows,overrides={}){
 const rawRows=JSON.stringify(data);
 return {rawRows,resolution:"5m",manifest:{contractVersion:1,source:"MT5_LOCAL_EXPORT",readOnly:true,executionEnabled:false,
  kind:"bars",symbol:"EURUSD",sha256:createHash("sha256").update(rawRows).digest("hex"),
  exportedAt:"2026-11-12T08:00:00Z",timezone:"UTC",
  window:{from:"2022-01-03T00:00:00Z",to:"2022-01-03T00:10:00Z"},rows:data.length,...overrides}};
}
test("source selection is opt-in, offline only, and terminal unavailable explicitly",()=>{
 assert.equal(selectMt5ResearchSource().selected,false);
 assert.equal(selectMt5ResearchSource({source:"mt5"}).executionEnabled,false);
 assert.throws(()=>selectMt5ResearchSource({source:"mt5",mode:"LIVE"}),/MT5_UNSAFE_PROVIDER_MODE/);
 assert.equal(getMt5SourceStatus().status,"UNAVAILABLE");
});
test("imports two valid fully closed MT5 candles without changing other provider routing",()=>{
 const result=importMt5OfflineBars(input());
 assert.equal(result.source,"MT5_LOCAL_EXPORT");assert.equal(result.bars.length,2);
 assert.equal(result.bars[0].volume,12);assert.equal(result.bars[1].closed,true);
 assert.equal(Object.isFrozen(result.bars),true);
});
test("rejects source hash tampering and unsafe execution flags",()=>{
 const x=input();assert.throws(()=>importMt5OfflineBars({...x,rawRows:x.rawRows+" "}),/MT5_SOURCE_HASH_MISMATCH/);
 assert.throws(()=>importMt5OfflineBars({...x,manifest:{...x.manifest,executionEnabled:true}}),/MT5_EXECUTION_FORBIDDEN/);
});
test("rejects duplicate timestamps before normalizer overwrite",()=>{
 assert.throws(()=>importMt5OfflineBars(input([rows[0],rows[0]])),/MT5_BAR_DUPLICATE_TIME/);
});
test("rejects local-time, out-of-window, malformed, unaligned and incomplete bars",()=>{
 const cases=[
  [[{...rows[0],time:"2022-01-03T00:00:00+00:00"},rows[1]],/MT5_BAR_UTC_REQUIRED/],
  [[{...rows[0],time:"2022-01-02T23:55:00Z"},rows[1]],/MT5_BAR_OUTSIDE_WINDOW/],
  [[{...rows[0],time:"2022-01-03T00:01:00Z"},rows[1]],/MT5_BAR_UNALIGNED/],
  [[{...rows[0],high:1.05},rows[1]],/MT5_BAR_INVALID_OHLC/]
 ];
 for(const [data,pattern] of cases)assert.throws(()=>importMt5OfflineBars(input(data)),pattern);
 assert.throws(()=>importMt5OfflineBars({...input(),asOf:Date.parse("2022-01-03T00:05:00Z")}),/MT5_BAR_ASOF_BEFORE_WINDOW_END/);
});
test("rejects sealed 2025 window before parsing rows",()=>{
 const x=input();assert.throws(()=>importMt5OfflineBars({...x,manifest:{...x.manifest,
  window:{from:"2024-12-31T23:00:00Z",to:"2026-01-01T00:00:00Z"}}}),/MT5_SEALED_2025_WINDOW/);
});
