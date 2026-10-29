/* Local trust registry: pinned Ed25519 keys, explicit rotation and permanent revocation. */
"use strict";
const crypto=require("node:crypto");
const VERSION="xmi-trusted-signers/v1";
function validate(input){
 if(!input||input.version!==VERSION||!Array.isArray(input.signers)||input.signers.length<1||input.signers.length>64)throw Error("Invalid trust registry");
 const ids=new Set(),fingerprints=new Set();
 const signers=input.signers.map(s=>{
  if(!s||typeof s.id!=="string"||!/^[A-Za-z0-9_-]{1,48}$/.test(s.id)||ids.has(s.id)||
   typeof s.publicKeyPem!=="string"||!["active","retired","revoked"].includes(s.status)||
   typeof s.validFrom!=="string"||!Number.isFinite(Date.parse(s.validFrom))||
   typeof s.validUntil!=="string"||!Number.isFinite(Date.parse(s.validUntil))||
   Date.parse(s.validUntil)<=Date.parse(s.validFrom))throw Error("Invalid signer policy");
  const key=crypto.createPublicKey(s.publicKeyPem);
  if(key.asymmetricKeyType!=="ed25519")throw Error("Signer must use Ed25519");
  const canonical=key.export({type:"spki",format:"pem"});
  if(canonical!==s.publicKeyPem)throw Error("Noncanonical signer key");
  const fingerprint=crypto.createHash("sha256").update(canonical).digest("hex");
  if(fingerprints.has(fingerprint))throw Error("Duplicate signer key");
  if(s.status==="revoked"&&(!s.revokedAt||!Number.isFinite(Date.parse(s.revokedAt))))throw Error("Revocation timestamp required");
  if(s.status!=="revoked"&&s.revokedAt!=null)throw Error("Invalid revocation status");
  ids.add(s.id);fingerprints.add(fingerprint);
  return {...s,fingerprint};
 });
 return {version:VERSION,signers};
}
function authorize(input,receipt){
 const registry=validate(input);
 if(!receipt||!receipt.payload||typeof receipt.publicKeyPem!=="string")throw Error("Missing signed receipt");
 const fingerprint=crypto.createHash("sha256").update(receipt.publicKeyPem).digest("hex");
 const signer=registry.signers.find(s=>s.fingerprint===fingerprint);
 if(!signer)throw Error("Signer not trusted by local registry");
 if(signer.status==="revoked")throw Error("Signer revoked");
 const signedAt=Date.parse(receipt.payload.issuedAt);
 if(!Number.isFinite(signedAt)||signedAt<Date.parse(signer.validFrom)||
   signedAt>=Date.parse(signer.validUntil))throw Error("Signature outside trusted key validity");
 if(signer.status==="retired")throw Error("Retired signer disallowed for new benchmark reports");
 return {signerId:signer.id,fingerprint,publicKeyPem:signer.publicKeyPem,status:signer.status};
}
module.exports=Object.freeze({VERSION,validate,authorize});
