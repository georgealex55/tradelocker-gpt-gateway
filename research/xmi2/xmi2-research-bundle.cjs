/* XMI 2.0 signed, reproducible local research artifacts. No network or execution. */
"use strict";
const crypto=require("node:crypto");
const walkEngine=require("./xmi2-forward-walk.cjs");
const VERSION="xmi-offline-research-bundle/v1";
const HASH=/^[a-f0-9]{64}$/;
const FILES=Object.freeze(["dataset","registry","blindReviews","freezeReceipt","trustedFreezeKey",
 "thirdDecisions","trustedSigners","historicalIntake","historicalQuality","sessionEvidence"]);
const digest=bytes=>crypto.createHash("sha256").update(bytes).digest("hex");
function canonical(value){
 if(value===null||typeof value==="string"||typeof value==="boolean")return JSON.stringify(value);
 if(typeof value==="number"&&Number.isFinite(value))return JSON.stringify(value);
 if(Array.isArray(value))return "["+value.map(canonical).join(",")+"]";
 if(value&&typeof value==="object"&&Object.getPrototypeOf(value)===Object.prototype){
  return "{"+Object.keys(value).sort().map(k=>JSON.stringify(k)+":"+canonical(value[k])).join(",")+"}";
 }
 throw Error("Non-JSON research artifact rejected");
}
const bytes=value=>Buffer.from(canonical(value),"utf8");
function validateInputs(inputs){
 if(!Array.isArray(inputs)||inputs.length!==FILES.length||
   inputs.some(b=>!Buffer.isBuffer(b)||b.length>2*1024*1024))
  throw Error("Exactly ten bounded local historical evidence files required");
}
function requirePem(publicPem){
 if(typeof publicPem!=="string"||publicPem.length>4096)throw Error("Pinned Ed25519 public key required");
 const key=crypto.createPublicKey(publicPem);
 if(key.asymmetricKeyType!=="ed25519"||key.export({type:"spki",format:"pem"})!==publicPem)
  throw Error("Pinned Ed25519 public key required");
 return key;
}
function payloadFor(inputs,plan,preregistrationReceipt,trustedPreregPem,checkpointSha256,walk){
 validateInputs(inputs);
 if(typeof trustedPreregPem!=="string"||!HASH.test(checkpointSha256||""))throw Error("Pinned preregistration trust required");
 const report=walkEngine.evaluate(inputs,plan,preregistrationReceipt,trustedPreregPem,checkpointSha256,walk);
 return {version:VERSION,mode:"offline-research-only",
  evidenceSha256:Object.fromEntries(FILES.map((name,i)=>[name,digest(inputs[i])])),
  plan,walk,preregistrationReceipt,preregistrationCheckpointSha256:checkpointSha256,
  trustedPreregistrationKeySha256:digest(Buffer.from(trustedPreregPem)),
  report,reportSha256:digest(bytes(report)),
  limitations:["No embedded raw historical candle prices or private signing keys.",
   "Reports are descriptive research, not orders, profitability or predictive validity.",
   "Signed preregistration times are self-declared; independent checkpoint retention must be established externally."]};
}
function create(inputs,plan,preregistrationReceipt,trustedPreregPem,checkpointSha256,walk,privateKey){
 if(!privateKey||privateKey.asymmetricKeyType!=="ed25519")throw Error("Ed25519 private signing key required");
 const signerPublicKeyPem=crypto.createPublicKey(privateKey).export({type:"spki",format:"pem"});
 const payload=payloadFor(inputs,plan,preregistrationReceipt,trustedPreregPem,checkpointSha256,walk);
 const signature=crypto.sign(null,bytes(payload),privateKey).toString("base64");
 return {version:VERSION,signerPublicKeyPem,payload,signature};
}
function verify(inputs,bundle,trustedBundlePem,trustedPreregPem,checkpointSha256){
 validateInputs(inputs);
 const key=requirePem(trustedBundlePem);
 requirePem(trustedPreregPem);
 if(!bundle||bundle.version!==VERSION||bundle.signerPublicKeyPem!==trustedBundlePem||
    !bundle.payload||bundle.payload.version!==VERSION||bundle.payload.mode!=="offline-research-only"||
    typeof bundle.signature!=="string"||!/^[-A-Za-z0-9+/=]{88}$/.test(bundle.signature)||
    typeof bundle.payload.trustedPreregistrationKeySha256!=="string"||
    bundle.payload.trustedPreregistrationKeySha256!==digest(Buffer.from(trustedPreregPem))||
    bundle.payload.preregistrationCheckpointSha256!==checkpointSha256)
  throw Error("Research bundle trust or format mismatch");
 const signature=Buffer.from(bundle.signature,"base64");
 if(signature.length!==64||signature.toString("base64")!==bundle.signature||
    !crypto.verify(null,bytes(bundle.payload),key,signature))
  throw Error("Research bundle signature invalid");
 const actual=payloadFor(inputs,bundle.payload.plan,bundle.payload.preregistrationReceipt,
  trustedPreregPem,checkpointSha256,bundle.payload.walk);
 if(canonical(actual)!==canonical(bundle.payload))throw Error("Research bundle cannot be reproduced");
 return Object.freeze({version:VERSION,verified:true,bundleSha256:digest(bytes(bundle)),
  reportSha256:actual.reportSha256,signerKeySha256:digest(Buffer.from(trustedBundlePem)),
  preregistrationCheckpointSha256:checkpointSha256});
}
module.exports=Object.freeze({VERSION,FILES,create,verify,canonical,digest});
