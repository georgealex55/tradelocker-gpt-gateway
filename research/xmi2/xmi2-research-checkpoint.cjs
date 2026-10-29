/* Offline signed checkpoint chain for reproducible historical research. No remote anchoring. */
"use strict";
const crypto=require("node:crypto");
const research=require("./xmi2-research-bundle.cjs");
const VERSION="xmi-research-checkpoint/v1",GENESIS="0".repeat(64);
const HASH=/^[a-f0-9]{64}$/;
const digest=value=>research.digest(Buffer.from(research.canonical(value),"utf8"));
function trustedKey(pem){
 if(typeof pem!=="string"||pem.length>4096)throw Error("Separately pinned Ed25519 witness key required");
 const key=crypto.createPublicKey(pem);
 if(key.asymmetricKeyType!=="ed25519"||key.export({type:"spki",format:"pem"})!==pem)
  throw Error("Separately pinned Ed25519 witness key required");
 return key;
}
function validTime(value){
 return typeof value==="string"&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(value)&&
  Number.isFinite(Date.parse(value))&&new Date(value).toISOString()===value.replace("Z",".000Z");
}
function seal(inputs,bundle,trustedBundlePem,trustedPreregPem,preregCheckpoint,witnessPrivateKey,previousHead,sequence,declaredAt){
 if(!HASH.test(previousHead||"")||!Number.isSafeInteger(sequence)||sequence<1||sequence>1000000||
  !validTime(declaredAt)||!witnessPrivateKey||witnessPrivateKey.asymmetricKeyType!=="ed25519")
  throw Error("Invalid checkpoint sequence, head, time or signing key");
 // An invalid, unsigned or nonreproducible research bundle is never checkpointed.
 const verified=research.verify(inputs,bundle,trustedBundlePem,trustedPreregPem,preregCheckpoint);
 const publicKeyPem=crypto.createPublicKey(witnessPrivateKey).export({type:"spki",format:"pem"});
 const payload={version:VERSION,sequence,previousHead,declaredAt,
  bundleSha256:verified.bundleSha256,reportSha256:verified.reportSha256,
  bundleSignerKeySha256:verified.signerKeySha256,
  preregistrationCheckpointSha256:verified.preregistrationCheckpointSha256,
  witnessKeySha256:research.digest(Buffer.from(publicKeyPem))};
 const signature=crypto.sign(null,Buffer.from(research.canonical(payload)),witnessPrivateKey).toString("base64");
 return {payload,witnessPublicKeyPem:publicKeyPem,signature};
}
function verifyChain(chain,trustedWitnessPem,anchorHead,anchorSequence,expectedHead){
 const key=trustedKey(trustedWitnessPem);
 if(!Array.isArray(chain)||!chain.length||chain.length>128||!HASH.test(anchorHead||"")||
  !HASH.test(expectedHead||"")||!Number.isSafeInteger(anchorSequence)||anchorSequence<0||
  anchorSequence>1000000||anchorSequence+chain.length>1000000)
  throw Error("Independent checkpoint anchors and bounded chain required");
 let head=anchorHead;
 const seen=new Set();
 for(let i=0;i<chain.length;i++){
  const link=chain[i];
  const p=link&&link.payload;
  if(!p||p.version!==VERSION||p.sequence!==anchorSequence+i+1||p.previousHead!==head||
    !validTime(p.declaredAt)||!HASH.test(p.bundleSha256||"")||
    !HASH.test(p.reportSha256||"")||!HASH.test(p.bundleSignerKeySha256||"")||
    !HASH.test(p.preregistrationCheckpointSha256||"")||
    p.witnessKeySha256!==research.digest(Buffer.from(trustedWitnessPem))||
    link.witnessPublicKeyPem!==trustedWitnessPem||
    typeof link.signature!=="string"||!/^[A-Za-z0-9+/]{86}==$/.test(link.signature))
   throw Error("Checkpoint chain broken, untrusted, or malformed");
  const sig=Buffer.from(link.signature,"base64");
  if(sig.length!==64||sig.toString("base64")!==link.signature||
   !crypto.verify(null,Buffer.from(research.canonical(p)),key,sig))
   throw Error("Checkpoint signature invalid");
  if(seen.has(p.bundleSha256))throw Error("Duplicate checkpointed research bundle");
  seen.add(p.bundleSha256);
  head=digest(link);
 }
 if(head!==expectedHead)throw Error("Independently pinned terminal checkpoint does not match");
 return Object.freeze({version:VERSION,verifiedCount:chain.length,anchorHead,anchorSequence,
  terminalHead:head,terminalSequence:anchorSequence+chain.length});
}
function verifyAnchoredBundle(inputs,bundle,trustedBundlePem,trustedPreregPem,preregCheckpoint,
 chain,trustedWitnessPem,anchorHead,anchorSequence,expectedHead){
 const result=verifyChain(chain,trustedWitnessPem,anchorHead,anchorSequence,expectedHead);
 const verified=research.verify(inputs,bundle,trustedBundlePem,trustedPreregPem,preregCheckpoint);
 const last=chain.at(-1).payload;
 if(last.bundleSha256!==verified.bundleSha256||last.reportSha256!==verified.reportSha256||
  last.bundleSignerKeySha256!==verified.signerKeySha256||
  last.preregistrationCheckpointSha256!==verified.preregistrationCheckpointSha256)
  throw Error("Pinned checkpoint does not describe independently reproduced research bundle");
 return Object.freeze({...result,reproducedBundleSha256:verified.bundleSha256,
  reproducedReportSha256:verified.reportSha256});
}
module.exports=Object.freeze({VERSION,GENESIS,digest,seal,verifyChain,verifyAnchoredBundle});
