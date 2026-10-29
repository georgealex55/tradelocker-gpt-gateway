import test from "node:test";
import assert from "node:assert/strict";
import {replayHistoricalResearch,replayHistoricalJson,classifyHistoricalGaps} from "../lib/xmiHistoricalReplay.mjs";
const start=Date.parse("2026-10-26T00:00:00.000Z")/1000;
const minute=60;
function candles(n=270){
 return Array.from({length:n},(_,i)=>{
  const close=1.105+i*.00003+Math.sin(i/10)*.0001;
  return {time:start+i*minute,open:close-.00004,
   high:close+.0002,low:close-.0002,close,volume:50+i%20};
 });
}
const args={resolution:"1m",strategyId:"day",asset:"forex"};
test("Replay is deterministic, offline, bounded and never returns entry/exit or fills",()=>{
 const bars=candles();
 const a=replayHistoricalResearch({bars,...args});
 const b=replayHistoricalResearch({bars,...args});
 assert.deepEqual(a,b);
 assert.equal(a.mode,"OFFLINE_HISTORICAL_RESEARCH");
 assert.equal(a.totalBars,270);
 assert.equal(a.observations.length,270);
 assert.equal(a.scored+a.counts.notReady,270);
 assert.equal(a.counts.aligned+a.counts.conflicted+a.counts.mixed+a.counts.notReady,270);
 assert.ok(a.scored>0);
 assert.ok(a.observations.every(x=>!Object.hasOwn(x,"profit")&&!Object.hasOwn(x,"order")&&!Object.hasOwn(x,"signal")));
 assert.equal(a.observations[0].ready,false);
 assert.match(a.interpretation,/No entries, exits, fills/);
});
test("A future candle, even with extreme prices, cannot change earlier replay observations",()=>{
 const before=candles(260);
 const previous=replayHistoricalResearch({bars:before,...args});
 const future={...candles(261).at(-1),close:1000,open:1000,high:1100,low:900,volume:999999};
 const after=replayHistoricalResearch({bars:[...before,future],...args});
 assert.deepEqual(after.observations.slice(0,260),previous.observations);
 assert.equal(after.observations.length,261);
});
test("One forming candle is never evaluated at its opening; the earliest possible evaluation is close",()=>{
 const result=replayHistoricalResearch({bars:candles(70),...args});
 assert.equal(result.observations[0].time,start);
 assert.equal(result.lastCandle,start+69*minute);
 const extra={...candles(71).at(-1),time:start+70*minute};
 const extended=replayHistoricalResearch({bars:[...candles(70),extra],...args});
 assert.deepEqual(extended.observations.slice(0,70),result.observations);
});
test("Weekend gap classification is conservative; equity calendars are never invented",()=>{
 const fri=Date.parse("2026-10-23T23:00:00.000Z")/1000;
 const mon=Date.parse("2026-10-26T00:00:00.000Z")/1000;
 const weekend=classifyHistoricalGaps([{time:fri},{time:mon}],"1H");
 assert.equal(weekend.missing,48);
 assert.equal(weekend.weekendUtcEstimate,48);
 assert.equal(weekend.unclassified,0);
 const equities=classifyHistoricalGaps([{time:fri},{time:mon}],"1H",{asset:"equity"});
 assert.equal(equities.unclassified,48);
 assert.equal(equities.weekendUtcEstimate,0);
 assert.match(equities.calendar,/unverified/);
});
test("Replay refuses corrupt or duplicate timestamps, unsupported sizes and asset classes",()=>{
 const bars=candles(2);
 assert.throws(()=>replayHistoricalResearch({bars:[bars[0],bars[0]],...args}),/Duplicate/);
 assert.throws(()=>replayHistoricalResearch({bars:[{...bars[0],high:0.1},bars[1]],...args}),/Malformed/);
 assert.throws(()=>replayHistoricalResearch({bars:Array.from({length:401},(_,i)=>({...bars[0],time:start+i*60})),...args}),/2–400/);
 assert.throws(()=>replayHistoricalResearch({bars,asset:"future",resolution:"1m"}),/Unsupported/);
 assert.throws(()=>replayHistoricalResearch({bars,...args,resolution:"3m"}),/Unsupported/);
});
test("Legacy unscored XMI remains unscored in historical replay",()=>{
 const r=replayHistoricalResearch({bars:candles(260),...args,strategyId:"xmi"});
 assert.equal(r.scored,0);
 assert.ok(r.observations.every(o=>o.state==="NOT_VALIDATED"));
});
test("Local import rejects symbol/timeframe mismatch and uses no live endpoint",()=>{
 const values=candles(260);
 const text=JSON.stringify({symbol:"EURUSD",resolution:"1m",bars:values});
 const opts={symbol:"EURUSD",resolution:"1m",strategyId:"day",now:(values.at(-1).time+60)*1000};
 const replay=replayHistoricalJson(text,opts);
 assert.equal(replay.totalBars,260);
 assert.throws(()=>replayHistoricalJson(text,{...opts,symbol:"GBPUSD"}),/symbol does not match/);
 assert.throws(()=>replayHistoricalJson(text,{...opts,resolution:"5m"}),/timeframe differs/);
});
