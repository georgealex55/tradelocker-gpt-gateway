/* XMI 2F: client-side research report integrity, never broker execution.
 * SHA-256 detects accidental/undetected edits relative to an independently
 * held digest; it does NOT authenticate a market data provider or sign a file.
 */
import {FX_RESOLUTIONS,validateResolution,parseInstrument} from "./xmiLiveMath.mjs";
import {parseHistoricalFile} from "./xmiHistoricalFile.mjs";
import {normalizeStrategyVersions,compareSavedStrategyVersions} from "./xmiStrategyResearch.mjs";

export const RESEARCH_REPORT_SCHEMA=1;
const MAX_REPORT_BYTES=160000;
const HEX=/^[a-f0-9]{64}$/;
const encode=s=>new TextEncoder().encode(s);
async function sha256(text){
 const subtle=globalThis.crypto?.subtle;
 if(!subtle)throw Error("This environment does not support SHA-256 research validation");
 const bytes=new Uint8Array(await subtle.digest("SHA-256",encode(text)));
 return [...bytes].map(v=>v.toString(16).padStart(2,"0")).join("");
}
const keys=(value,expected)=>value&&typeof value==="object"&&!Array.isArray(value)
 &&Object.keys(value).sort().join("|")===expected.slice().sort().join("|");
const integer=(n,min,max)=>Number.isSafeInteger(n)&&n>=min&&n<=max;
const dataFields=b=>[b.time,b.open,b.high,b.low,b.close,b.volume];
const versionFields=v=>({id:v.id,strategyId:v.strategyId,version:v.version,name:v.name,
 edit:{timeframe:v.edit.timeframe,rsiBull:v.edit.rsiBull,rsiBear:v.edit.rsiBear,
 requireMacd:v.edit.requireMacd,requireVwap:v.edit.requireVwap,notes:v.edit.notes},createdAt:v.createdAt});
function countSlotsInUtcWeekend(from,to,step){
 // Missing candle opens are strictly between actual candle timestamps.
 const count=(to-from)/step-1;
 if(count<=0)return 0;
 const slotsPerDay=86400/step,perWeek=slotsPerDay*7;
 const fullWeeks=Math.floor(count/perWeek),rem=count%perWeek;
 let weekend=fullWeeks*2*slotsPerDay;
 const start=from+step+fullWeeks*perWeek*step;
 for(let i=0;i<rem;i++){
  const day=new Date((start+i*step)*1000).getUTCDay();
  if(day===0||day===6)weekend++;
 }
 return weekend;
}
/* Never claim to know exchange holidays, regional FX open/close, or DST.
 * A weekend bucket is only a transparent UTC weekday heuristic.
 */
export function inspectResearchSessions(bars,resolution,{asset="forex"}={}){
 const step=FX_RESOLUTIONS[validateResolution(resolution)];
 if(!Array.isArray(bars)||bars.length<2||bars.length>400||!["forex","equity"].includes(asset))
  throw Error("Invalid bounded research session data");
 let missing=0,weekend=0,gapSpans=0;
 for(let i=1;i<bars.length;i++){
  const prev=bars[i-1]?.time,cur=bars[i]?.time;
  if(!integer(prev,1,4102444800)||!integer(cur,1,4102444800)||
   cur<=prev||(cur-prev)%step!==0||prev%step!==0||cur%step!==0)
   throw Error("Research candles must be ordered and timeframe-aligned");
  const n=(cur-prev)/step-1;
  if(n===0)continue;
  gapSpans++;missing+=n;
  if(asset==="forex")weekend+=countSlotsInUtcWeekend(prev,cur,step);
 }
 return Object.freeze({
  calendarPolicy:"UNVERIFIED_VENUE_SCHEDULE",asset,missingIntervals:missing,
  gapSpans,utcWeekendCandidates:weekend,unverifiedIntervals:missing-weekend,
  sessionCoverageVerified:false,
  explanation:"UTC weekend candidates are a heuristic only. Holidays, partial sessions, FX Sunday opens, exchange hours and DST are not verified."
 });
}
function validateCounts(c,n){
 if(!keys(c,["aligned","conflicted","mixed","notReady"])||
  !Object.values(c).every(v=>integer(v,0,n))||
  Object.values(c).reduce((a,b)=>a+b,0)!==n)throw Error("Report has invalid research counts");
}
function validateBody(body){
 if(!keys(body,["schema","mode","exportedAt","symbol","resolution","dataset","versions","comparison","sessionReview","disclosure"])||
  body.schema!==RESEARCH_REPORT_SCHEMA||body.mode!=="OFFLINE_RESEARCH_VALIDATION"||
  !integer(body.exportedAt,1,9999999999999))throw Error("Invalid research report schema");
 const instrument=parseInstrument(body.symbol);
 validateResolution(body.resolution);
 if(!keys(body.dataset,["sha256","algorithm","canonical","closedBars","firstCandle","lastCandle","excludedFormingBars"])||
  body.dataset.algorithm!=="SHA-256"||body.dataset.canonical!=="XMI_OHLCV_CLOSED_V1"||
  !HEX.test(body.dataset.sha256)||!integer(body.dataset.closedBars,2,400)||
  !integer(body.dataset.firstCandle,1,4102444800)||!integer(body.dataset.lastCandle,1,4102444800)||
  body.dataset.firstCandle>body.dataset.lastCandle||
  !integer(body.dataset.excludedFormingBars,0,400))throw Error("Invalid dataset integrity record");
 if(!keys(body.versions,["baseline","candidate"]))throw Error("Invalid version report");
 const [base,candidate]=normalizeStrategyVersions([body.versions.baseline,body.versions.candidate]);
 if(base.id===candidate.id||base.strategyId!==candidate.strategyId||
  base.edit.timeframe!==body.resolution||candidate.edit.timeframe!==body.resolution)
  throw Error("Research versions are incompatible");
 // Exactly canonical saved keys prevent hidden payloads from being accepted.
 for(const pair of [[body.versions.baseline,base],[body.versions.candidate,candidate]])
  if(JSON.stringify(pair[0])!==JSON.stringify(versionFields(pair[1])))
   throw Error("Noncanonical saved strategy record");
 const c=body.comparison,n=body.dataset.closedBars;
 if(!keys(c,["strategyId","baselineId","candidateId","totalBars","baselineCounts",
 "candidateCounts","changedClassifications","changedScored","readyBoth","datasetLabel"])||
  c.strategyId!==base.strategyId||c.baselineId!==base.id||c.candidateId!==candidate.id||
  c.totalBars!==n||!integer(c.changedClassifications,0,n)||
  !integer(c.changedScored,0,c.changedClassifications)||
  !integer(c.readyBoth,0,n)||c.changedScored>c.readyBoth||
  !/^local32-[a-f0-9]{8}$/.test(c.datasetLabel))
  throw Error("Invalid comparison metadata");
 validateCounts(c.baselineCounts,n);validateCounts(c.candidateCounts,n);
 const session=body.sessionReview;
 if(!keys(session,["calendarPolicy","asset","missingIntervals","gapSpans",
 "utcWeekendCandidates","unverifiedIntervals","sessionCoverageVerified","explanation"])||
  session.asset!==instrument.asset||session.calendarPolicy!=="UNVERIFIED_VENUE_SCHEDULE"||
  session.sessionCoverageVerified!==false||
  !integer(session.missingIntervals,0,1e9)||!integer(session.gapSpans,0,n-1)||
  !integer(session.utcWeekendCandidates,0,session.missingIntervals)||
  session.unverifiedIntervals!==session.missingIntervals-session.utcWeekendCandidates||
  typeof session.explanation!=="string"||session.explanation.length>500)
  throw Error("Invalid session verification status");
 if(body.disclosure!=="Research-only historical comparison. SHA-256 checks file integrity, not data provenance. No market-calendar certification, trading signals, fills, P&L or execution.")
  throw Error("Research safety declaration missing");
 return body;
}
function comparisonFields(c){return {
 strategyId:c.strategyId,baselineId:c.baselineId,candidateId:c.candidateId,
 totalBars:c.totalBars,baselineCounts:{...c.baselineCounts},candidateCounts:{...c.candidateCounts},
 changedClassifications:c.changedClassifications,changedScored:c.changedScored,
 readyBoth:c.readyBoth,datasetLabel:c.datasetLabel
};}
export async function createResearchReport({source,symbol,resolution,baseline,candidate,
 comparison,now=Date.now(),exportedAt=Date.now()}={}){
 if(typeof source!=="string"||source.length>900000||!integer(now,1,9999999999999))
  throw Error("Upload bounded, valid historical data before exporting");
 const [b,c]=normalizeStrategyVersions([baseline,candidate]);
 // A stale comparison or edited strategy selection may not be exported.
 const check=compareSavedStrategyVersions(source,{symbol,resolution,baseline:b,candidate:c,now});
 if(!comparison||JSON.stringify(check)!==JSON.stringify(comparison))
  throw Error("Replay or configuration changed; rerun the comparison before export");
 const imported=parseHistoricalFile(source,{symbol,resolution,now});
 const closed=imported.bars.filter(x=>x.closed);
 if(closed.length!==check.totalBars)throw Error("Dataset and comparison disagree");
 const session=inspectResearchSessions(closed,resolution,{asset:parseInstrument(symbol).asset});
 const datasetSHA=await sha256(JSON.stringify({
  marker:"XMI_OHLCV_CLOSED_V1",symbol,resolution,
  bars:closed.map(dataFields)
 }));
 const body=validateBody({
  schema:RESEARCH_REPORT_SCHEMA,mode:"OFFLINE_RESEARCH_VALIDATION",exportedAt,
  symbol,resolution,
  dataset:{sha256:datasetSHA,algorithm:"SHA-256",canonical:"XMI_OHLCV_CLOSED_V1",
   closedBars:closed.length,firstCandle:closed[0].time,lastCandle:closed.at(-1).time,
   excludedFormingBars:imported.bars.length-closed.length},
  versions:{baseline:versionFields(b),candidate:versionFields(c)},
  comparison:comparisonFields(check),sessionReview:session,
  disclosure:"Research-only historical comparison. SHA-256 checks file integrity, not data provenance. No market-calendar certification, trading signals, fills, P&L or execution."
 });
 const digest=await sha256(JSON.stringify(body));
 return {body,integrity:{algorithm:"SHA-256",sha256:digest}};
}
export async function verifyResearchReport(source){
 if(typeof source!=="string"||encode(source).length>MAX_REPORT_BYTES)
  throw Error("Research report exceeds 160 KB");
 let parsed;try{parsed=JSON.parse(source);}catch{throw Error("Invalid research report JSON");}
 if(!keys(parsed,["body","integrity"])||
  !keys(parsed.integrity,["algorithm","sha256"])||
  parsed.integrity.algorithm!=="SHA-256"||!HEX.test(parsed.integrity.sha256))
  throw Error("Research report checksum is missing");
 validateBody(parsed.body);
 const digest=await sha256(JSON.stringify(parsed.body));
 if(digest!==parsed.integrity.sha256)throw Error("Research report checksum mismatch");
 return Object.freeze({
  valid:true,mode:parsed.body.mode,datasetSHA256:parsed.body.dataset.sha256,
  symbol:parsed.body.symbol,resolution:parsed.body.resolution,
  closedBars:parsed.body.dataset.closedBars,
  strategyId:parsed.body.comparison.strategyId,
  baselineId:parsed.body.comparison.baselineId,
  candidateId:parsed.body.comparison.candidateId,
  changedClassifications:parsed.body.comparison.changedClassifications,
  sessionCoverageVerified:false,
  meaning:"Checksum verified for this file only; market-data authenticity is not established."
 });
}
