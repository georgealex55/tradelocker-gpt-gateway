const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),
 os=require("node:os"),path=require("node:path"),cp=require("node:child_process");
const runner=require("../xmi2-local-benchmark.cjs"),protocol=require("../xmi2-blind-protocol.js");
const audit=require("../xmi2-freeze-audit.cjs"),crypto=require("node:crypto");
const trust=require("../xmi2-trusted-signers.cjs");
const intake=require("../xmi2-historical-intake.cjs");
const quality=require("../xmi2-historical-quality.cjs");
const session=require("../xmi2-session-evidence.cjs");
const base=1800000000,second=base+15*300+1200;
function bars(start){
 const highs=[10,10,14,10,9,8,9,10,13.9,10,9,8,7,7,7],lows=[8,8,9,8,6,5,6,8,9,8,6,4,3,3,3];
 return highs.map((high,i)=>({time:start+i*300,open:(high+lows[i])/2,
  high,low:lows[i],close:i===12?4.5:(high+lows[i])/2,closed:true}));
}
function inputs(){
 const dataset={version:"xmi-historical-bars/v1",datasetId:"synthetic_only",bars:[...bars(base),...bars(second)]};
 const raw=Buffer.from(JSON.stringify(dataset));
 const registry={version:protocol.VERSION,frozen:true,datasetId:"synthetic_only",protocolId:"protocol_1",
 dataSha256:runner.digest(raw),frozenAt:"2026-10-28T18:00:00Z",
 partitions:[{id:"training",split:"train",start:base,end:base+15*300,barSeconds:300,embargoBars:2,labelWindowBars:15},
 {id:"holdout",split:"holdout",start:second,end:second+15*300,barSeconds:300,embargoBars:2,labelWindowBars:15}]};
 const labels=[];
 for(const p of registry.partitions)for(const reviewerId of ["reviewerA","reviewerB"])
  labels.push({partitionId:p.id,reviewerId,pattern:"Double Top",time:p.start+12*300,
  verdict:"positive",protocol:"blind-v1",detectorVisible:false});
 const keys=crypto.generateKeyPairSync("ed25519");
 const receipt=audit.createReceipt(registry,keys.privateKey,keys.publicKey,"2026-10-28T19:00:00Z");
 return [raw,Buffer.from(JSON.stringify(registry)),Buffer.from(JSON.stringify(labels)),
  Buffer.from(JSON.stringify(receipt)),Buffer.from(receipt.publicKeyPem),Buffer.from("[]"),
  Buffer.from(JSON.stringify({version:trust.VERSION,signers:[{id:"primary",publicKeyPem:receipt.publicKeyPem,
   status:"active",validFrom:"2026-01-01T00:00:00Z",validUntil:"2027-01-01T00:00:00Z"}]})),
  Buffer.from(JSON.stringify({version:intake.VERSION,datasetId:"synthetic_only",dataSha256:runner.digest(raw),
    basis:"owner-created-synthetic",sourceName:"Invented CI bars",sourceReference:"local-fixture-v1",
    licenseReference:"synthetic-original-v1",permittedUse:"offline-historical-research",rightsReviewed:true,
    redistributionAllowed:false,networkFetchAllowed:false,brokerExecutionAllowed:false,
    approvedBy:"test_owner",approvedAt:"2026-10-28T17:00:00Z"})),
  Buffer.from(JSON.stringify({version:quality.VERSION,timezone:"UTC",assetClass:"synthetic",
    adjustmentBasis:"synthetic-no-actions",allowUnscheduledGaps:false})),
  Buffer.from(JSON.stringify({version:session.VERSION,datasetId:"synthetic_only",calendarType:"synthetic",
    marketTimezone:"UTC",sourceReference:"synthetic-calendar-v1",reviewerApproved:true,
    sessions:[{open:base,close:base+15*300,kind:"regular"},{open:second,close:second+15*300,kind:"regular"}],corporateActions:[]}))];
}
const lab=require("../xmi2-strategy-lab.cjs");
const spec={version:lab.VERSION,id:"research_rule_1",rule:"close-crosses-prior-high",lookback:1,
 executionEnabled:false,liveDataEnabled:false,allowParameterSearch:false};

const comparison=require("../xmi2-strategy-comparison.cjs");
const prereg=require("../xmi2-candidate-preregistration.cjs");
function verified(files,p){const key=crypto.generateKeyPairSync("ed25519");const r=prereg.commit(p,runner.digest(files[1]),key.privateKey,key.publicKey,"2026-10-28T19:00:00Z");return [r,r.publicKeyPem,prereg.sha(Buffer.from(JSON.stringify(r)))];}
function compare(files,p){return comparison.compare(files,p,...verified(files,p));}
const candidates=[{...spec,id:"sealed_a"},{...spec,id:"sealed_b"}];
function plan(cs=candidates){return {version:comparison.VERSION,frozen:true,candidates:cs,
 candidateSetSha256:runner.digest(Buffer.from(JSON.stringify(cs))),selectionPartition:"train",
 holdoutPolicy:"report-only",allowAdaptiveSearch:false,maxCandidates:cs.length,holdoutEvaluations:1};}

const walk=require("../xmi2-forward-walk.cjs");
const frozen=(files)=>({version:walk.VERSION,frozen:true,partitionRegistrySha256:runner.digest(files[1]),trainOnlySelection:true,holdoutReportOnly:true,allowRefitOnHoldout:false});

const bundle=require("../xmi2-research-bundle.cjs");
function setup(){
 const files=inputs(),p=plan(),proof=verified(files,p),w=frozen(files);
 const signer=crypto.generateKeyPairSync("ed25519");
 const publicPem=signer.publicKey.export({type:"spki",format:"pem"});
 return {files,p,proof,w,signer,publicPem};
}
function create(x){return bundle.create(x.files,x.p,x.proof[0],x.proof[1],x.proof[2],x.w,x.signer.privateKey);}
function verify(x,b){return bundle.verify(x.files,b,x.publicPem,x.proof[1],x.proof[2]);}
test("Reproducible signed offline bundle replays fully admitted historical research",()=>{
 const x=setup(),before=x.files.map(b=>Buffer.from(b)),a=create(x),b=create(x);
 assert.deepEqual(a,b);assert.equal(a.version,bundle.VERSION);
 const verified=verify(x,a);
 assert.equal(verified.verified,true);
 assert.equal(a.payload.report.comparison.candidateCount,2);
 assert.equal(a.payload.reportSha256,bundle.digest(Buffer.from(bundle.canonical(a.payload.report))));
 assert.deepEqual(x.files,before);
 assert.equal(JSON.stringify(a).includes("PRIVATE KEY"),false);
 assert.equal(a.payload.evidenceSha256.dataset,runner.digest(x.files[0]));
});
test("Bundle signature, pinned keys, original inputs and precommitment are mandatory",()=>{
 const x=setup(),b=create(x);
 const tampered=structuredClone(b);tampered.payload.walk.holdoutReportOnly=false;
 assert.throws(()=>verify(x,tampered),/signature invalid/);
 const changedSig=structuredClone(b);changedSig.signature=Buffer.alloc(64).toString("base64");
 assert.throws(()=>verify(x,changedSig),/signature invalid/);
 const other=crypto.generateKeyPairSync("ed25519").publicKey.export({type:"spki",format:"pem"});
 assert.throws(()=>bundle.verify(x.files,b,other,x.proof[1],x.proof[2]),/trust or format mismatch/);
 assert.throws(()=>bundle.verify(x.files,b,x.publicPem,other,x.proof[2]),/trust or format mismatch/);
 assert.throws(()=>bundle.verify(x.files,b,x.publicPem,x.proof[1],"0".repeat(64)),/trust or format mismatch/);
 assert.throws(()=>bundle.verify(x.files.slice(0,9),b,x.publicPem,x.proof[1],x.proof[2]),/Exactly ten/);
 const modified=x.files.slice();modified[0]=Buffer.concat([modified[0],Buffer.from(" ")]);
 assert.throws(()=>bundle.verify(modified,b,x.publicPem,x.proof[1],x.proof[2]),/SHA-256 mismatch/);
});
test("Independent recomputation rejects signed but false report or evidence metadata",()=>{
 const x=setup(),b=create(x);
 const forged=structuredClone(b);
 forged.payload.report.comparison.candidateCount=99;
 forged.payload.reportSha256=bundle.digest(Buffer.from(bundle.canonical(forged.payload.report)));
 forged.signature=crypto.sign(null,Buffer.from(bundle.canonical(forged.payload)),x.signer.privateKey).toString("base64");
 assert.throws(()=>verify(x,forged),/cannot be reproduced/);
 const forgedHash=structuredClone(b);forgedHash.payload.evidenceSha256.dataset="0".repeat(64);
 forgedHash.signature=crypto.sign(null,Buffer.from(bundle.canonical(forgedHash.payload)),x.signer.privateKey).toString("base64");
 assert.throws(()=>verify(x,forgedHash),/cannot be reproduced/);
});
test("CLI create and verify operate only on explicitly supplied local files",()=>{
 const x=setup(),dir=fs.mkdtempSync(path.join(os.tmpdir(),"xmi2-signed-bundle-"));
 try{
  const filenames=["dataset","registry","reviews","freeze","trusted-freeze","decisions","signers","intake","quality","sessions"]
   .map((name,i)=>{const f=path.join(dir,name+".dat");fs.writeFileSync(f,x.files[i]);return f;});
  function save(name,data){const file=path.join(dir,name);fs.writeFileSync(file,data);return file;}
  const args=[
   save("plan.json",JSON.stringify(x.p)),save("pre.json",JSON.stringify(x.proof[0])),
   save("trusted-pre.pem",x.proof[1]),save("checkpoint.txt",x.proof[2]),
   save("walk.json",JSON.stringify(x.w)),
   save("private.pem",x.signer.privateKey.export({type:"pkcs8",format:"pem"}))
  ];
  const script=require.resolve("../xmi2-research-bundle-cli.cjs");
  const result=cp.spawnSync(process.execPath,[script,"create",...filenames,...args],{encoding:"utf8",timeout:15000});
  assert.equal(result.status,0,result.stderr);
  const created=JSON.parse(result.stdout),bundleFile=save("bundle.json",result.stdout);
  assert.equal(created.payload.report.comparison.candidateCount,2);
  const verifyResult=cp.spawnSync(process.execPath,[script,"verify",...filenames,
   bundleFile,save("trusted-bundle.pem",x.publicPem),args[2],args[3]],{encoding:"utf8",timeout:15000});
  assert.equal(verifyResult.status,0,verifyResult.stderr);
  assert.equal(JSON.parse(verifyResult.stdout).verified,true);
  const refused=cp.spawnSync(process.execPath,[script,"verify",...filenames.slice(1)],{encoding:"utf8",timeout:15000});
  assert.equal(refused.status,1);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test("Research bundle excludes network, orders, credentials and database writes",()=>{
 for(const file of ["../xmi2-research-bundle.cjs","../xmi2-research-bundle-cli.cjs"]){
  const src=fs.readFileSync(require.resolve(file),"utf8");
  for(const token of ["fetch(","WebSocket","placeOrder","DATABASE_URL","/api/","writeFile"])
   assert.ok(!src.includes(token),token+" in "+file);
 }
});
