/* XMI 2G: descriptive offline strategy research analytics.
 * No market fetch, predictions, composite performance rating, or execution.
 */
import {FX_RESOLUTIONS,validateResolution} from "./xmiLiveMath.mjs";
import {parseHistoricalFile} from "./xmiHistoricalFile.mjs";
import {replayHistoricalJson} from "./xmiHistoricalReplay.mjs";
import {compareSavedStrategyVersions,normalizeStrategyVersions} from "./xmiStrategyResearch.mjs";
import {inspectResearchSessions} from "./xmiResearchValidation.mjs";

export const RESEARCH_ANALYTICS_VERSION=1;
const CATEGORIES=Object.freeze(["aligned","conflicted","mixed","notReady"]);
const FILTERS=Object.freeze(["all","changed","jointlyScored","notReady"]);
const isValidRow=row=>row&&Number.isSafeInteger(row.time)&&
 CATEGORIES.includes(row.baseline)&&CATEGORIES.includes(row.candidate)&&
 typeof row.changed==="boolean"&&typeof row.readyBoth==="boolean";
const pct=(n,denominator)=>denominator>0?Math.round(n*1000/denominator)/10:0;
function distribution(counts,total){
 return CATEGORIES.map(category=>({category,count:counts[category],
  shareOfObservedPercent:pct(counts[category],total)}));
}
export function analyzeResearchComparison({source,symbol,resolution,baseline,candidate,
 comparison,now=Date.now()}={}){
 const step=FX_RESOLUTIONS[validateResolution(resolution)];
 if(typeof source!=="string"||source.length>900000)throw Error("Bounded local OHLC JSON is required");
 const [left,right]=normalizeStrategyVersions([baseline,candidate]);
 const checked=compareSavedStrategyVersions(source,{symbol,resolution,baseline:left,candidate:right,now});
 if(!comparison||JSON.stringify(checked)!==JSON.stringify(comparison))
  throw Error("Saved comparison changed; rerun it before analytics");
 const opts={symbol,resolution,strategyId:left.strategyId,now};
 const a=replayHistoricalJson(source,{...opts,edit:left.edit});
 const b=replayHistoricalJson(source,{...opts,edit:right.edit});
 const parsed=parseHistoricalFile(source,{symbol,resolution,now});
 const closed=parsed.bars.filter(row=>row.closed);
 if(a.totalBars!==closed.length||a.totalBars!==b.totalBars||
  a.totalBars!==checked.totalBars)throw Error("Historical observations disagree");
 const timeline=a.observations.map((row,i)=>{
  const other=b.observations[i];
  if(!other||row.time!==other.time||row.close!==other.close)
   throw Error("Research runs are not aligned on identical historical data");
  return Object.freeze({time:row.time,baseline:row.category,candidate:other.category,
   changed:row.category!==other.category,readyBoth:row.ready===true&&other.ready===true});
 });
 const changed=timeline.filter(row=>row.changed).length;
 const jointlyScored=timeline.filter(row=>row.readyBoth).length;
 if(changed!==checked.changedClassifications||jointlyScored!==checked.readyBoth)
  throw Error("Analytics do not match the closed-candle comparison");
 const session=inspectResearchSessions(closed,resolution,{asset:checked.asset});
 const spanSlots=(closed.at(-1).time-closed[0].time)/step+1;
 if(!Number.isSafeInteger(spanSlots)||spanSlots<a.totalBars)
  throw Error("Invalid research span");
 const lastA=a.observations.at(-1),lastB=b.observations.at(-1);
 const ready=(lastA.ready&&lastB.ready);
 const warmup=(lastA.indicatorReadiness.ema200&&lastB.indicatorReadiness.ema200);
 const checklist=[
  {id:"closed",label:"Closed candle admission",status:"PASS",
   detail:a.totalBars+" real closed candles passed the bounded OHLC import checks"},
  {id:"warmup",label:"EMA200 history availability",status:warmup?"PASS":"LIMITED",
   detail:warmup?"EMA200 available at the final confirmed candle":"At least one version lacks EMA200 history at the final candle"},
  {id:"scoring",label:"Version research readiness",status:ready?"PASS":"LIMITED",
   detail:ready?"Both configurations can describe the final closed candle":
    "One or both configurations are unscored or still warming"},
  {id:"sessions",label:"Official market-session coverage",status:"UNVERIFIED",
   detail:"UTC weekend candidates are only a heuristic; holidays, DST and venue hours are not verified"},
  {id:"provenance",label:"Data-provider authenticity",status:"UNVERIFIED",
   detail:"A local import and checksum cannot authenticate the originating price provider"}
 ];
 const analytics={
  version:RESEARCH_ANALYTICS_VERSION,mode:"OFFLINE_ANALYTICS_ONLY",
  baselineId:left.id,candidateId:right.id,strategyId:left.strategyId,
  symbol,resolution,totalBars:a.totalBars,firstCandle:a.firstCandle,lastCandle:a.lastCandle,
  datasetLabel:checked.datasetLabel,
  distribution:{baseline:distribution(a.counts,a.totalBars),
   candidate:distribution(b.counts,b.totalBars)},
  agreement:{changed,unchanged:a.totalBars-changed,jointlyScored,
   changedOfObservedPercent:pct(changed,a.totalBars),jointlyScoredOfObservedPercent:pct(jointlyScored,a.totalBars)},
  coverage:{observedBars:a.totalBars,wallClockSlots:spanSlots,
   observedWallClockPercent:pct(a.totalBars,spanSlots),
   gapSpans:session.gapSpans,missingIntervals:session.missingIntervals,
   utcWeekendCandidates:session.utcWeekendCandidates,
   unverifiedIntervals:session.unverifiedIntervals,
   exchangeCalendarVerified:false,providerAuthenticityVerified:false},
  checklist,timeline,
  disclaimer:"Research coverage and differences are descriptive only; not predictive accuracy, win rate, P&L, an actionable signal or an execution path. Wall-clock slots include closures."
 };
 return Object.freeze(analytics);
}
export function pageResearchObservations(analytics,{filter="changed",page=0,pageSize=20}={}){
 if(!analytics||analytics.mode!=="OFFLINE_ANALYTICS_ONLY"||
  !Array.isArray(analytics.timeline)||analytics.timeline.length>400||
  !analytics.timeline.every(isValidRow)||!FILTERS.includes(filter)||
  !Number.isInteger(page)||page<0||!Number.isInteger(pageSize)||pageSize<1||pageSize>50)
  throw Error("Invalid analytics history request");
 const rows=analytics.timeline.filter(row=>filter==="all"||
  filter==="changed"&&row.changed||
  filter==="jointlyScored"&&row.readyBoth||
  filter==="notReady"&&(!row.readyBoth));
 const pages=Math.max(1,Math.ceil(rows.length/pageSize));
 const offset=Math.min(page,pages-1)*pageSize;
 return Object.freeze({filter,page:Math.min(page,pages-1),pages,
  total:rows.length,rows:rows.slice(offset,offset+pageSize)});
}
