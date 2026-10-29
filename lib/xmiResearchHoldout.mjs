/* XMI 2H: offline provenance evidence and retrospective chronological holdout.
 * Reports descriptive research classifications, NEVER prediction, execution,
 * vendor authentication, or performance backtesting.
 */
import {parseHistoricalFile} from "./xmiHistoricalFile.mjs";
import {inspectResearchSessions} from "./xmiResearchValidation.mjs";
import {parseInstrument,validateResolution} from "./xmiLiveMath.mjs";

export const HOLDOUT_VERSION=1;
export const SPLIT_PERCENTS=Object.freeze([60,70,80]);
const HEX=/^[a-fA-F0-9]{64}$/;
function assertText(value,cap=100){
 if(typeof value!=="string"||value.length>cap)throw Error("Invalid claimed source label");
 return value.trim().replace(/\s+/g," ").slice(0,cap);
}
function pct(n,d){return d?Math.round(n*1000/d)/10:0;}
async function sha256(value){
 if(!globalThis.crypto?.subtle)throw Error("Browser SHA-256 support is required");
 const data=new TextEncoder().encode(value),out=await globalThis.crypto.subtle.digest("SHA-256",data);
 return [...new Uint8Array(out)].map(b=>b.toString(16).padStart(2,"0")).join("");
}
export function summarizeHoldoutRows(rows){
 if(!Array.isArray(rows)||rows.length<1||rows.length>400)throw Error("Invalid retrospective research rows");
 const baseline={aligned:0,conflicted:0,mixed:0,notReady:0};
 const candidate={aligned:0,conflicted:0,mixed:0,notReady:0};
 let changed=0,jointlyScored=0,changedJointlyScored=0;
 for(const r of rows){
  if(!r||!Object.hasOwn(baseline,r.baseline)||!Object.hasOwn(candidate,r.candidate)||
   typeof r.changed!=="boolean"||typeof r.readyBoth!=="boolean"||
   r.changed!==(r.baseline!==r.candidate))throw Error("Invalid historical research classification");
  baseline[r.baseline]++;candidate[r.candidate]++;
  if(r.changed){changed++;if(r.readyBoth)changedJointlyScored++;}
  if(r.readyBoth)jointlyScored++;
 }
 return Object.freeze({bars:rows.length,baseline,candidate,changed,jointlyScored,
  changedJointlyScored,changedPercent:pct(changed,rows.length),
  jointlyScoredPercent:pct(jointlyScored,rows.length),
  first:rows[0].time,last:rows.at(-1).time});
}
export async function inspectResearchHoldout({source,symbol,resolution,analytics,now=Date.now(),
 trainPercent=70,claimedSource="",acquiredAt="",expectedSHA256="",
 rights="UNSPECIFIED"}={}){
 if(!SPLIT_PERCENTS.includes(trainPercent))throw Error("Unsupported chronological partition");
 if(!analytics||analytics.mode!=="OFFLINE_ANALYTICS_ONLY"||
  analytics.symbol!==symbol||analytics.resolution!==resolution||
  !Array.isArray(analytics.timeline)||analytics.timeline.length<100||
  analytics.timeline.length>400)throw Error("Run a bounded historical research comparison first");
 if(!["UNSPECIFIED","USER_ASSERTED_RIGHTS"].includes(rights))throw Error("Invalid user-supplied rights status");
 const claimed=assertText(claimedSource);
 if(typeof expectedSHA256!=="string"||expectedSHA256&& !HEX.test(expectedSHA256))
  throw Error("Expected SHA-256 must be exactly 64 hexadecimal characters");
 let stamp=null;
 if(acquiredAt!==""){
  if(typeof acquiredAt!=="string"||!/^\d{4}-\d{2}-\d{2}$/.test(acquiredAt))throw Error("Invalid claimed acquisition date");
  const parsed=Date.parse(acquiredAt+"T00:00:00.000Z");
  if(!Number.isFinite(parsed)||new Date(parsed).toISOString().slice(0,10)!==acquiredAt||
   parsed>now+86400000)throw Error("Claimed acquisition date is invalid or in the future");
  stamp=acquiredAt;
 }
 const instrument=parseInstrument(symbol);
 validateResolution(resolution);
 const parsed=parseHistoricalFile(source,{symbol,resolution,now});
 const closed=parsed.bars.filter(b=>b.closed);
 if(closed.length!==analytics.totalBars||analytics.timeline.length!==closed.length)
  throw Error("Historical dataset has changed; recompute research before review");
 for(let i=0;i<closed.length;i++){
  const bar=closed[i],row=analytics.timeline[i];
  if(row.time!==bar.time||!["aligned","conflicted","mixed","notReady"].includes(row.baseline)||
   !["aligned","conflicted","mixed","notReady"].includes(row.candidate))
   throw Error("Historical research observations no longer match imported candles");
 }
 // Exact canonical OHLCV digest, with full open/high/low/close/volume:
 // identical payload format to the existing 2F research report fingerprint.
 const digest=await sha256(JSON.stringify({marker:"XMI_OHLCV_CLOSED_V1",
  symbol,resolution,bars:closed.map(b=>[b.time,b.open,b.high,b.low,b.close,b.volume])}));
 const normalizedExpected=expectedSHA256.toLowerCase();
 const hashCheck=!expectedSHA256?"NOT_PROVIDED":
  normalizedExpected===digest?"MATCH":"MISMATCH";
 const cut=Math.floor(closed.length*trainPercent/100),train=analytics.timeline.slice(0,cut),
  holdout=analytics.timeline.slice(cut);
 if(train.length<40||holdout.length<20)throw Error("Insufficient bars for a chronological review");
 const training=summarizeHoldoutRows(train),evaluation=summarizeHoldoutRows(holdout);
 const sessions=inspectResearchSessions(closed,resolution,{asset:instrument.asset});
 return Object.freeze({
  version:HOLDOUT_VERSION,mode:"OFFLINE_RETROSPECTIVE_HOLDOUT",
  symbol,resolution,strategyId:analytics.strategyId,
  baselineId:analytics.baselineId,candidateId:analytics.candidateId,
  datasetSHA256:digest,expectedHashCheck:hashCheck,
  provenance:{claimedSource:claimed||"Unspecified",claimedAcquisitionDate:stamp,
   rights,sourceAuthenticated:false,sourceEvidence:"USER_DECLARED_ONLY",
   digestIndependentlyAuthenticated:false},
  trainPercent,cutIndex:cut,train:training,holdout:evaluation,
  cutTime:closed[cut].time,totalBars:closed.length,
  coverage:{gapSpans:sessions.gapSpans,missingIntervals:sessions.missingIntervals,
   weekendUtcCandidates:sessions.utcWeekendCandidates,
   unexplainedIntervals:sessions.unverifiedIntervals,
   venueCalendarVerified:false,providerAuthenticated:false},
  methodologicalLimits:[
   "Retrospective chronological holdout, not independently pre-registered or prospectively unseen.",
   "Earlier closed candles may warm indicators on later holdout bars; no future candles are used.",
   "Re-choosing presets or partitions after viewing results introduces selection bias.",
   "A checksum match does not establish the integrity or authenticity of the claimed source.",
   "No predictive accuracy, win rate, P&L, fills, order placement or trading execution."
  ]
 });
}
