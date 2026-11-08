import test from "node:test";
import assert from "node:assert/strict";
import {checkBars,detectAMDRetest} from "../scripts/xmi-amd-retest-core.mjs";
import {replayAMDRetest} from "../scripts/xmi-amd-retest-execution.mjs";
const start=Date.UTC(2024,0,8,10);
function bar(i,first=start){return{t:new Date(first+i*300000).toISOString(),o:100,h:100.12,l:99.88,c:100};}
function fixture(first=start,sweep=20){
  const b=Array.from({length:sweep+15},(_,i)=>bar(i,first));
  b[sweep]={...b[sweep],o:100,h:100.11,l:97.5,c:100.01};
  b[sweep+1]={...b[sweep+1],o:100.14,h:100.75,l:100.13,c:100.7};
  b[sweep+2]={...b[sweep+2],o:100.35,h:100.6,l:100.01,c:100.4};
  b[sweep+3]={...b[sweep+3],o:100.41,h:100.7,l:100.3,c:100.5};
  b[sweep+4]={...b[sweep+4],o:100.5,h:109,l:100.4,c:108};
  return b;
}
const I={lotSize:100,minLot:.01,lotStep:.01,symbolLeverage:200,spreadPrice:.45,
  slippagePriceEachSide:.07,specStatus:"MODELED_UNVERIFIED",
  swapLongUsdPerLotPerNight:null,swapShortUsdPerLotPerNight:null};
function run(bars,signals,lane,sizing,extra={},inst=I){
  return replayAMDRetest(bars,signals,inst,{symbol:"XAUUSD",lane,sizing,
    exitModel:"bracket_2r",carry:"session_flat",...extra});
}
test("causal rolling AMD and two different confirmed entry interpretations",()=>{
  const bars=fixture();
  for(const entryModel of ["range_reclaim_retest","mss_fvg_retest"]){
    const x=detectAMDRetest(bars,{rangeModel:"rolling",entryModel});
    assert.equal(x.signals.length,1);
    assert.equal(x.signals[0].sweepIndex,20);
    assert.equal(x.signals[0].confirmIndex,21);
    assert.equal(x.signals[0].signalIndex,22);
    assert.equal(x.signals[0].entryIndex,23);
  }
});
test("session-based AMD requires a complete 72-bar London Asian range",()=>{
  const bars=fixture(Date.UTC(2024,0,8,0),84);
  assert.equal(detectAMDRetest(bars,{rangeModel:"session_asia_london"}).signals.length,1);
  assert.equal(detectAMDRetest(bars.filter((_,i)=>i!==40),{rangeModel:"session_asia_london"}).signals.length,0);
});
test("2025 holdout prohibited and timestamps checked",()=>{
  assert.throws(()=>checkBars([{...bar(0),t:"2025-01-01T00:00:00.000Z"}]));
  assert.throws(()=>checkBars([bar(0),bar(0)]));
});
test("0.25% risk cannot afford minimum lot; all candidates remain in ledger",()=>{
  const b=fixture(),s=detectAMDRetest(b).signals;
  const r=run(b,s,"risk_fit","risk_0.0025");
  assert.equal(r.summary.unfundable,1);assert.equal(r.summary.signals,1);
  assert.ok(r.decisions[0].minimumRiskUSD>r.decisions[0].riskBudgetUSD);
  assert.ok(r.decisions[0].minimumMarginUSD>0);
  assert.equal(r.endingEquityUSD,1000);
});
test("force-min lane labels over-risk execution when margin permits",()=>{
  const b=fixture(),s=detectAMDRetest(b).signals;
  const r=run(b,s,"force_min_if_margin","risk_0.0025");
  assert.equal(r.summary.overrisk,1);assert.equal(r.summary.settledFunded,1);
  assert.equal(r.decisions[0].status,"funded_overrisk");
});
test("fixed lot and risk-sized lanes remain distinct",()=>{
  const b=fixture(),s=detectAMDRetest(b).signals;
  for(const sizing of ["fixed_0.01","risk_0.005","risk_0.01"]){
    const r=run(b,s,"force_min_if_margin",sizing);
    assert.equal(r.summary.decisions,r.summary.signals);
  }
});
test("zero-commission bid/ask execution records real spread+slippage losses",()=>{
  const b=fixture(),s=detectAMDRetest(b).signals;
  const r=run(b,s,"risk_fit","risk_0.01"),fill=r.decisions[0];
  assert.equal(r.summary.settledFunded,1);
  assert.ok(fill.spreadAndSlippageCostUSD>0);
  assert.ok(fill.grossUSD>fill.netUSD);
  assert.equal(fill.reason,"target");
});
test("shadow research cannot manufacture funded account returns",()=>{
  const b=fixture(),s=detectAMDRetest(b).signals;
  const r=run(b,s,"shadow_every_signal","risk_0.0025");
  assert.equal(r.summary.shadowOnly,1);
  assert.equal(r.summary.settledFunded,0);
  assert.equal(r.endingEquityUSD,1000);
});
test("unfundable margin stays unfunded even in forced-min lane",()=>{
  const b=fixture(),s=detectAMDRetest(b).signals;
  const r=run(b,s,"force_min_if_margin","risk_0.01",{}, {...I,symbolLeverage:.00001});
  assert.equal(r.summary.unfundable,1);
  assert.equal(r.endingEquityUSD,1000);
});
test("no fixed holding duration: unresolved position is not a completed win",()=>{
  const b=fixture();
  for(let i=24;i<b.length;i++)b[i]={...b[i],o:100.5,h:100.6,l:100.4,c:100.5};
  const r=run(b,detectAMDRetest(b).signals,"force_min_if_margin","risk_0.01",
    {carry:"overnight_with_swap_sensitivity"});
  assert.equal(r.summary.settledFunded,0);
  assert.equal(r.decisions[0].reason,"data_end_unresolved");
  assert.equal(r.endingEquityUSD,1000);
});
test("same strategy/rules generate deterministic results",()=>{
  const b=fixture(),s=detectAMDRetest(b).signals;
  assert.deepEqual(run(b,s,"risk_fit","risk_0.01"),run(b,s,"risk_fit","risk_0.01"));
});
