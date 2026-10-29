/* Local signed review chain. Root trust key must be pinned independently of chain. */
"use strict";
const crypto=require("node:crypto"),review=require("./xmi2-quarantine-review.cjs");
const VERSION="xmi-signed-review-chain/v1",ZERO="0".repeat(64);
function stable(x){if(Array.isArray(x))return "["+x.map(stable).join(",")+"]";
 if(x&&typeof x==="object")return "{"+Object.keys(x).sort().map(k=>JSON.stringify(k)+":"+stable(x[k])).join(",")+"}";
 return JSON.stringify(x);}
const sha=x=>crypto.createHash("sha256").update(Buffer.from(stable(x))).digest("hex");
function assertKey(k){if(!k||k.asymmetricKeyType!=="ed25519")throw Error("Ed25519 review key required");}
function sign(entry,privateKey,publicKey,previousSha256=ZERO){
 assertKey(privateKey);assertKey(publicKey);
 if(!/^[a-f0-9]{64}$/.test(previousSha256))throw Error("Invalid prior review digest");
 if(!entry||entry.version!==review.VERSION||!/^[a-f0-9]{64}$/.test(entry.receiptSha256))throw Error("Invalid review receipt");
 const publicKeyPem=publicKey.export({type:"spki",format:"pem"});
 const payload={version:VERSION,receipt:entry,previousSha256,reviewerKeySha256:crypto.createHash("sha256").update(publicKeyPem).digest("hex")};
 return {payload,publicKeyPem,signature:crypto.sign(null,Buffer.from(stable(payload)),privateKey).toString("base64")};
}
function verify(chain,trustedKeys,firstPriorSha256=ZERO){
 if(!Array.isArray(chain)||!chain.length||chain.length>1000||!Array.isArray(trustedKeys)||!trustedKeys.length||trustedKeys.length>64||
  !/^[a-f0-9]{64}$/.test(firstPriorSha256))throw Error("Invalid review chain or trust anchors");
 const trusted=new Set(trustedKeys.map(pem=>{
  const k=crypto.createPublicKey(pem);assertKey(k);
  if(k.export({type:"spki",format:"pem"})!==pem)throw Error("Noncanonical trusted review key");
  return pem;
 }));
 let previous=firstPriorSha256;
 for(const link of chain){
  if(!link||!link.payload||link.payload.version!==VERSION||link.payload.previousSha256!==previous||
    !trusted.has(link.publicKeyPem)||typeof link.signature!=="string")throw Error("Untrusted or broken review chain");
  const {receipt:r,reviewerKeySha256}=link.payload;
  if(!r||!/^([a-f0-9]{64})$/.test(r.receiptSha256)||r.version!==review.VERSION)throw Error("Bad review receipt");
  const core={version:r.version,reviewerId:r.reviewerId,reviewedAt:r.reviewedAt,decision:r.decision,note:r.note,
    reportSha256:r.reportSha256,inputSha256:r.inputSha256};
  if(crypto.createHash("sha256").update(JSON.stringify(core)).digest("hex")!==r.receiptSha256)throw Error("Altered review receipt");
  if(reviewerKeySha256!==crypto.createHash("sha256").update(link.publicKeyPem).digest("hex"))throw Error("Review key fingerprint mismatch");
  assertKey(crypto.createPublicKey(link.publicKeyPem));
  if(!crypto.verify(null,Buffer.from(stable(link.payload)),link.publicKeyPem,Buffer.from(link.signature,"base64")))
   throw Error("Invalid reviewer signature");
  previous=sha(link);
 }
 return {version:VERSION,verified:chain.length,chainHeadSha256:previous};
}
module.exports=Object.freeze({VERSION,ZERO,sha,sign,verify});
