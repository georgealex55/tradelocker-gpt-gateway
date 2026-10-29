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

const checkpoint=require("../xmi2-research-checkpoint.cjs");
const declaredAt="2026-10-28T22:00:00Z";
function anchored(){
 const x=setup(),researchBundle=create(x),witness=crypto.generateKeyPairSync("ed25519");
 const witnessPem=witness.publicKey.export({type:"spki",format:"pem"});
 const link=checkpoint.seal(x.files,researchBundle,x.publicPem,x.proof[1],x.proof[2],
  witness.privateKey,checkpoint.GENESIS,1,declaredAt);
 const head=checkpoint.digest(link);
 return {x,researchBundle,witness,witnessPem,link,head};
}
function confirm(f,chain=[f.link],head=f.head){
 return checkpoint.verifyAnchoredBundle(f.x.files,f.researchBundle,f.x.publicPem,
  f.x.proof[1],f.x.proof[2],chain,f.witnessPem,checkpoint.GENESIS,0,head);
}
test("Offline checkpoint signs reproducible bundle and validates independently pinned chain head",()=>{
 const f=anchored();
 const repeated=checkpoint.seal(f.x.files,f.researchBundle,f.x.publicPem,f.x.proof[1],f.x.proof[2],
  f.witness.privateKey,checkpoint.GENESIS,1,declaredAt);
 assert.deepEqual(repeated,f.link);
 assert.equal(confirm(f).verifiedCount,1);
 assert.equal(confirm(f).reproducedBundleSha256,bundle.digest(Buffer.from(bundle.canonical(f.researchBundle))));
 assert.equal(confirm(f).terminalHead,f.head);
});
test("Tampering, false witness and missing external head are rejected",()=>{
 const f=anchored();
 const altered=structuredClone(f.link);altered.payload.declaredAt="2026-10-28T22:00:01Z";
 assert.throws(()=>confirm(f,[altered],checkpoint.digest(altered)),/signature invalid/);
 const other=crypto.generateKeyPairSync("ed25519").publicKey.export({type:"spki",format:"pem"});
 assert.throws(()=>checkpoint.verifyChain([f.link],other,checkpoint.GENESIS,0,f.head),/untrusted|broken|malformed/);
 assert.throws(()=>confirm(f,[f.link],"0".repeat(64)),/terminal checkpoint/);
 assert.throws(()=>checkpoint.verifyChain([],f.witnessPem,checkpoint.GENESIS,0,f.head),/anchors/);
 const forged=structuredClone(f.researchBundle);forged.payload.reportSha256="0".repeat(64);
 assert.throws(()=>checkpoint.verifyAnchoredBundle(f.x.files,forged,f.x.publicPem,f.x.proof[1],
  f.x.proof[2],[f.link],f.witnessPem,checkpoint.GENESIS,0,f.head),/signature invalid/);
});
test("Hash-linked append-only verification rejects truncation, reordering and duplicate bundle",()=>{
 const f=anchored();
 const newPlan=plan([{...spec,id:"sealed_c"}]),newProof=verified(f.x.files,newPlan);
 const secondBundle=bundle.create(f.x.files,newPlan,newProof[0],newProof[1],newProof[2],
  f.x.w,f.x.signer.privateKey);
 const second=checkpoint.seal(f.x.files,secondBundle,f.x.publicPem,newProof[1],newProof[2],
  f.witness.privateKey,f.head,2,"2026-10-28T22:01:00Z");
 const fullHead=checkpoint.digest(second);
 assert.equal(checkpoint.verifyChain([f.link,second],f.witnessPem,checkpoint.GENESIS,0,fullHead).verifiedCount,2);
 assert.throws(()=>checkpoint.verifyChain([f.link],f.witnessPem,checkpoint.GENESIS,0,fullHead),/terminal checkpoint/);
 assert.throws(()=>checkpoint.verifyChain([second,f.link],f.witnessPem,checkpoint.GENESIS,0,fullHead),/broken/);
 const duplicated=checkpoint.seal(f.x.files,f.researchBundle,f.x.publicPem,f.x.proof[1],f.x.proof[2],
  f.witness.privateKey,f.head,2,"2026-10-28T22:01:00Z");
 assert.throws(()=>checkpoint.verifyChain([f.link,duplicated],f.witnessPem,checkpoint.GENESIS,0,
  checkpoint.digest(duplicated)),/Duplicate checkpointed/);
 assert.throws(()=>checkpoint.verifyChain([second],f.witnessPem,f.head,0,fullHead),/broken/);
 const checkpointResult=checkpoint.verifyAnchoredBundle(f.x.files,secondBundle,f.x.publicPem,
  newProof[1],newProof[2],[f.link,second],f.witnessPem,checkpoint.GENESIS,0,fullHead);
 assert.equal(checkpointResult.terminalSequence,2);
 assert.throws(()=>confirm(f,[f.link,second],fullHead),/does not describe/);
});
test("Malformed declared timestamp and sequence cannot create a checkpoint",()=>{
 const f=anchored();
 const args=[f.x.files,f.researchBundle,f.x.publicPem,f.x.proof[1],f.x.proof[2],f.witness.privateKey];
 assert.throws(()=>checkpoint.seal(...args,checkpoint.GENESIS,0,declaredAt),/Invalid checkpoint/);
 assert.throws(()=>checkpoint.seal(...args,checkpoint.GENESIS,1,"garbage"),/Invalid checkpoint/);
 assert.throws(()=>checkpoint.seal(...args,"not-a-hash",1,declaredAt),/Invalid checkpoint/);
});
test("The checkpoint chain contains no network, execution or persistence implementation",()=>{
 const code=fs.readFileSync(require.resolve("../xmi2-research-checkpoint.cjs"),"utf8");
 for(const token of ["fetch(","WebSocket","placeOrder","DATABASE_URL","writeFile","/api/","execSync"])
  assert.equal(code.includes(token),false,token);
});

test("Local CLI seals and verifies against separately provided terminal head",()=>{
 const f=anchored(),dir=fs.mkdtempSync(path.join(os.tmpdir(),"xmi2-checkpoint-"));
 try{
  function save(name,bytes){const file=path.join(dir,name);fs.writeFileSync(file,bytes);return file;}
  const evidence=f.x.files.map((v,i)=>save("evidence-"+i+".json",v));
  const researchFile=save("bundle.json",JSON.stringify(f.researchBundle));
  const trustBundle=save("bundle.pem",f.x.publicPem),trustPrereg=save("prereg.pem",f.x.proof[1]);
  const preregCheckpoint=save("pre.txt",f.x.proof[2]);
  const witnessPrivate=save("witness-private.pem",f.witness.privateKey.export({type:"pkcs8",format:"pem"}));
  const prior=save("prior.txt",checkpoint.GENESIS),seq=save("seq.txt","1"),time=save("time.txt",declaredAt);
  const script=require.resolve("../xmi2-research-checkpoint-cli.cjs");
  const sealed=cp.spawnSync(process.execPath,[script,"seal",...evidence,researchFile,trustBundle,
   trustPrereg,preregCheckpoint,witnessPrivate,prior,seq,time],{encoding:"utf8",timeout:15000});
  assert.equal(sealed.status,0,sealed.stderr);
  const link=JSON.parse(sealed.stdout),head=checkpoint.digest(link);
  const verified=cp.spawnSync(process.execPath,[script,"verify",...evidence,researchFile,
   trustBundle,trustPrereg,preregCheckpoint,save("chain.json",JSON.stringify([link])),
   save("witness.pem",f.witnessPem),prior,save("anchor-seq.txt","0"),save("terminal.txt",head)],
   {encoding:"utf8",timeout:15000});
  assert.equal(verified.status,0,verified.stderr);
  assert.equal(JSON.parse(verified.stdout).terminalHead,head);
  const refused=cp.spawnSync(process.execPath,[script,"verify",...evidence,researchFile,
   trustBundle,trustPrereg,preregCheckpoint,save("chain-false.json",JSON.stringify([link])),
   save("witness2.pem",f.witnessPem),prior,save("anchor-seq2.txt","0"),
   save("wrong-terminal.txt","0".repeat(64))],{encoding:"utf8",timeout:15000});
  assert.equal(refused.status,1);assert.match(refused.stderr,/pinned terminal checkpoint/);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
