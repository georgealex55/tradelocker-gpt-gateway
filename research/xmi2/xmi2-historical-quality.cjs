/* Pure historical OHLC quality gate. No downloads, resampling or execution. */
"use strict";
const VERSION="xmi-historical-quality/v1";
function inspect(dataset,registry,policy,evidence){
 if(!dataset||!Array.isArray(dataset.bars)||dataset.bars.length<2||dataset.bars.length>5000||
  !registry||!Array.isArray(registry.partitions)||!policy||policy.version!==VERSION||
  policy.timezone!=="UTC"||!["raw-unadjusted","synthetic-no-actions","adjusted-with-provenance"].includes(policy.adjustmentBasis)||
  !["forex","equity","synthetic"].includes(policy.assetClass)||
  policy.allowUnscheduledGaps!==false)throw Error("Historical quality policy invalid");
 if(policy.assetClass==="equity"&&policy.adjustmentBasis==="synthetic-no-actions")throw Error("Historical equity adjustment policy invalid");
 if(policy.adjustmentBasis==="adjusted-with-provenance"&&
  (typeof policy.corporateActionReference!=="string"||policy.corporateActionReference.length<5||
   policy.corporateActionReviewed!==true))throw Error("Historical adjustment provenance missing");
 if(policy.assetClass==="equity"&&policy.adjustmentBasis==="raw-unadjusted"&&policy.corporateActionReviewed!==true)
  throw Error("Historical equity corporate-action review required");
 if(policy.assetClass==="synthetic"&&policy.adjustmentBasis!=="synthetic-no-actions")throw Error("Synthetic adjustment policy mismatch");
 const b=dataset.bars,errors=[],gapSegments=[];let prev=null;
 if(evidence!==undefined){
  if(!evidence||evidence.version!=="xmi-session-evidence/v1"||evidence.datasetId!==registry.datasetId||
    evidence.reviewerApproved!==true||!Array.isArray(evidence.sessions))throw Error("Historical session evidence required");
 }
 for(let i=0;i<b.length;i++){
  const c=b[i];
  if(!c||!Number.isSafeInteger(c.time)||c.time<=0||c.closed!==true||
    ![c.open,c.high,c.low,c.close].every(x=>Number.isFinite(x)&&x>0)||
    c.low>Math.min(c.open,c.close)||c.high<Math.max(c.open,c.close))errors.push("invalid-ohlc");
  if(prev&&c.time<=prev.time)errors.push(c.time===prev.time?"duplicate-time":"unordered-time");
  prev=c;
 }
 for(const p of registry.partitions){
  const relevant=b.filter(c=>c.time>=p.start&&c.time<p.end);
  const step=p.barSeconds;
  if(!Number.isSafeInteger(step)||step<=0||!Number.isSafeInteger(p.start)||!Number.isSafeInteger(p.end))
   throw Error("Historical partition step invalid");
  for(const c of relevant)if((c.time-p.start)%step!==0)errors.push("unaligned-time");
  if(relevant.length<2)errors.push("insufficient-partition-data");
  if(evidence){
   const schedule=new Set();
   for(const session of evidence.sessions){
    if(!session||!Number.isSafeInteger(session.open)||!Number.isSafeInteger(session.close)||
      session.open<1||session.close<=session.open||!["regular","shortened"].includes(session.kind))
      throw Error("Historical session evidence invalid");
    for(let t=Math.max(p.start,session.open);t+step<=Math.min(p.end,session.close);t+=step)
     if((t-p.start)%step===0)schedule.add(t);
   }
   const observed=new Set(relevant.map(c=>c.time));
   for(const t of schedule)if(!observed.has(t))errors.push("missing-scheduled-bar");
   for(const t of observed)if(!schedule.has(t))errors.push("unscheduled-bar");
  }else if(relevant.length){
   if(relevant[0].time!==p.start)gapSegments.push({partitionId:p.id,from:p.start,to:relevant[0].time,missingBars:(relevant[0].time-p.start)/step});
   for(let i=1;i<relevant.length;i++){
    const delta=relevant[i].time-relevant[i-1].time;
    if(delta>step)gapSegments.push({partitionId:p.id,from:relevant[i-1].time+step,to:relevant[i].time,missingBars:delta/step-1});
   }
   const final=relevant.at(-1).time+step;
   if(final<p.end)gapSegments.push({partitionId:p.id,from:final,to:p.end,missingBars:(p.end-final)/step});
  }
 }
 if(gapSegments.length)errors.push("missing-partition-bars");
 if(errors.length)throw Error("Historical quality rejected: "+[...new Set(errors)].join(","));
 return Object.freeze({version:VERSION,timezone:"UTC",assetClass:policy.assetClass,adjustmentBasis:policy.adjustmentBasis,
  verifiedBars:b.length,checkedPartitions:registry.partitions.length,gapCount:0,duplicateCount:0});
}
module.exports=Object.freeze({VERSION,inspect});
