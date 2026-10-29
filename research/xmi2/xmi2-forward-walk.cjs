/* Frozen chronological forward-walk gate; no network, training or execution. */
"use strict";
const crypto=require("node:crypto"),protocol=require("./xmi2-blind-protocol.js");
const compare=require("./xmi2-strategy-comparison.cjs");
const VERSION="xmi-forward-walk/v1";
const sha=b=>crypto.createHash("sha256").update(b).digest("hex");
function evaluate(inputs,plan,receipt,trustedPem,checkpoint,walk){
 if(!Array.isArray(inputs)||inputs.length!==10||inputs.some(x=>!Buffer.isBuffer(x)))
  throw Error("Ten local historical evidence files required");
 const registry=protocol.validate(JSON.parse(inputs[1].toString("utf8")));
 if(!walk||walk.version!==VERSION||walk.frozen!==true||
  walk.partitionRegistrySha256!==sha(inputs[1])||walk.trainOnlySelection!==true||
  walk.holdoutReportOnly!==true||walk.allowRefitOnHoldout!==false)
  throw Error("Frozen forward-walk specification required");
 const parts=registry.partitions,windows=[];let prior=null;
 for(const p of parts){
  if(prior){
   const required=(prior.embargoBars+p.embargoBars)*p.barSeconds;
   const actual=p.start-prior.end;
   if(actual<required)throw Error("Forward-walk embargo violation");
   windows.push({before:prior.id,after:p.id,requiredSeconds:required,actualSeconds:actual});
  }
  prior=p;
 }
 const result=compare.compare(inputs,plan,receipt,trustedPem,checkpoint);
 return {version:VERSION,mode:"offline-research-only",walkSha256:sha(Buffer.from(JSON.stringify(walk))),
  registrySha256:sha(inputs[1]),windows,comparison:result,
  limitations:["No holdout refitting or candidate selection.","Chronological intervals and embargo are audited, not traded."]};
}
module.exports=Object.freeze({VERSION,evaluate});
