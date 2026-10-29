/* Local-only cryptographic freeze receipts and independent third reviewer adjudication. */
"use strict";
const crypto=require("node:crypto"),protocol=require("./xmi2-blind-protocol.js");
const VERSION="xmi-freeze-receipt/v1",DECISION="xmi-adjudication/v1";
function stable(x){if(Array.isArray(x))return "["+x.map(stable).join(",")+"]";if(x&&typeof x==="object")return "{"+Object.keys(x).sort().map(k=>JSON.stringify(k)+":"+stable(x[k])).join(",")+"}";return JSON.stringify(x);}
function sha(x){return crypto.createHash("sha256").update(stable(x)).digest("hex");}
function validKey(key){if(!key||key.asymmetricKeyType!=="ed25519")throw Error("Ed25519 signing key required");}
function createReceipt(registry,privateKey,publicKey,issuedAt){
 const clean=protocol.validate(registry);validKey(privateKey);
 if(typeof issuedAt!=="string"||!Number.isFinite(Date.parse(issuedAt))||!/(Z|[+-]\d{2}:\d{2})$/.test(issuedAt))throw Error("Invalid signed timestamp");
 const publicPem=publicKey.export({type:"spki",format:"pem"});
 const payload={version:VERSION,registrySha256:sha(clean),datasetId:clean.datasetId,dataSha256:clean.dataSha256,
  frozenAt:clean.frozenAt,issuedAt,publicKeySha256:crypto.createHash("sha256").update(publicPem).digest("hex")};
 return {payload,publicKeyPem:publicPem,signature:crypto.sign(null,Buffer.from(stable(payload)),privateKey).toString("base64")};
}
function verifyReceipt(registry,receipt,expectedPublicKeyPem){
 const clean=protocol.validate(registry);
 if(!receipt||!receipt.payload||typeof receipt.signature!=="string"||typeof receipt.publicKeyPem!=="string"||
  receipt.publicKeyPem!==expectedPublicKeyPem)throw Error("Untrusted freeze receipt key");
 const p=receipt.payload;
 if(p.version!==VERSION||p.registrySha256!==sha(clean)||p.dataSha256!==clean.dataSha256||
  p.datasetId!==clean.datasetId||p.frozenAt!==clean.frozenAt)throw Error("Freeze receipt mismatch");
 if(!Number.isFinite(Date.parse(p.issuedAt))||Date.parse(p.issuedAt)<Date.parse(clean.frozenAt))throw Error("Invalid freeze chronology");
 const pub=crypto.createPublicKey(expectedPublicKeyPem);validKey(pub);
 if(p.publicKeySha256!==crypto.createHash("sha256").update(expectedPublicKeyPem).digest("hex")||
  !crypto.verify(null,Buffer.from(stable(p)),pub,Buffer.from(receipt.signature,"base64")))
  throw Error("Freeze signature invalid");
 return true;
}
function resolve(registry,labels,decisions){
 const original=protocol.adjudicate(registry,labels);
 if(!Array.isArray(decisions)||decisions.length>5000)throw Error("Invalid adjudications");
 const reviews=protocol.validateLabels(registry,labels),known=new Map();
 for(const r of reviews){const key=r.partitionId+"|"+r.pattern+"|"+r.time;
  if(!known.has(key))known.set(key,new Set());known.get(key).add(r.reviewerId);
 }
 const pending=new Map(original.unresolved.map(u=>[u.partitionId+"|"+u.pattern+"|"+u.time,u]));
 const seen=new Set(),accepted=[...original.accepted],resolved=[];
 for(const d of decisions){
  if(!d||!["positive","negative","uncertain"].includes(d.verdict)||typeof d.reviewerId!=="string"||
   !/^[A-Za-z0-9_-]{1,48}$/.test(d.reviewerId)||d.detectorVisible!==false)throw Error("Invalid blind third review");
  const key=d.partitionId+"|"+d.pattern+"|"+d.time;
  if(!pending.has(key)||seen.has(key)||(known.get(key)||new Set()).has(d.reviewerId))throw Error("Invalid adjudication assignment");
  seen.add(key);
  if(d.verdict==="uncertain")continue;
  resolved.push({partitionId:d.partitionId,pattern:d.pattern,time:d.time,verdict:d.verdict,reviewerId:d.reviewerId});
  if(d.verdict==="positive")accepted.push({partitionId:d.partitionId,pattern:d.pattern,time:d.time});
 }
 const unresolved=original.unresolved.filter(u=>!resolved.some(x=>x.partitionId===u.partitionId&&x.pattern===u.pattern&&x.time===u.time));
 return {version:DECISION,accepted,unresolved,resolved,audit:{...original.audit,thirdReviewed:resolved.length,stillUnresolved:unresolved.length}};
}
module.exports=Object.freeze({VERSION,DECISION,stable,sha,createReceipt,verifyReceipt,resolve});
