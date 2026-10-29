import test from "node:test";
import assert from "node:assert/strict";
import {saveStrategyVersion,compareSavedStrategyVersions} from "../lib/xmiStrategyResearch.mjs";
import {createResearchReport,verifyResearchReport,inspectResearchSessions}
 from "../lib/xmiResearchValidation.mjs";
const start=Date.parse("2026-10-23T00:00:00.000Z")/1000;
const candles=Array.from({length:260},(_,i)=>{
 const close=1.02+i*.00001+Math.sin(i/4)*.0002;
 return {time:start+i*60,open:close-.00004,high:close+.0001,low:close-.0001,close,volume:100+i%10};
});
const source=JSON.stringify({symbol:"EURUSD",resolution:"1m",bars:candles});
const now=(candles.at(-1).time+60)*1000;
function setup(){
 const first=saveStrategyVersion([],{strategyId:"day",name:"Original",edit:{timeframe:"1m",rsiBull:55,rsiBear:45},now});
 const versions=saveStrategyVersion(first,{strategyId:"day",name:"Alternative",edit:{timeframe:"1m",rsiBull:65,rsiBear:35},now:now+1});
 const [baseline,candidate]=versions;
 const comparison=compareSavedStrategyVersions(source,{symbol:"EURUSD",resolution:"1m",baseline,candidate,now});
 return {source,symbol:"EURUSD",resolution:"1m",baseline,candidate,comparison,now,exportedAt:now+20};
}
test("SHA-256 comparison export verifies, contains no raw candles, and is deterministic",async()=>{
 const args=setup();
 const a=await createResearchReport(args),b=await createResearchReport(args);
 assert.deepEqual(a,b);
 assert.match(a.integrity.sha256,/^[a-f0-9]{64}$/);
 assert.match(a.body.dataset.sha256,/^[a-f0-9]{64}$/);
 assert.equal(a.body.dataset.closedBars,260);
 assert.equal(a.body.sessionReview.sessionCoverageVerified,false);
 const out=await verifyResearchReport(JSON.stringify(a));
 assert.equal(out.valid,true);
 assert.equal(out.closedBars,260);
 assert.equal(out.changedClassifications,a.body.comparison.changedClassifications);
 assert.match(out.meaning,/authenticity is not established/);
 assert.equal(JSON.stringify(a).includes('"bars":'),false);
 assert.equal(JSON.stringify(a).includes('"observations":'),false);
 assert.equal(JSON.stringify(a).includes('"profit":'),false);
 assert.equal(JSON.stringify(a).includes('"orders":'),false);
});
test("Tampered research count, version, dataset digest or status fails closed",async()=>{
 const a=await createResearchReport(setup());
 for(const mutate of [
  r=>{r.body.comparison.changedClassifications++;},
  r=>{r.body.dataset.sha256="0".repeat(64);},
  r=>{r.body.versions.candidate.edit.rsiBull=99;},
  r=>{r.body.sessionReview.sessionCoverageVerified=true;},
  r=>{r.integrity.sha256="f".repeat(64);},
  r=>{r.body.executions=[{symbol:"EURUSD"}];}
 ]){
  const copy=JSON.parse(JSON.stringify(a));mutate(copy);
  await assert.rejects(verifyResearchReport(JSON.stringify(copy)));
 }
});
test("Report cannot export stale comparisons, mismatched symbol, or unchecked forming candle",async()=>{
 const args=setup();
 await assert.rejects(createResearchReport({...args,comparison:{...args.comparison,changedClassifications:123}}),/rerun/);
 await assert.rejects(createResearchReport({...args,symbol:"GBPUSD"}),/symbol does not match|mismatch/);
 const later=JSON.stringify({symbol:"EURUSD",resolution:"1m",bars:[...candles,{
  ...candles.at(-1),time:candles.at(-1).time+60,close:1.2,open:1.2,high:1.3,low:1.1
 }]});
 await assert.rejects(createResearchReport({...args,source:later,now:now+120000}),/rerun/);
});
test("Full-candle SHA detects altered highs or volumes while old close-only label stays equal",async()=>{
 const x=setup(),original=await createResearchReport(x);
 const changed=JSON.parse(source);
 changed.bars[120].high+=0.001;
 const variant=JSON.stringify(changed);
 const alternative=compareSavedStrategyVersions(variant,x);
 assert.equal(alternative.datasetLabel,x.comparison.datasetLabel);
 const other=await createResearchReport({...x,source:variant,comparison:alternative});
 assert.notEqual(original.body.dataset.sha256,other.body.dataset.sha256);
});
test("UTC weekend exact counting covers long gaps without the previous 10k-slot cap",()=>{
 const fri=Date.parse("2026-10-23T23:00:00.000Z")/1000;
 const mon=Date.parse("2026-11-09T00:00:00.000Z")/1000;
 const actual=[{time:fri},{time:mon}];
 const fx=inspectResearchSessions(actual,"1m",{asset:"forex"});
 assert.equal(fx.gapSpans,1);
 assert.equal(fx.missingIntervals,(mon-fri)/60-1);
 assert.equal(fx.utcWeekendCandidates,6*1440);
 assert.equal(fx.unverifiedIntervals,fx.missingIntervals-fx.utcWeekendCandidates);
 assert.equal(fx.sessionCoverageVerified,false);
 const equity=inspectResearchSessions(actual,"1m",{asset:"equity"});
 assert.equal(equity.utcWeekendCandidates,0);
 assert.equal(equity.unverifiedIntervals,equity.missingIntervals);
 assert.match(equity.explanation,/not verified/);
});
test("Missing, reversed or unaligned session history is rejected",()=>{
 for(const bars of [[],[{time:100},{time:100}],
  [{time:1600000020},{time:1600000080}], [{time:1600000200},{time:1600000140}]]){
  assert.throws(()=>inspectResearchSessions(bars,"1m"));
 }
});
test("Unscored legacy XMI remains explicitly unscored in signed research-only export",async()=>{
 const base=saveStrategyVersion([],{strategyId:"xmi",name:"Not scored",edit:{timeframe:"1m"},now});
 const variants=saveStrategyVersion(base,{strategyId:"xmi",name:"Still not scored",
  edit:{timeframe:"1m",rsiBull:60},now:now+1});
 const [baseline,candidate]=variants;
 const comparison=compareSavedStrategyVersions(source,{symbol:"EURUSD",resolution:"1m",baseline,candidate,now});
 const file=await createResearchReport({source,symbol:"EURUSD",resolution:"1m",
  baseline,candidate,comparison,now,exportedAt:now});
 assert.equal(file.body.comparison.baselineCounts.notReady,260);
 assert.equal(file.body.comparison.candidateCounts.notReady,260);
 assert.equal((await verifyResearchReport(JSON.stringify(file))).valid,true);
});
test("Malformed and oversized imports are never treated as verified reports",async()=>{
 for(const payload of ["not json","{}",JSON.stringify({body:{},integrity:{}}),"x".repeat(160001)])
  await assert.rejects(verifyResearchReport(payload));
});
