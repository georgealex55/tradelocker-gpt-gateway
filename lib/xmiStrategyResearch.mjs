/* XMI Milestone 2E: immutable, bounded, device-local research snapshots.
 * Preset edits do not execute trades or change the original XMI hard-confirm rules.
 */
import {strategyById} from "./xmiStrategyPresets.mjs";
import {normalizeStrategyEdit} from "./xmiStrategyEdits.mjs";
import {replayHistoricalJson} from "./xmiHistoricalReplay.mjs";
export const STRATEGY_VERSIONS_KEY="xmi-strategy-research-versions-v1";
export const RESEARCH_COMPARISONS_KEY="xmi-strategy-research-comparisons-v1";
export const MAX_VERSIONS_PER_STRATEGY=12;
export const MAX_SAVED_COMPARISONS=8;
const validName=value=>{
 if(typeof value!=="string")throw Error("Version label must be text");
 const name=value.trim().replace(/\s+/g," ");
 if(!name||name.length>48)throw Error("Version label must contain 1–48 characters");
 return name;
};
const integer=n=>Number.isSafeInteger(n)&&n>0;
export function normalizeStrategyVersions(input){
 const records=Array.isArray(input)?input:input?.records;
 if(!Array.isArray(records)||records.length>48)throw Error("Invalid strategy version store");
 const ids=new Set(),counts={};
 return records.map(item=>{
  if(!item||typeof item!=="object"||Array.isArray(item))throw Error("Invalid version record");
  const preset=strategyById(item.strategyId);
  if(!preset||!integer(item.version)||item.version>99999)throw Error("Invalid version identity");
  const id=item.strategyId+"-v"+item.version;
  if(item.id!==id||ids.has(id))throw Error("Duplicate or mismatched version identity");
  ids.add(id);
  counts[preset.id]=(counts[preset.id]||0)+1;
  if(counts[preset.id]>MAX_VERSIONS_PER_STRATEGY)throw Error("Too many saved versions");
  if(typeof item.edit!=="object"||!item.edit||Array.isArray(item.edit))throw Error("Invalid research parameters");
  const edit=normalizeStrategyEdit(preset.id,item.edit);
  if(["timeframe","rsiBull","rsiBear","requireMacd","requireVwap"].some(k=>edit[k]!==item.edit[k]))
   throw Error("Saved version contains invalid research parameters");
  return Object.freeze({id,strategyId:preset.id,version:item.version,
   name:validName(item.name),edit:Object.freeze({...edit}),createdAt:
    Number.isSafeInteger(item.createdAt)&&item.createdAt>0?item.createdAt:0});
 });
}
export function saveStrategyVersion(existing,{strategyId,name,edit,now=Date.now()}={}){
 const current=normalizeStrategyVersions(existing);
 if(!strategyById(strategyId))throw Error("Unknown research strategy");
 if(current.filter(x=>x.strategyId===strategyId).length>=MAX_VERSIONS_PER_STRATEGY)
  throw Error("Twelve versions maximum per strategy");
 const cfg=normalizeStrategyEdit(strategyId,edit);
 const version=Math.max(0,...current.filter(x=>x.strategyId===strategyId).map(x=>x.version))+1;
 const next={id:strategyId+"-v"+version,strategyId,version,
  name:validName(name),edit:{...cfg},createdAt:Math.trunc(now)};
 return normalizeStrategyVersions([...current,next]);
}
export function removeStrategyVersion(existing,id){
 const current=normalizeStrategyVersions(existing);
 if(!current.some(x=>x.id===id))throw Error("Saved strategy version not found");
 return current.filter(x=>x.id!==id);
}
function dataSignature(observations){
 // Non-cryptographic, reproducible *comparison label*. Not authentication or
 // proof that market data was authentic.
 const input=JSON.stringify(observations.map(({time,close})=>[time,close]));
 let hash=2166136261;
 for(let i=0;i<input.length;i++){hash=Math.imul(hash^input.charCodeAt(i),16777619)>>>0;}
 return "local32-"+hash.toString(16).padStart(8,"0");
}
export function compareSavedStrategyVersions(source,{symbol,resolution,baseline,candidate,
 now=Date.now()}={}){
 if(typeof source!=="string"||source.length>900000)throw Error("Historical input exceeds 900 KB");
 if(!baseline||!candidate||baseline.id===candidate.id)
  throw Error("Choose two different saved versions");
 const validated=normalizeStrategyVersions([baseline,candidate]);
 const [left,right]=validated;
 if(left.strategyId!==right.strategyId)throw Error("Compare versions of the same strategy only");
 if(left.edit.timeframe!==resolution||right.edit.timeframe!==resolution)
  throw Error("Both strategy versions must match the imported candle timeframe");
 const opts={symbol,resolution,strategyId:left.strategyId,now};
 const a=replayHistoricalJson(source,{...opts,edit:left.edit});
 const b=replayHistoricalJson(source,{...opts,edit:right.edit});
 if(a.totalBars!==b.totalBars||a.firstCandle!==b.firstCandle||a.lastCandle!==b.lastCandle)
  throw Error("Both versions must use the same confirmed candles");
 let changed=0,readyBoth=0,changedReady=0;
 for(let i=0;i<a.observations.length;i++){
  const x=a.observations[i],y=b.observations[i];
  if(x.time!==y.time||x.close!==y.close)throw Error("Dataset mismatch");
  if(x.ready&&y.ready)readyBoth++;
  if(x.category!==y.category){changed++;if(x.ready&&y.ready)changedReady++;}
 }
 return Object.freeze({
  schema:1,mode:"OFFLINE_RESEARCH_COMPARISON",strategyId:left.strategyId,
  baselineId:left.id,candidateId:right.id,baselineName:left.name,candidateName:right.name,
  resolution,asset:a.asset,datasetLabel:dataSignature(a.observations),
  firstCandle:a.firstCandle,lastCandle:a.lastCandle,totalBars:a.totalBars,
  excludedFormingBars:a.excludedFormingBars,
  baselineCounts:{...a.counts},candidateCounts:{...b.counts},
  changedClassifications:changed,changedScored:changedReady,readyBoth,
  disclosure:"Same closed historical candles, two versioned research configurations. Counts are descriptive, not simulated trades, P&L, win rates or predictive evidence."
 });
}
export function normalizeComparisonSummaries(input){
 const entries=Array.isArray(input)?input:input?.records;
 if(!Array.isArray(entries)||entries.length>MAX_SAVED_COMPARISONS)
  throw Error("Invalid comparison summary store");
 return entries.map(item=>{
  if(!item||typeof item!=="object"||item.mode!=="OFFLINE_RESEARCH_COMPARISON"||
   !strategyById(item.strategyId)||typeof item.datasetLabel!=="string"||
   !/^local32-[a-f0-9]{8}$/.test(item.datasetLabel)||
   !Number.isInteger(item.totalBars)||item.totalBars<2||item.totalBars>400||
   !Number.isInteger(item.changedClassifications)||item.changedClassifications<0||
   item.changedClassifications>item.totalBars||!Number.isSafeInteger(item.savedAt)||
   item.savedAt<=0||!/^([a-z]+)-v[0-9]+$/.test(item.baselineId)||
   !/^([a-z]+)-v[0-9]+$/.test(item.candidateId)||
   item.baselineId===item.candidateId)
   throw Error("Invalid comparison summary");
  return Object.freeze({mode:item.mode,strategyId:item.strategyId,
   baselineId:item.baselineId,candidateId:item.candidateId,
   datasetLabel:item.datasetLabel,totalBars:item.totalBars,
   changedClassifications:item.changedClassifications,savedAt:item.savedAt});
 });
}
export function saveComparisonSummary(records,comparison,{now=Date.now()}={}){
 const old=normalizeComparisonSummaries(records);
 if(comparison?.mode!=="OFFLINE_RESEARCH_COMPARISON")throw Error("Not a research-only comparison");
 const next={mode:comparison.mode,strategyId:comparison.strategyId,
  baselineId:comparison.baselineId,candidateId:comparison.candidateId,
  datasetLabel:comparison.datasetLabel,totalBars:comparison.totalBars,
  changedClassifications:comparison.changedClassifications,savedAt:Math.trunc(now)};
 return normalizeComparisonSummaries([...old,next].slice(-MAX_SAVED_COMPARISONS));
}
