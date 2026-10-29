/* Offline sealed candidate comparison; never ranks, tunes, or selects using holdout. */
"use strict";
const crypto=require("node:crypto"),lab=require("./xmi2-strategy-lab.cjs");
const prereg=require("./xmi2-candidate-preregistration.cjs");
const VERSION="xmi-strategy-comparison/v1",HASH=/^[a-f0-9]{64}$/;
const sha=b=>crypto.createHash("sha256").update(b).digest("hex");
function compare(inputs,plan,receipt,trustedPublicPem,checkpointSha256){
 if(!Array.isArray(inputs)||inputs.length!==10||inputs.some(b=>!Buffer.isBuffer(b)))throw Error("Ten local evidence inputs required");
 if(!plan||plan.version!==VERSION||plan.frozen!==true||!Array.isArray(plan.candidates)||
  plan.candidates.length<1||plan.candidates.length>8||
  plan.selectionPartition!=="train"||plan.holdoutPolicy!=="report-only"||
  plan.allowAdaptiveSearch!==false||plan.maxCandidates!==plan.candidates.length||
  !Number.isSafeInteger(plan.holdoutEvaluations)||plan.holdoutEvaluations!==1||
  !HASH.test(plan.candidateSetSha256||""))throw Error("Sealed comparison plan required");
 const canonical=JSON.stringify(plan.candidates);
 if(sha(Buffer.from(canonical))!==plan.candidateSetSha256)throw Error("Candidate set changed after freeze");
 const verified=prereg.verify(plan,inputs[1],receipt,trustedPublicPem,checkpointSha256);
 const ids=new Set(),results=[];
 for(const candidate of plan.candidates){
  if(!candidate||ids.has(candidate.id))throw Error("Duplicate or invalid candidate");
  ids.add(candidate.id);
  const report=lab.replay(inputs,candidate);
  const train=report.results.filter(p=>p.split==="train"),holdout=report.results.filter(p=>p.split==="holdout");
  if(!train.length||!holdout.length)throw Error("Chronological train/holdout partitions required");
  const trainSignals=train.reduce((n,p)=>n+p.signalCount,0);
  results.push({id:candidate.id,strategySha256:report.strategySha256,trainSignalCount:trainSignals,
   holdoutSignalCount:holdout.reduce((n,p)=>n+p.signalCount,0),trainObservations:train.reduce((n,p)=>n+p.observations,0),
   holdoutObservations:holdout.reduce((n,p)=>n+p.observations,0)});
 }
 // Pre-declared deterministic descriptive ordering, not optimization.
 const trainingOrder=results.map(({id,trainSignalCount})=>({id,trainSignalCount}))
  .sort((a,b)=>a.trainSignalCount-b.trainSignalCount||a.id.localeCompare(b.id));
 return {version:VERSION,mode:"offline-research-only",planSha256:sha(Buffer.from(JSON.stringify(plan))),
  preregistration:verified,
  candidateCount:results.length,multipleTesting:{candidateCount:results.length,holdoutEvaluations:1,
   warning:"Multiple candidates increase selection bias; no corrected statistical significance or performance estimate."},
  trainingOrder,results,limitations:["Holdout is descriptive only and must not guide candidate selection or revisions.",
  "Signals are not profitability or predictive measures. No live feeds, fills, trades or orders.",
  "No multiple-testing adjusted p-values are computed."]};
}
module.exports=Object.freeze({VERSION,compare});
