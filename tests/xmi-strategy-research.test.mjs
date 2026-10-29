import test from "node:test";
import assert from "node:assert/strict";
import {normalizeStrategyVersions,saveStrategyVersion,removeStrategyVersion,
 compareSavedStrategyVersions,saveComparisonSummary,normalizeComparisonSummaries,
 MAX_VERSIONS_PER_STRATEGY,MAX_SAVED_COMPARISONS} from "../lib/xmiStrategyResearch.mjs";
const origin=Date.parse("2026-10-26T00:00:00.000Z")/1000;
function fixture(n=270){
 const bars=Array.from({length:n},(_,i)=>{
  const v=1.12+.00003*i+Math.sin(i/9)*.0003;
  return {time:origin+i*60,open:v-.00004,high:v+.0002,low:v-.0002,close:v,volume:80+i%10};
 });
 return JSON.stringify({symbol:"EURUSD",resolution:"1m",bars});
}
const now=(origin+270*60)*1000;
function variants(){
 const base=saveStrategyVersion([],{strategyId:"day",name:"Baseline",edit:{timeframe:"1m",rsiBull:55,rsiBear:45},now});
 return saveStrategyVersion(base,{strategyId:"day",name:"More selective",
  edit:{timeframe:"1m",rsiBull:65,rsiBear:35,requireVwap:true},now:now+1});
}
test("Immutable, explicitly versioned snapshots validate and retain canonical edits",()=>{
 const v=variants();
 assert.deepEqual(v.map(x=>x.id),["day-v1","day-v2"]);
 assert.equal(v[0].edit.rsiBull,55);
 assert.equal(v[1].edit.rsiBull,65);
 assert.equal(v[0].edit.timeframe,"1m");
 assert.equal(v[1].name,"More selective");
 assert.ok(Object.isFrozen(v[0])&&Object.isFrozen(v[0].edit));
 assert.deepEqual(normalizeStrategyVersions(JSON.parse(JSON.stringify({version:1,records:v}))),v);
 assert.deepEqual(removeStrategyVersion(v,"day-v2"),v.slice(0,1));
});
test("Dataset comparison is deterministic, shares precisely the same closed bars and has no P&L",()=>{
 const [baseline,candidate]=variants(),source=fixture();
 const compare=()=>compareSavedStrategyVersions(source,{symbol:"EURUSD",
  resolution:"1m",baseline,candidate,now});
 const a=compare(),b=compare();
 assert.deepEqual(a,b);
 assert.equal(a.totalBars,270);
 assert.equal(a.baselineId,"day-v1");
 assert.equal(a.candidateId,"day-v2");
 assert.equal(a.mode,"OFFLINE_RESEARCH_COMPARISON");
 assert.equal(a.changedClassifications<=a.totalBars,true);
 assert.equal(a.changedScored<=a.changedClassifications,true);
 assert.equal(a.readyBoth<=a.totalBars,true);
 assert.match(a.datasetLabel,/^local32-[a-f0-9]{8}$/);
 assert.match(a.disclosure,/not simulated trades/);
 assert.doesNotMatch(JSON.stringify(a),/"fills"|"orders"|"profit"|"pnl"/i);
 const summary=saveComparisonSummary([],a,{now});
 assert.equal(summary.length,1);
 assert.equal(summary[0].datasetLabel,a.datasetLabel);
 assert.equal(JSON.stringify(summary).includes("observations"),false);
 assert.deepEqual(normalizeComparisonSummaries(JSON.parse(JSON.stringify(summary))),summary);
});
test("Version comparison cannot silently use mismatched strategy or timeframe",()=>{
 const [baseline,candidate]=variants();
 assert.throws(()=>compareSavedStrategyVersions(fixture(),{symbol:"EURUSD",
  resolution:"5m",baseline,candidate,now}),/timeframe/);
 assert.throws(()=>compareSavedStrategyVersions(fixture(),{symbol:"EURUSD",
  resolution:"1m",baseline,candidate:baseline,now}),/two different/);
 const swing=saveStrategyVersion([],{strategyId:"swing",name:"Swing",edit:{timeframe:"1m"},now})[0];
 assert.throws(()=>compareSavedStrategyVersions(fixture(),{symbol:"EURUSD",
  resolution:"1m",baseline,candidate:swing,now}),/same strategy/);
 assert.throws(()=>compareSavedStrategyVersions(fixture(),{symbol:"GBPUSD",
  resolution:"1m",baseline,candidate,now}),/symbol does not match/);
});
test("Invalid and tampered versions fail closed rather than creating arbitrary strategy records",()=>{
 const [baseline]=variants();
 for(const item of [
  {...baseline,id:"__proto__"},{...baseline,version:0},
  {...baseline,strategyId:"BUY"},{...baseline,name:" "},
  {...baseline,edit:{...baseline.edit,rsiBull:99}},
  {...baseline,edit:null}
 ])assert.throws(()=>normalizeStrategyVersions([item]));
 assert.throws(()=>normalizeStrategyVersions([baseline,baseline]),/Duplicate/);
 assert.throws(()=>saveStrategyVersion([],{strategyId:"day",name:"",edit:{timeframe:"1m"}}),/label/);
 assert.throws(()=>removeStrategyVersion([baseline],"day-v99"),/not found/);
});
test("Per-strategy bound and bounded local summary history do not retain source prices",()=>{
 let versions=[];
 for(let n=0;n<MAX_VERSIONS_PER_STRATEGY;n++)
  versions=saveStrategyVersion(versions,{strategyId:"day",name:"Version "+n,edit:{timeframe:"1m"},now:now+n});
 assert.equal(versions.length,12);
 assert.throws(()=>saveStrategyVersion(versions,{strategyId:"day",name:"Overflow",edit:{timeframe:"1m"}}),/maximum/);
 const [baseline,candidate]=variants();
 const c=compareSavedStrategyVersions(fixture(),{symbol:"EURUSD",resolution:"1m",baseline,candidate,now});
 let archive=[];
 for(let n=0;n<MAX_SAVED_COMPARISONS+2;n++)
  archive=saveComparisonSummary(archive,c,{now:now+n});
 assert.equal(archive.length,MAX_SAVED_COMPARISONS);
 assert.equal(archive[0].savedAt,now+2);
 assert.equal(JSON.stringify(archive).includes("high"),false);
 assert.throws(()=>normalizeComparisonSummaries([{...archive[0],totalBars:90000}]),/Invalid/);
});
test("Original XMI hard-confirm preset remains unscored in version comparison",()=>{
 const v=saveStrategyVersion([],{strategyId:"xmi",name:"Reference one",edit:{timeframe:"1m"},now});
 const next=saveStrategyVersion(v,{strategyId:"xmi",name:"Reference two",
  edit:{timeframe:"1m",rsiBull:60},now});
 const c=compareSavedStrategyVersions(fixture(),{symbol:"EURUSD",resolution:"1m",
  baseline:next[0],candidate:next[1],now});
 assert.equal(c.baselineCounts.notReady,270);
 assert.equal(c.candidateCounts.notReady,270);
 assert.equal(c.readyBoth,0);
});
