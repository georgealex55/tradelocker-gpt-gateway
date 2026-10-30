import test from "node:test";
import assert from "node:assert/strict";
import {STRATEGIES,strategyById,evaluateStrategy,snapshotSummary} from "../lib/xmiStrategyPresets.mjs";
const t=1800000000;
function fake(overrides={}){
 const close=1.18;
 return {lastClosed:{time:t,open:1.16,high:1.2,low:1.15,close,closed:true},
  overlays:Object.fromEntries(Object.entries({
   ema20:1.19,ema50:1.16,ema200:1.11,rsi:62,macdHistogram:0.0007,vwap:1.15
  }).map(([key,value])=>[key,[{time:t-300,value},{time:t+300,value:key==="rsi"?5:-100}]])),
  ...overrides
 };
}
test("One research-only preset per scalp, day and swing type plus parked owner strategy",()=>{
 assert.deepEqual(STRATEGIES.map(x=>x.id),["scalp","day","swing","eur-scalp-5m","eur-london","gbp-breakout","jpy-pullback","xmi"]);
 assert.equal(strategyById("day").timeframe,"15m");
 assert.equal(strategyById("scalp").timeframe,"1m");
 assert.equal(strategyById("swing").timeframe,"4H");
 assert.equal(strategyById("xmi").unscored,true);
});
test("Nine-cell engine reads only last closed candle; ignores future indicator samples",()=>{
 const p=fake();
 for(const id of ["scalp","day","swing"]){
  const result=evaluateStrategy(id,p,"CURRENT");
  assert.equal(result.ready,true);assert.equal(result.zone,2);
  assert.equal(result.state,"ALIGNED");
  assert.match(result.summary,/Research watch only/);
  assert.equal(result.barTime,t);
 }
 assert.equal(evaluateStrategy("xmi",p,"CURRENT").state,"NOT_VALIDATED");
});
test("Stale, missing, and insufficient evidence cannot make entry or exit predictions",()=>{
 assert.equal(evaluateStrategy("day",fake(),"STALE").state,"UNAVAILABLE");
 assert.equal(evaluateStrategy("day",null,"CURRENT").ready,false);
 const incomplete=fake({overlays:{ema20:[],ema50:[],ema200:[],rsi:[],macdHistogram:[],vwap:[]}});
 assert.equal(evaluateStrategy("scalp",incomplete,"CURRENT").ready,false);
 assert.throws(()=>evaluateStrategy("untrusted",fake(),"CURRENT"),/Unknown/);
});
test("Snapshot is explicit about evidence limits and never returns broker execution actions",()=>{
 const p=evaluateStrategy("day",fake(),"CURRENT");
 const summary=snapshotSummary("day",p,"EURUSD","15m");
 assert.match(summary,/Day · VWAP Trend/);
 assert.match(summary,/Research state: ALIGNED/);
 assert.match(summary,/not a trading recommendation or execution/);
 assert.equal(summary.includes("placeOrder"),false);
});
