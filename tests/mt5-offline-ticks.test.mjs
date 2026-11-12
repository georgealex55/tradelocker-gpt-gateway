import test from "node:test";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {importMt5OfflineTicks} from "../lib/mt5/offlineTicks.mjs";
const a={time:"2022-01-03T00:00:00.123Z",time_msc:1641168000123,bid:1.10001,ask:1.10012,flags:6};
const b={...a,bid:1.10002,ask:1.10013,flags:2};
const c={time:"2022-01-03T00:00:00.124Z",time_msc:1641168000124,bid:1.10002,ask:1.10014,flags:4};
function fixture(rows=[a,b,c],changes={}){
 const rawRows=JSON.stringify(rows);
 return {rawRows,manifest:{contractVersion:1,source:"MT5_LOCAL_EXPORT",readOnly:true,executionEnabled:false,
  kind:"ticks",symbol:"EURUSD",sha256:createHash("sha256").update(rawRows).digest("hex"),
  exportedAt:"2026-11-12T09:00:00Z",timezone:"UTC",rows:rows.length,
  window:{from:"2022-01-03T00:00:00Z",to:"2022-01-03T00:01:00Z"},...changes}};
}
test("retains same-millisecond events and measured Bid/Ask spread",()=>{
 const r=importMt5OfflineTicks(fixture());
 assert.equal(r.ticks.length,3);assert.equal(r.diagnostics.sameMillisecondEvents,1);
 assert.equal(r.ticks[0].timeMsc,1641168000123);assert.equal(r.quoteBasis,"historical-bid-ask");
 assert.equal(r.executionEnabled,false);assert.equal(Object.isFrozen(r.ticks[0]),true);
});
test("hash, read-only, kind and sealed-year gate fail closed",()=>{
 const f=fixture();
 assert.throws(()=>importMt5OfflineTicks({...f,rawRows:f.rawRows+" "}),/MT5_SOURCE_HASH_MISMATCH/);
 assert.throws(()=>importMt5OfflineTicks({...f,manifest:{...f.manifest,executionEnabled:true}}),/MT5_EXECUTION_FORBIDDEN/);
 assert.throws(()=>importMt5OfflineTicks({...f,manifest:{...f.manifest,kind:"bars"}}),/MT5_TICK_KIND_REQUIRED/);
 assert.throws(()=>importMt5OfflineTicks({...f,rawRows:"invalid",manifest:{...f.manifest,
  window:{from:"2024-12-31T23:00:00Z",to:"2026-01-01T00:00:00Z"}}}),/MT5_SEALED_2025_WINDOW/);
});
test("rejects crossed, missing, non-UTC, out-of-window, unsorted, inconsistent and invalid flags",()=>{
 const cases=[
  [[{...a,ask:1}],/MT5_TICK_CROSSED_QUOTE/],
  [[{...a,bid:null}],/MT5_TICK_INVALID_PRICE/],
  [[{...a,time:"2022-01-03T00:00:00+00:00"}],/MT5_TICK_UTC_REQUIRED/],
  [[{...a,time:"2022-01-03T00:01:00.000Z",time_msc:1641168060000}],/MT5_TICK_OUTSIDE_WINDOW/],
  [[c,a],/MT5_TICK_OUT_OF_ORDER/],
  [[{...a,time_msc:1641168000124}],/MT5_TICK_MILLISECOND_CONFLICT/],
  [[{...a,flags:-1}],/MT5_TICK_INVALID_FLAGS/]];
 for(const [rows,pattern] of cases)assert.throws(()=>importMt5OfflineTicks(fixture(rows)),pattern);
});
test("row count and payload byte size enforced",()=>{
 assert.throws(()=>importMt5OfflineTicks(fixture([])),/MT5_TICK_ROW_COUNT/);
 assert.throws(()=>importMt5OfflineTicks({...fixture(),maxBytes:2}),/MT5_TICK_SIZE_LIMIT/);
});
