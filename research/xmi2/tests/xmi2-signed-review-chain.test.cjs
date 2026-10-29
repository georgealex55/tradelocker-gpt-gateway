const test=require("node:test"),assert=require("node:assert/strict"),crypto=require("node:crypto");
const q=require("../xmi2-quarantine.cjs"),review=require("../xmi2-quarantine-review.cjs"),chain=require("../xmi2-signed-review-chain.cjs");
const inputs=()=>Array.from({length:10},(_,i)=>Buffer.from(JSON.stringify({id:i})));
const evaluate=()=>{throw Error("blocked");};
function fixture(){
 const keys=crypto.generateKeyPairSync("ed25519"),pem=keys.publicKey.export({type:"spki",format:"pem"});
 const report=q.inspect(inputs(),evaluate),decision=review.receipt(report,{
  reviewerId:"reviewer_1",reviewedAt:"2026-10-28T22:00:00Z",decision:"request-correction",note:"Fix source input"});
 return {keys,pem,decision};
}
test("Independent Ed25519 public-key pin verifies signed operator review",()=>{
 const f=fixture(),signed=chain.sign(f.decision,f.keys.privateKey,f.keys.publicKey);
 const verified=chain.verify([signed],[f.pem]);
 assert.equal(verified.verified,1);assert.equal(verified.chainHeadSha256.length,64);
 assert.throws(()=>chain.verify([signed],[crypto.generateKeyPairSync("ed25519").publicKey.export({type:"spki",format:"pem"})]),/Untrusted/);
 const corrupt=structuredClone(signed);corrupt.payload.receipt.note="Edited note";
 assert.throws(()=>chain.verify([corrupt],[f.pem]),/Altered review receipt/);
});
test("Chain integrity refuses reordered, deleted and forged review entries",()=>{
 const f=fixture(),first=chain.sign(f.decision,f.keys.privateKey,f.keys.publicKey);
 const next=review.receipt(q.inspect(inputs(),evaluate),{
  reviewerId:"reviewer_2",reviewedAt:"2026-10-28T23:00:00Z",decision:"reject",note:"Still rejected"});
 const second=chain.sign(next,f.keys.privateKey,f.keys.publicKey,chain.sha(first));
 assert.equal(chain.verify([first,second],[f.pem]).verified,2);
 assert.throws(()=>chain.verify([second,first],[f.pem]),/broken/);
 assert.throws(()=>chain.verify([second],[f.pem]),/broken/);
 assert.throws(()=>chain.verify([first],[f.pem],chain.sha(first)),/broken/);
 const bad=structuredClone(second);bad.signature=Buffer.alloc(64).toString("base64");
 assert.throws(()=>chain.verify([first,bad],[f.pem]),/signature/);
});
test("Review signing remains offline with no broker, network or database dependency",()=>{
 const fs=require("node:fs"),src=fs.readFileSync(require.resolve("../xmi2-signed-review-chain.cjs"),"utf8");
 for(const token of ["fetch(","WebSocket","placeOrder","writeFile","DATABASE_URL","/api/"])assert.equal(src.includes(token),false);
});
