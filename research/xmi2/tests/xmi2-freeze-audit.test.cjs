const test=require("node:test"),assert=require("node:assert/strict"),crypto=require("node:crypto");
const audit=require("../xmi2-freeze-audit.cjs"),p=require("../xmi2-blind-protocol.js");
const start=1800000000;
const registry=()=>({version:p.VERSION,frozen:true,datasetId:"synthetic",protocolId:"blind_1",dataSha256:"a".repeat(64),
 frozenAt:"2026-10-28T12:00:00Z",partitions:[{id:"train",split:"train",start,end:start+3600,barSeconds:300,embargoBars:2,labelWindowBars:10},
 {id:"hold",split:"holdout",start:start+4800,end:start+8400,barSeconds:300,embargoBars:2,labelWindowBars:10}]});
const review=(reviewerId,verdict)=>({partitionId:"hold",pattern:"Double Top",time:start+5100,reviewerId,verdict,protocol:"blind-v1",detectorVisible:false});
test("Ed25519 receipt validates pinned registry, signature and trusted public key",()=>{
 const keys=crypto.generateKeyPairSync("ed25519"),another=crypto.generateKeyPairSync("ed25519");
 const timestamp="2026-10-28T13:00:00Z",signed=audit.createReceipt(registry(),keys.privateKey,keys.publicKey,timestamp);
 const pem=keys.publicKey.export({type:"spki",format:"pem"});
 assert.equal(audit.verifyReceipt(registry(),signed,pem),true);
 assert.throws(()=>audit.verifyReceipt({...registry(),dataSha256:"b".repeat(64)},signed,pem),/mismatch/);
 assert.throws(()=>audit.verifyReceipt(registry(),signed,another.publicKey.export({type:"spki",format:"pem"})),/Untrusted/);
 assert.throws(()=>audit.verifyReceipt(registry(),{...signed,signature:Buffer.alloc(64).toString("base64")},pem),/signature/);
});
test("Disagreement requires distinct detector-blind third reviewer",()=>{
 const labels=[review("one","positive"),review("two","negative")];
 const decision={partitionId:"hold",pattern:"Double Top",time:start+5100,reviewerId:"three",verdict:"positive",detectorVisible:false};
 const result=audit.resolve(registry(),labels,[decision]);
 assert.equal(result.unresolved.length,0);assert.equal(result.accepted.length,1);
 assert.throws(()=>audit.resolve(registry(),labels,[{...decision,reviewerId:"one"}]),/assignment/);
 assert.throws(()=>audit.resolve(registry(),labels,[{...decision,detectorVisible:true}]),/blind/);
 assert.equal(audit.resolve(registry(),labels,[{...decision,verdict:"uncertain"}]).unresolved.length,1);
});
test("No network, broker execution, or runtime secret configuration",()=>{
 const fs=require("node:fs"),src=fs.readFileSync(require.resolve("../xmi2-freeze-audit.cjs"),"utf8");
 for(const s of ["fetch(","WebSocket","placeOrder","DATABASE_URL","/api/"])assert.equal(src.includes(s),false);
});
