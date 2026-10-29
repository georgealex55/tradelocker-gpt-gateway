import test from "node:test";
import assert from "node:assert/strict";
import {inspectResearchHoldout,summarizeHoldoutRows} from "../lib/xmiResearchHoldout.mjs";
import {saveStrategyVersion,compareSavedStrategyVersions} from "../lib/xmiStrategyResearch.mjs";
import {analyzeResearchComparison} from "../lib/xmiResearchAnalytics.mjs";
const start=Date.parse("2026-10-26T00:00:00Z")/1000;
const bars=Array.from({length:260},(_,i)=>{
 const close=1.1+i*.00002+Math.sin(i/13)*.0003;
 return {time:start+i*60,open:close-.00003,high:close+.0001,low:close-.0001,close,volume:100+i%12};
});
const now=(bars.at(-1).time+60)*1000;
function setup(candles=bars){
 const source=JSON.stringify({symbol:"EURUSD",resolution:"1m",bars:candles});
 const first=saveStrategyVersion([],{strategyId:"day",name:"Base",edit:{timeframe:"1m"},now});
 const both=saveStrategyVersion(first,{strategyId:"day",name:"Strict",
  edit:{timeframe:"1m",rsiBull:68,rsiBear:32,requireVwap:true},now:now+1});
 const [baseline,candidate]=both,options={source,symbol:"EURUSD",resolution:"1m",baseline,candidate,now};
 const comparison=compareSavedStrategyVersions(source,options);
 const analytics=analyzeResearchComparison({...options,comparison});
 return {source,analytics,symbol:"EURUSD",resolution:"1m",now};
}
test("Retrospective holdout partitions the actual same closed bars with exact UTC cutoff",async()=>{
 const input=setup();
 for(const percent of [60,70,80]){
  const result=await inspectResearchHoldout({...input,trainPercent:percent});
  assert.equal(result.mode,"OFFLINE_RETROSPECTIVE_HOLDOUT");
  assert.equal(result.cutIndex,Math.floor(260*percent/100));
  assert.equal(result.train.bars+result.holdout.bars,260);
  assert.equal(result.train.first,bars[0].time);
  assert.equal(result.train.last,bars[result.cutIndex-1].time);
  assert.equal(result.cutTime,bars[result.cutIndex].time);
  assert.equal(result.holdout.first,result.cutTime);
  assert.equal(result.holdout.last,bars.at(-1).time);
  assert.equal(result.train.changed+result.holdout.changed,input.analytics.agreement.changed);
  assert.equal(result.train.jointlyScored+result.holdout.jointlyScored,input.analytics.agreement.jointlyScored);
  assert.equal(result.coverage.venueCalendarVerified,false);
  assert.equal(result.coverage.providerAuthenticated,false);
  assert.equal(result.provenance.sourceAuthenticated,false);
  assert.equal(result.expectedHashCheck,"NOT_PROVIDED");
  assert.match(result.datasetSHA256,/^[a-f0-9]{64}$/);
  assert.match(result.methodologicalLimits.join(" "),/not independently pre-registered/);
  assert.doesNotMatch(JSON.stringify(result),/"orders"\s*:|"winRate"\s*:|"profit"\s*:/i);
 }
});
test("User-provided SHA-256 match, missing or mismatch never certifies provider source",async()=>{
 const input=setup(),base=await inspectResearchHoldout(input);
 const declared=await inspectResearchHoldout({...input,expectedSHA256:base.datasetSHA256.toUpperCase(),
  claimedSource:"Unverified import",rights:"USER_ASSERTED_RIGHTS",acquiredAt:"2026-10-26"});
 assert.equal(declared.expectedHashCheck,"MATCH");
 assert.equal(declared.provenance.claimedSource,"Unverified import");
 assert.equal(declared.provenance.claimedAcquisitionDate,"2026-10-26");
 assert.equal(declared.provenance.sourceEvidence,"USER_DECLARED_ONLY");
 assert.equal(declared.provenance.sourceAuthenticated,false);
 const wrong=await inspectResearchHoldout({...input,expectedSHA256:"f".repeat(64)});
 assert.equal(wrong.expectedHashCheck,"MISMATCH");
 assert.equal(wrong.coverage.providerAuthenticated,false);
});
test("OHLCV fingerprint changes when a high or tick volume changes without changing closes",async()=>{
 const unchanged=setup(),fingerprint=await inspectResearchHoldout(unchanged);
 const copy=bars.map(x=>({...x}));copy[150].high+=0.002;copy[152].volume++;
 const different=setup(copy),audit=await inspectResearchHoldout(different);
 assert.equal(different.analytics.datasetLabel,unchanged.analytics.datasetLabel);
 assert.notEqual(audit.datasetSHA256,fingerprint.datasetSHA256);
});
test("Historical observations must correspond to closed imports and reject stale comparisons",async()=>{
 const input=setup(),altered=bars.slice(0,259);
 await assert.rejects(inspectResearchHoldout({...input,source:JSON.stringify({
  symbol:"EURUSD",resolution:"1m",bars:altered})}),/changed/);
 await assert.rejects(inspectResearchHoldout({...input,analytics:{
  ...input.analytics,timeline:input.analytics.timeline.slice(1)}}),/changed/);
 await assert.rejects(inspectResearchHoldout({...input,trainPercent:95}),/Unsupported/);
 await assert.rejects(inspectResearchHoldout({...input,rights:"VERIFIED_LICENSE"}),/rights/);
 await assert.rejects(inspectResearchHoldout({...input,expectedSHA256:"deadbeef"}),/SHA-256/);
 await assert.rejects(inspectResearchHoldout({...input,acquiredAt:"2026-02-31"}),/date/);
 await assert.rejects(inspectResearchHoldout({...input,acquiredAt:"2039-01-01"}),/future/);
});
test("Unscored rows never appear as scored holdout evidence",()=>{
 const row={time:1,baseline:"notReady",candidate:"notReady",changed:false,readyBoth:false};
 const result=summarizeHoldoutRows([row,row,row]);
 assert.equal(result.bars,3);
 assert.equal(result.jointlyScored,0);
 assert.equal(result.baseline.notReady,3);
 assert.equal(result.changedPercent,0);
 assert.throws(()=>summarizeHoldoutRows([{...row,changed:true}]),/Invalid/);
});
