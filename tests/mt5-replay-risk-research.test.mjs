import test from "node:test";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {inspectMt5ReplayRisk} from "../lib/mt5/replayRiskResearch.mjs";
const start=Date.parse("2023-06-01T00:00:00Z")/1000;
const rows=Array.from({length:60},(_,i)=>({time:start+i*300,open:1.1+i*.00001,high:1.101+i*.00001,low:1.099+i*.00001,close:1.1005+i*.00001,tick_volume:10+i}));
const rawPayload=JSON.stringify(rows);
const manifest={contractVersion:1,source:"MT5_LOCAL_EXPORT",readOnly:true,executionEnabled:false,kind:"bars",symbol:"EURUSD",sha256:createHash("sha256").update(rawPayload).digest("hex"),rows:60,timezone:"UTC",exportedAt:"2026-11-12T08:00:00Z",window:{from:"2023-06-01T00:00:00Z",to:"2023-06-01T05:00:00Z"},timeframe:"M5"};
const spec={volume_min:0.01,volume_step:0.01,volume_max:10,trade_tick_size:0.00001,trade_tick_value:1,margin_per_lot_usd:200};
const input={manifest,rawPayload,spec,stopDistancePrice:0.002,spreadPrice:0.0001,slippagePrice:0.00005};
test("causal next-bar reference without assumed fills or P&L",()=>{
 const r=inspectMt5ReplayRisk(input);
 assert.equal(r.observations.length,59);
 assert.equal(r.observations[0].nextBarUtc,new Date(rows[1].time*1000).toISOString());
 assert.equal(r.observations[0].nextBarOpenReference,rows[1].open);
 assert.equal(r.pnlCalculated,false);assert.equal(r.executionEnabled,false);
 assert.equal(r.riskLanes.length,5);assert.equal(r.startingCapitalUsd,1000);
 assert.ok(r.observations.every(x=>x.fillVerified===false&&x.tradeExecuted===false));
});
test("missing broker cost or spec fails closed",()=>{
 assert.throws(()=>inspectMt5ReplayRisk({...input,slippagePrice:undefined}),/MT5_RISK_INVALID_SLIPPAGE/);
 assert.throws(()=>inspectMt5ReplayRisk({...input,spec:{...spec,margin_per_lot_usd:undefined}}),/MT5_RISK_INVALID_MARGIN_PER_LOT/);
});
test("tampered source and out-of-scope symbol fail closed",()=>{
 assert.throws(()=>inspectMt5ReplayRisk({...input,rawPayload:rawPayload+" "}),/MT5_SOURCE_HASH_MISMATCH/);
 assert.throws(()=>inspectMt5ReplayRisk({...input,manifest:{...manifest,symbol:"XAUUSD"}}),/MT5_RISK_REPLAY_SEVEN_PAIR_SCOPE/);
});
