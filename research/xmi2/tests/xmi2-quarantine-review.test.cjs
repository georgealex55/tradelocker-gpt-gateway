const test=require("node:test"),assert=require("node:assert/strict");
const q=require("../xmi2-quarantine.cjs"),review=require("../xmi2-quarantine-review.cjs");
const chain=require("../xmi2-signed-review-chain.cjs"),crypto=require("node:crypto");
function checked(old,next,r,report,evaluator){const keys=crypto.generateKeyPairSync("ed25519");
 const signed=chain.sign(r,keys.privateKey,keys.publicKey);
 return review.resubmit(old,next,r,report,evaluator,[signed],[signed.publicKeyPem]);}
const inputs=()=>Array.from({length:10},(_,i)=>Buffer.from(JSON.stringify({id:i})));
const evaluator=(...files)=>{if(files[0].toString()!==JSON.stringify({id:"corrected"}))throw Error("Rejected by full signed gate");return {ok:true};};
function prepare(){const old=inputs(),report=q.inspect(old,evaluator);
 const declaration={reviewerId:"operator_1",reviewedAt:"2026-10-28T22:00:00Z",
  decision:"request-correction",note:"Review rejected historical source and request a new file"};
 return {old,report,declaration,receipt:review.receipt(report,declaration)};}
test("Quarantine human review is tied to original evidence and deterministic",()=>{
 const x=prepare();assert.deepEqual(review.receipt(x.report,x.declaration),x.receipt);
 assert.equal(x.receipt.reportSha256.length,64);
 assert.throws(()=>review.receipt(x.report,{...x.declaration,decision:"approve"}),/Invalid human review/);
 assert.throws(()=>review.receipt({...x.report,status:"admitted"},x.declaration),/quarantined/);
});
test("Modified files are resubmitted through full unchanged evaluator",()=>{
 const x=prepare(),next=x.old.map(b=>Buffer.from(b));next[0]=Buffer.from(JSON.stringify({id:"corrected"}));
 const outcome=checked(x.old,next,x.receipt,x.report,evaluator);
 assert.equal(outcome.result,"admitted");assert.deepEqual(outcome.changedInputIndices,[0]);
 assert.deepEqual(x.old,inputs());
 const denied=checked(x.old,next,x.receipt,x.report,()=>{throw Error("still invalid")});
 assert.equal(denied.result,"quarantined");
});
test("No unchanged input, rejected reviewer, tampered receipt or report bypass",()=>{
 const x=prepare(),next=x.old.map(b=>Buffer.from(b));next[0]=Buffer.from(JSON.stringify({id:"corrected"}));
 assert.throws(()=>checked(x.old,x.old,x.receipt,x.report,evaluator),/Unchanged/);
 assert.throws(()=>checked(x.old,next,{...x.receipt,decision:"reject"},x.report,evaluator),/receipt invalid|Altered review receipt/);
 assert.throws(()=>checked(x.old,next,{...x.receipt,reviewerId:"other"},x.report,evaluator),/receipt invalid|Altered review receipt/);
 assert.throws(()=>checked(x.old,next,x.receipt,{...x.report,note:"tampered"},evaluator),/report changed/);
});
test("No network, filesystem writes, brokerage, or runtime evaluation primitives",()=>{
 const fs=require("node:fs"),src=fs.readFileSync(require.resolve("../xmi2-quarantine-review.cjs"),"utf8");
 for(const token of ["fetch(","WebSocket","placeOrder","writeFile","DATABASE_URL","eval(","/api/"])assert.equal(src.includes(token),false);
});

test("Unsigned resubmission explicitly refused",()=>{const x=prepare(),next=x.old.map(b=>Buffer.from(b));next[0]=Buffer.from(JSON.stringify({id:"corrected"}));
 assert.throws(()=>review.resubmit(x.old,next,x.receipt,x.report,evaluator),/Invalid review chain/);
});
