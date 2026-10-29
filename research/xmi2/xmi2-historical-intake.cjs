/* Local-only dataset provenance gate; assertions do not prove external data rights. */
"use strict";
const crypto=require("node:crypto");
const VERSION="xmi-historical-intake/v1",ID=/^[A-Za-z0-9_-]{1,64}$/;
const sha=b=>crypto.createHash("sha256").update(b).digest("hex");
function check(bytes,manifest,registry){
 if(!Buffer.isBuffer(bytes)||bytes.length>2*1024*1024||!manifest||manifest.version!==VERSION||
  manifest.datasetId!==registry.datasetId||!ID.test(manifest.datasetId||"")||
  manifest.dataSha256!==sha(bytes)||manifest.dataSha256!==registry.dataSha256)throw Error("Historical intake identity/hash mismatch");
 if(!["licensed-research","owner-created-synthetic"].includes(manifest.basis)||
  manifest.permittedUse!=="offline-historical-research"||manifest.networkFetchAllowed!==false||
  manifest.brokerExecutionAllowed!==false||manifest.redistributionAllowed!==false)throw Error("Historical intake use restrictions not approved");
 if(typeof manifest.sourceName!=="string"||manifest.sourceName.trim().length<3||manifest.sourceName.length>120||
   typeof manifest.sourceReference!=="string"||manifest.sourceReference.trim().length<4||manifest.sourceReference.length>300||
   typeof manifest.licenseReference!=="string"||manifest.licenseReference.trim().length<4||manifest.licenseReference.length>300||
   !ID.test(manifest.approvedBy||"")||
   typeof manifest.approvedAt!=="string"||!Number.isFinite(Date.parse(manifest.approvedAt))||
   !/(Z|[+-]\d\d:\d\d)$/.test(manifest.approvedAt))throw Error("Historical intake provenance incomplete");
 if(manifest.basis==="licensed-research"&&manifest.rightsReviewed!==true)throw Error("Historical license review required");
 if(manifest.basis==="owner-created-synthetic"&&manifest.rightsReviewed!==true)throw Error("Historical synthetic provenance review required");
 if(Date.parse(manifest.approvedAt)>Date.parse(registry.frozenAt))throw Error("Historical rights approval after dataset freeze");
 const dataset=JSON.parse(bytes.toString("utf8"));
 if(dataset.version!=="xmi-historical-bars/v1"||dataset.datasetId!==manifest.datasetId||
   !Array.isArray(dataset.bars)||dataset.bars.length<2||dataset.bars.length>5000)throw Error("Historical intake invalid bars");
 let previous=0;
 for(const b of dataset.bars){
  if(!b||b.closed!==true||!Number.isSafeInteger(b.time)||b.time<=previous||
    ![b.open,b.high,b.low,b.close].every(x=>Number.isFinite(x)&&x>0)||
    b.high<Math.max(b.open,b.close)||b.low>Math.min(b.open,b.close))throw Error("Historical intake candle invalid");
  previous=b.time;
 }
 return Object.freeze({basis:manifest.basis,sourceName:manifest.sourceName,
  licenseReference:manifest.licenseReference,approvedBy:manifest.approvedBy,manifestSha256:sha(Buffer.from(JSON.stringify(manifest)))});
}
module.exports=Object.freeze({VERSION,check});
