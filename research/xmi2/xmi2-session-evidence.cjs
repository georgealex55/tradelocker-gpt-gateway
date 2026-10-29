/* Strict offline session and corporate-action evidence. Caller-supplied calendar; no remote I/O. */
"use strict";
const crypto=require("node:crypto");
const VERSION="xmi-session-evidence/v1";
const hash=x=>crypto.createHash("sha256").update(JSON.stringify(x)).digest("hex");
function validate(dataset,registry,policy,evidence){
 if(!evidence||evidence.version!==VERSION||evidence.datasetId!==registry.datasetId||
  !["synthetic","exchange"].includes(evidence.calendarType)||
  !["UTC","America/New_York"].includes(evidence.marketTimezone)||
  !Array.isArray(evidence.sessions)||evidence.sessions.length>5000||
  !Array.isArray(evidence.corporateActions)||evidence.corporateActions.length>1000||
  typeof evidence.sourceReference!=="string"||evidence.sourceReference.length<4||
  evidence.reviewerApproved!==true)throw Error("Invalid session evidence");
 if(policy.assetClass==="synthetic"&&evidence.calendarType!=="synthetic")throw Error("Synthetic calendar mismatch");
 if(policy.assetClass==="equity"&&evidence.calendarType!=="exchange")throw Error("Exchange calendar required");
 const sessions=evidence.sessions;let previous=0;
 for(const s of sessions){
  if(!s||!Number.isSafeInteger(s.open)||!Number.isSafeInteger(s.close)||s.open<1||s.close<=s.open||
    s.open<previous||s.close-s.open>172800||!["regular","shortened"].includes(s.kind))
   throw Error("Invalid session interval");
  previous=s.close;
 }
 const parts=registry.partitions,barTimes=new Set(dataset.bars.map(b=>b.time));
 for(const p of parts){
  const bars=dataset.bars.filter(b=>b.time>=p.start&&b.time<p.end);
  for(const b of bars){
   if(!sessions.some(s=>b.time>=s.open&&b.time+p.barSeconds<=s.close))
    throw Error("Historical bar outside admitted session");
  }
  const expected=new Set();
  for(const s of sessions)for(let t=Math.max(s.open,p.start);t+p.barSeconds<=Math.min(s.close,p.end);t+=p.barSeconds){
   if((t-p.start)%p.barSeconds===0)expected.add(t);
  }
  for(const t of expected)if(!barTimes.has(t))throw Error("Missing scheduled historical candle");
  for(const b of bars)if(!expected.has(b.time))throw Error("Historical candle not scheduled");
 }
 if(policy.assetClass==="equity"&&evidence.marketTimezone!=="America/New_York")throw Error("Equity market timezone mismatch");
 if(policy.assetClass==="equity"&&!evidence.sessions.length)throw Error("Missing exchange sessions");
 if(policy.adjustmentBasis==="adjusted-with-provenance"&&evidence.corporateActionReference!==policy.corporateActionReference)
  throw Error("Adjustment source mismatch");
 if(policy.assetClass==="equity"&&evidence.actionsReviewed!==true)throw Error("Corporate action review required");
 let last=0;
 for(const a of evidence.corporateActions){
  if(!a||!Number.isSafeInteger(a.effectiveAt)||a.effectiveAt<=last||
    !["split","dividend"].includes(a.type)||typeof a.sourceReference!=="string"||
    a.sourceReference.length<4||!Number.isFinite(a.factor)||a.factor<=0||
    (a.type==="dividend"&&(!Number.isFinite(a.cashAmount)||a.cashAmount<0)))
    throw Error("Invalid corporate action evidence");
  if(policy.assetClass!=="equity")throw Error("Corporate actions forbidden for asset class");
  last=a.effectiveAt;
 }
 return Object.freeze({version:VERSION,sessionCount:sessions.length,actionCount:evidence.corporateActions.length,
  marketTimezone:evidence.marketTimezone,sourceReference:evidence.sourceReference,evidenceSha256:hash(evidence)});
}
module.exports=Object.freeze({VERSION,validate});
