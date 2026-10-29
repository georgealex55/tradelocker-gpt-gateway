/* Offline human review receipts and controlled resubmission. No persistence or bypass. */
"use strict";
const crypto=require("node:crypto");
const quarantine=require("./xmi2-quarantine.cjs");
const VERSION="xmi-quarantine-review/v1";
const digest=b=>crypto.createHash("sha256").update(b).digest("hex");
const canonical=o=>JSON.stringify(o,Object.keys(o).sort());
function receipt(report,{reviewerId,reviewedAt,decision,note}){
 if(!report||report.version!==quarantine.VERSION||report.status!=="quarantined"||
  !report.inputSha256||Object.keys(report.inputSha256).length!==10||
  !Array.isArray(report.findings)||!report.findings.some(x=>x.code==="ADMISSION_REJECTED"))
  throw Error("Valid quarantined diagnostic required");
 if(typeof reviewerId!=="string"||!/^[a-zA-Z0-9_-]{1,48}$/.test(reviewerId)||
  !["reject","request-correction"].includes(decision)||
  typeof reviewedAt!=="string"||!Number.isFinite(Date.parse(reviewedAt))||
  !/(Z|[+-]\d\d:\d\d)$/.test(reviewedAt)||
  typeof note!=="string"||note.trim().length<5||note.length>500)
  throw Error("Invalid human review declaration");
 const target=Object.keys(report.inputSha256).sort().map(k=>[k,report.inputSha256[k]]);
 if(target.some(([k,h])=>!/^[a-f0-9]{64}$/.test(h)))throw Error("Invalid evidence digest");
 const reportSha256=digest(Buffer.from(JSON.stringify(report)));
 const core={version:VERSION,reviewerId,reviewedAt,decision,note,reportSha256,inputSha256:{...report.inputSha256}};
 return Object.freeze({...core,receiptSha256:digest(Buffer.from(JSON.stringify(core)))});
}
function resubmit(previousInputs,updatedInputs,review,originalReport,evaluate,signedChain,trustedReviewKeys){
 const signed=require("./xmi2-signed-review-chain.cjs");
 const verified=signed.verify(signedChain,trustedReviewKeys);
 if(!verified.verified||JSON.stringify(signedChain.at(-1).payload.receipt)!==JSON.stringify(review))
  throw Error("Signed operator receipt does not match resubmission");
 if(!Array.isArray(previousInputs)||previousInputs.length!==10||
  !Array.isArray(updatedInputs)||updatedInputs.length!==10||
  [...previousInputs,...updatedInputs].some(b=>!Buffer.isBuffer(b)||b.length>2*1024*1024))
  throw Error("Ten bounded local input files required");
 const previous=quarantine.inspect(previousInputs,evaluate);
 if(previous.status!=="quarantined"||!originalReport||JSON.stringify(previous)!==JSON.stringify(originalReport))
  throw Error("Original quarantine report changed");
 const required=receipt(originalReport,review);
 if(!review||review.version!==VERSION||review.decision!=="request-correction"||
  JSON.stringify(review)!==JSON.stringify(required))throw Error("Human correction review receipt invalid");
 const before=previousInputs.map(digest),after=updatedInputs.map(digest);
 const changed=before.map((h,i)=>h===after[i]?null:i).filter(x=>x!==null);
 if(!changed.length)throw Error("Unchanged evidence cannot be resubmitted");
 const next=quarantine.inspect(updatedInputs,evaluate);
 return Object.freeze({version:VERSION,previousReportSha256:review.reportSha256,
  reviewDigest:digest(Buffer.from(JSON.stringify(review))),changedInputIndices:changed,
  result:next.status,followupReport:next,
  note:"Resubmission rechecks every existing admission gate; no approvals override rejection."});
}
module.exports=Object.freeze({VERSION,receipt,resubmit});
