import test from "node:test";
import assert from "node:assert/strict";
import {MT5_SEVEN_FX,assertMt5ResearchWindow,mt5Unavailable} from "../lib/mt5/contract.mjs";
import {calculateMt5RiskLanes,evaluateMt5Drawdown} from "../lib/mt5/riskLanes.mjs";
import {selectMt5ResearchSource} from "../lib/mt5/offlineBars.mjs";

// Synthetic, no proprietary data. Each symbol is a separate $1,000 feasibility lane.
// These are NOT broker tick values or authenticated GatesFX margin specifications.
const syntheticSpec={volume_min:0.01,volume_step:0.01,volume_max:10,
 trade_tick_size:0.00001,trade_tick_value:1,margin_per_lot_usd:200};
const sha="b".repeat(64);
const base={spec:syntheticSpec,stopDistancePrice:0.002,spreadPrice:0.0001,
 slippagePrice:0.00005,source:"MT5_LOCAL_EXPORT",sourceSha256:sha,
 asOfUtc:"2023-06-01T00:00:00Z",startingCapitalUsd:1000};
test("seven distinct majors retain equal coverage, no gold mixed into FX",()=>{
 assert.deepEqual(MT5_SEVEN_FX,["EURUSD","GBPUSD","USDJPY","USDCHF","AUDUSD","USDCAD","NZDUSD"]);
 assert.equal(new Set(MT5_SEVEN_FX).size,7);
 assert.equal(MT5_SEVEN_FX.includes("XAUUSD"),false);
 for(const symbol of MT5_SEVEN_FX){
  const output=calculateMt5RiskLanes({...base,spec:{...syntheticSpec}});
  assert.equal(output.lanes.length,5,symbol);
  assert.ok(output.lanes.every(l=>l.startingCapitalUsd===1000),symbol);
  assert.equal(output.executionEnabled,false,symbol);
  assert.equal(output.fillAssumed,false,symbol);
  assert.equal(output.lanes[4].experimental,true,symbol);
  assert.equal(output.model,"OFFLINE_PRETRADE_FEASIBILITY_ONLY",symbol);
 }
});
test("explicit UTC timestamp guard accepts valid dates and rejects ambiguous ones",()=>{
 assert.equal(calculateMt5RiskLanes(base).asOfUtc,base.asOfUtc);
 for(const asOfUtc of ["2023-06-01","2023-06-01T00:00:00+00:00","not-a-date"]){
  assert.throws(()=>calculateMt5RiskLanes({...base,asOfUtc}),/MT5_RISK_UTC_REQUIRED/);
 }
});
test("year permissions are enforced before any historical payload read",()=>{
 for(const year of [2022,2023,2024,2026]){
  const from=`${year}-06-01T00:00:00Z`,to=`${year}-06-02T00:00:00Z`;
  assert.equal(assertMt5ResearchWindow({from,to}).from,new Date(from).toISOString());
 }
 assert.throws(()=>assertMt5ResearchWindow({from:"2024-12-31T00:00:00Z",to:"2026-01-01T00:00:00Z"}),/MT5_SEALED_2025_WINDOW/);
 assert.throws(()=>assertMt5ResearchWindow({from:"2025-06-01T00:00:00Z",to:"2025-06-02T00:00:00Z"}),/MT5_SEALED_2025_WINDOW/);
});
test("provider selection is opt-in and unavailable state is explicit",()=>{
 assert.equal(selectMt5ResearchSource().selected,false);
 assert.equal(selectMt5ResearchSource({source:"mt5"}).executionEnabled,false);
 assert.throws(()=>selectMt5ResearchSource({source:"mt5",mode:"LIVE"}),/MT5_UNSAFE_PROVIDER_MODE/);
 assert.equal(mt5Unavailable().ok,false);
});
test("unverified symbol margin cannot silently become funded",()=>{
 assert.throws(()=>calculateMt5RiskLanes({...base,spec:{...syntheticSpec,margin_per_lot_usd:undefined}}),/MT5_RISK_INVALID_MARGIN_PER_LOT/);
 assert.equal(evaluateMt5Drawdown({currentEquityUsd:900}).halted,true);
});
