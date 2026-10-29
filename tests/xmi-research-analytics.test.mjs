import test from "node:test";
import assert from "node:assert/strict";
import {analyzeResearchComparison,pageResearchObservations}
 from "../lib/xmiResearchAnalytics.mjs";
import {saveStrategyVersion,compareSavedStrategyVersions} from "../lib/xmiStrategyResearch.mjs";
const t0=Date.parse("2026-10-26T00:00:00Z")/1000;
const bars=Array.from({length:260},(_,i)=>{
 const close=1.1+i*.000013+Math.sin(i/9)*.0004;
 return {time:t0+i*60,open:close-.0001,high:close+.0002,
  low:close-.0002,close,volume:110+i%11};
});
const now=(bars.at(-1).time+60)*1000;
const source=JSON.stringify({symbol:"EURUSD",resolution:"1m",bars});
function setup({strategyId="day",sourceFile=source}={}){
 const [baseline]=saveStrategyVersion([],{strategyId,name:"RSI default",
  edit:{timeframe:"1m",rsiBull:55,rsiBear:45},now});
 const versions=saveStrategyVersion([baseline],{strategyId,name:"RSI strict",
  edit:{timeframe:"1m",rsiBull:70,rsiBear:30,requireVwap:true},now:now+1});
 const candidate=versions[1];
 const comparison=compareSavedStrategyVersions(sourceFile,{symbol:"EURUSD",resolution:"1m",
  baseline,candidate,now});
 return {source:sourceFile,symbol:"EURUSD",resolution:"1m",
  baseline,candidate,comparison,now};
}
test("Same observed candles produce repeatable descriptive analytics, never trading performance",()=>{
 const args=setup();
 const a=analyzeResearchComparison(args),b=analyzeResearchComparison(args);
 assert.deepEqual(a,b);
 assert.equal(a.mode,"OFFLINE_ANALYTICS_ONLY");
 assert.equal(a.totalBars,260);
 assert.equal(a.timeline.length,260);
 assert.equal(a.agreement.changed,args.comparison.changedClassifications);
 assert.equal(a.agreement.jointlyScored,args.comparison.readyBoth);
 assert.equal(a.distribution.baseline.reduce((n,r)=>n+r.count,0),260);
 assert.equal(a.distribution.candidate.reduce((n,r)=>n+r.count,0),260);
 assert.equal(a.coverage.wallClockSlots,260);
 assert.equal(a.coverage.observedWallClockPercent,100);
 assert.equal(a.coverage.exchangeCalendarVerified,false);
 assert.equal(a.coverage.providerAuthenticityVerified,false);
 assert.equal(a.checklist.filter(x=>x.status==="UNVERIFIED").length,2);
 for(const r of a.timeline)assert.ok(["aligned","conflicted","mixed","notReady"].includes(r.baseline));
 assert.doesNotMatch(JSON.stringify(a),/"profit"\s*:|"orders"\s*:|"winRate"\s*:/i);
});
test("View filters paginate correctly and cannot change the underlying result",()=>{
 const a=analyzeResearchComparison(setup()),backup=JSON.stringify(a);
 for(const filter of ["all","changed","jointlyScored","notReady"]){
  const first=pageResearchObservations(a,{filter,page:0,pageSize:20});
  assert.equal(first.total,filter==="all"?260:
   filter==="changed"?a.agreement.changed:
   filter==="jointlyScored"?a.agreement.jointlyScored:
   a.timeline.filter(x=>!x.readyBoth).length);
  assert.ok(first.rows.length<=20);
  assert.equal(first.pages,Math.max(1,Math.ceil(first.total/20)));
  const last=pageResearchObservations(a,{filter,page:999,pageSize:20});
  assert.equal(last.page,last.pages-1);
  if(filter==="changed")assert.ok(first.rows.every(r=>r.changed));
 }
 assert.equal(JSON.stringify(a),backup);
 for(const opts of [{filter:"orders"},{page:-1},{pageSize:0},{pageSize:100}])
  assert.throws(()=>pageResearchObservations(a,opts),/Invalid/);
});
test("A stale comparison cannot be presented as current analytics",()=>{
 const args=setup();
 assert.throws(()=>analyzeResearchComparison({...args,comparison:{...args.comparison,changedClassifications:99}}),/rerun/);
 assert.throws(()=>analyzeResearchComparison({...args,source:"not json"}));
 assert.throws(()=>analyzeResearchComparison({...args,candidate:args.baseline}),/different/);
});
test("Warmup and unscored original strategy remain limited, not magically validated",()=>{
 const args=setup({strategyId:"xmi"});
 const a=analyzeResearchComparison(args);
 assert.equal(a.agreement.jointlyScored,0);
 assert.equal(a.agreement.changed,0);
 assert.ok(a.timeline.every(x=>x.baseline==="notReady"&&x.candidate==="notReady"));
 assert.equal(a.checklist.find(x=>x.id==="scoring").status,"LIMITED");
 assert.equal(a.checklist.find(x=>x.id==="provenance").status,"UNVERIFIED");
});
test("Wall-clock coverage discloses missing slots without asserting missing trades",()=>{
 const chosen=bars.filter((_,i)=>i<250||i>=255);
 const sourceFile=JSON.stringify({symbol:"EURUSD",resolution:"1m",bars:chosen});
 const args=setup({sourceFile}),a=analyzeResearchComparison(args);
 assert.equal(a.totalBars,255);
 assert.equal(a.coverage.wallClockSlots,260);
 assert.equal(a.coverage.missingIntervals,5);
 assert.equal(a.coverage.gapSpans,1);
 assert.equal(a.coverage.observedWallClockPercent,98.1);
 assert.equal(a.coverage.unverifiedIntervals,5);
 assert.ok(a.disclaimer.includes("Wall-clock slots include closures"));
});
test("Appending a future candle leaves every preceding observation unchanged",()=>{
 const base=setup(),before=analyzeResearchComparison(base);
 const extra={...bars.at(-1),time:bars.at(-1).time+60,
  open:4,high:4.1,low:3.9,close:4,volume:5};
 const appended=JSON.stringify({symbol:"EURUSD",resolution:"1m",bars:[...bars,extra]});
 const updated=setup({sourceFile:appended});
 const after=analyzeResearchComparison({...updated,now:now+60000});
 assert.deepEqual(after.timeline.slice(0,260),before.timeline);
});
