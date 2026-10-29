import test from "node:test";
import assert from "node:assert/strict";
import {computeFive,quoteState} from "../lib/xmiLiveMath.mjs";
import {inspectCandleQuality} from "../lib/xmiDataQuality.mjs";
import {evaluateStrategy} from "../lib/xmiStrategyPresets.mjs";
const start=Date.parse("2026-10-27T00:00:00.000Z");
const step=60000;
const candles=Array.from({length:260},(_,i)=>{
 const close=1.11+i*.00003;
 return {time:(start+i*step)/1000,open:close-.00001,high:close+.00009,
  low:close-.00010,close,volume:100+i};
});
const now=start+261*step;
function inspect(rows=candles,options={}){
 const stats=computeFive(rows,"1m",now,"broker-tick");
 const quality=inspectCandleQuality({bars:stats.bars,overlays:stats.overlays,
  resolution:"1m",asOf:now,now,sourceQuality:"CURRENT",...options});
 return {stats,quality};
}
test("Full closed-bar dataset reports indicator readiness without fabricating candles",()=>{
 const {stats,quality}=inspect();
 assert.equal(quality.researchReady,true);
 assert.equal(quality.closedBars,260);
 assert.equal(quality.lastClosedTime,candles.at(-1).time);
 assert.equal(quality.recentGaps,0);
 assert.deepEqual(Object.keys(quality.indicatorStatus),
  ["ema20","ema50","ema200","rsi14","macd","vwap","volume"]);
 assert.ok(Object.values(quality.indicatorStatus).every(Boolean));
 stats.dataHealth=quality;
 assert.equal(evaluateStrategy("day",stats,"CURRENT").ready,true);
});
test("Forming candle values never satisfy readiness or alter closed-bar strategy",()=>{
 const closed=inspect();
 const forming={...candles.at(-1),time:(start+260*step)/1000,
  open:5,close:5,high:5,low:5,volume:1};
 const {stats,quality}=inspect([...candles,forming],{asOf:now-500});
 assert.equal(stats.latest.closed,false);
 assert.equal(quality.lastClosedTime,candles.at(-1).time);
 assert.equal(quality.closedBars,260);
 const previous=evaluateStrategy("day",closed.stats,"CURRENT");
 const current=evaluateStrategy("day",{...stats,dataHealth:quality},"CURRENT");
 assert.equal(current.state,previous.state);
 assert.equal(current.barTime,previous.barTime);
});
test("Warmup indicator availability is measured at latest CLOSED bar",()=>{
 const short=inspect(candles.slice(0,30));
 assert.equal(short.quality.indicatorStatus.ema200,false);
 assert.equal(short.quality.indicatorStatus.macd,false);
 assert.equal(short.quality.indicatorStatus.rsi14,true);
 assert.equal(short.quality.researchReady,true);
 assert.equal(evaluateStrategy("swing",{...short.stats,dataHealth:short.quality},"CURRENT").ready,false);
});
test("Missing series, stale source or invalid observation times fail closed",()=>{
 const {stats}=inspect();
 for(const [quality,asOf] of [["UNAVAILABLE",now],["STALE",now],
  ["CURRENT","invalid"],["CURRENT",now+120001],["CURRENT",now-3600000]]){
  const status=inspectCandleQuality({bars:stats.bars,overlays:stats.overlays,
   sourceQuality:quality,asOf,now,resolution:"1m"});
  assert.equal(status.researchReady,false);
  assert.equal(evaluateStrategy("day",{...stats,dataHealth:status},"CURRENT").ready,false);
 }
 const missing=inspectCandleQuality({bars:[],resolution:"1m",now,asOf:now,sourceQuality:"CURRENT"});
 assert.equal(missing.researchReady,false);
 assert.throws(()=>inspectCandleQuality({resolution:"invalid",now,asOf:now}),/Unsupported/);
});
test("Discontinuous history flags real missing periods without filling gaps",()=>{
 const rows=candles.filter((_,i)=>i!==252&&i!==253&&i!==254);
 const {quality,stats}=inspect(rows);
 assert.equal(stats.bars.length,257);
 assert.equal(quality.recentGaps,1);
 assert.equal(quality.missingPeriods,3);
 assert.equal(quality.researchReady,true);
 assert.ok(quality.reasons.includes("RECENT_CANDLE_GAPS"));
});
test("Historical-only analysis remains visibly offline, never a live signal",()=>{
 const {stats}=inspect();
 const historical=inspectCandleQuality({bars:stats.bars,overlays:stats.overlays,
  resolution:"1m",asOf:now,now:now+86400000,sourceQuality:"HISTORICAL"});
 assert.equal(historical.researchReady,true);
 assert.match(historical.label,/OFFLINE/);
 const out=evaluateStrategy("day",{...stats,dataHealth:historical},"HISTORICAL");
 assert.equal(out.ready,true);
 assert.match(out.state,/HISTORICAL/);
 assert.equal(quoteState(stats.lastClosed,now+86400000,"1m"),"STALE");
});
