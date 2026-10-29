/* Offline Ed25519 preregistration; external checkpoint digest must be pinned separately. */
"use strict";
const crypto=require("node:crypto");
const VERSION="xmi-candidate-preregistration/v1";
const sha=x=>crypto.createHash("sha256").update(x).digest("hex");
function commit(plan,registrySha256,privateKey,publicKey,declaredAt){
 if(!plan||typeof registrySha256!=="string"||!/^[a-f0-9]{64}$/.test(registrySha256)||
  !privateKey||privateKey.asymmetricKeyType!=="ed25519"||
  !publicKey||publicKey.asymmetricKeyType!=="ed25519"||
  typeof declaredAt!=="string"||!Number.isFinite(Date.parse(declaredAt)))throw Error("Invalid candidate preregistration");
 const pem=publicKey.export({type:"spki",format:"pem"});
 const payload={version:VERSION,planSha256:sha(Buffer.from(JSON.stringify(plan))),
  registrySha256,declaredAt,signerKeySha256:sha(Buffer.from(pem))};
 const signature=crypto.sign(null,Buffer.from(JSON.stringify(payload)),privateKey).toString("base64");
 return {payload,publicKeyPem:pem,signature};
}
function verify(plan,registryBytes,receipt,trustedPublicPem,pinnedCheckpointSha256){
 if(!receipt||!receipt.payload||typeof trustedPublicPem!=="string"||
  receipt.publicKeyPem!==trustedPublicPem||typeof receipt.signature!=="string"||
  typeof pinnedCheckpointSha256!=="string"||!/^[a-f0-9]{64}$/.test(pinnedCheckpointSha256))
  throw Error("Trusted preregistration evidence required");
 if(receipt.payload.version!==VERSION||
  receipt.payload.planSha256!==sha(Buffer.from(JSON.stringify(plan)))||
  receipt.payload.registrySha256!==sha(registryBytes)||
  receipt.payload.signerKeySha256!==sha(Buffer.from(trustedPublicPem))||
  !Number.isFinite(Date.parse(receipt.payload.declaredAt)))throw Error("Candidate preregistration mismatch");
 const key=crypto.createPublicKey(trustedPublicPem);
 if(key.asymmetricKeyType!=="ed25519"||
  !crypto.verify(null,Buffer.from(JSON.stringify(receipt.payload)),key,Buffer.from(receipt.signature,"base64")))
  throw Error("Candidate preregistration signature invalid");
 const checkpoint=sha(Buffer.from(JSON.stringify(receipt)));
 if(checkpoint!==pinnedCheckpointSha256)throw Error("Candidate external checkpoint mismatch");
 return {checkpointSha256:checkpoint,signerKeySha256:receipt.payload.signerKeySha256,declaredAt:receipt.payload.declaredAt};
}
module.exports=Object.freeze({VERSION,commit,verify,sha});
