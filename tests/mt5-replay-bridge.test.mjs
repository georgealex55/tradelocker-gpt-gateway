import test from "node:test";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {adaptMt5ExportBars,replayMt5Export} from "../lib/mt5/replayBridge.mjs";
const start=Date.parse("2022-01-03T00:00:00Z")/1000;
const rows=Array.from({length:60},(_,i)=>({time:start+i*300,open:1.1+i*.00001,high:1.101+i*.00001,low:1.099+i*.00001,close:1.1005+i*.00001,tick_volume:10+i,spread:10,real_volume:0}));
function fixture(data=rows,changes={}){
 const rawPayload=JSON.stringify(data);
 return {rawPayload,manifest:{contractVersion:1,source:"MT5_LOCAL_EXPORT",readOnly:true,executionEnabled:false,
 kind:"bars",symbol:"EURUSD",sha256:createHash("sha256").update(rawPayload).digest("hex"),
 rows:data.length,timezone:"UTC",exportedAt:"2026-11-12T08:00:00Z",
 window:{from:"2022-01-03T00:00:00Z",to:"2022-01-03T05:00:00Z"},timeframe:"M5",...changes}};
}
test("Python integer seconds payload converts without modifying source SHA",()=>{
 const f=fixture(),x=adaptMt5ExportBars(f);
 assert.equal(x.sourceSha256,f.manifest.sha256);assert.equal(x.bars.length,60);
 assert.equal(x.resolution,"5m");assert.equal(x.bars[0].volume,10);
});
test("existing causal research replay receives source-labeled closed bars",()=>{
 const x=replayMt5Export(fixture());
 assert.equal(x.source,"MT5_LOCAL_EXPORT");assert.equal(x.totalBars,60);
 assert.equal(x.executionEnabled,false);assert.equal(x.historicalFillsVerified,false);
 assert.equal(x.capitalModel,"NOT_APPLICABLE_NO_TRADES");
});
test("sealed-year preflight wins over invalid payload",()=>{
 const f=fixture();f.manifest.window={from:"2024-12-31T00:00:00Z",to:"2026-01-01T00:00:00Z"};
 f.rawPayload="not json";
 assert.throws(()=>adaptMt5ExportBars(f),/MT5_SEALED_2025_WINDOW/);
});
test("source tampering and incorrect timeframe fail closed",()=>{
 const f=fixture();assert.throws(()=>adaptMt5ExportBars({...f,rawPayload:f.rawPayload+" "}),/MT5_SOURCE_HASH_MISMATCH/);
 assert.throws(()=>adaptMt5ExportBars({...f,manifest:{...f.manifest,timeframe:"M2"}}),/MT5_EXPORT_TIMEFRAME_REQUIRED/);
});
test("out-of-order, duplicate, out-of-window bars rejected",()=>{
 const f=fixture([rows[0],rows[0]]);assert.throws(()=>adaptMt5ExportBars(f),/MT5_EXPORT_UNORDERED_OR_OUT_OF_WINDOW/);
 const g=fixture([rows[0],{...rows[1],time:start-300}]);
 assert.throws(()=>adaptMt5ExportBars(g),/MT5_EXPORT_UNORDERED_OR_OUT_OF_WINDOW/);
});
test("oversized source is not silently truncated to 400",()=>{
 const f=fixture(Array.from({length:401},(_,i)=>({...rows[0],time:start+i*300})));
 assert.throws(()=>adaptMt5ExportBars(f),/MT5_REPLAY_ROW_LIMIT/);
});
