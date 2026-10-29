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
test("Frozen forward-walk keeps chronological embargo and reported holdout distinct",()=>{
 const files=inputs(),p=plan(),proof=verified(files,p);
 const result=walk.evaluate(files,p,...proof,frozen(files));
 assert.equal(result.mode,"offline-research-only");
 assert.equal(result.windows.length,1);
 assert.ok(result.windows[0].actualSeconds>=result.windows[0].requiredSeconds);
 assert.equal(result.comparison.candidateCount,2);
 assert.deepEqual(walk.evaluate(files,p,...proof,frozen(files)),result);
});
test("Forward-walk refuses refitting, changed partitions or unverifiable preregistration",()=>{
 const files=inputs(),p=plan(),proof=verified(files,p),f=frozen(files);
 for(const delta of [{allowRefitOnHoldout:true},{holdoutReportOnly:false},{trainOnlySelection:false},
   {frozen:false},{partitionRegistrySha256:"0".repeat(64)}]){
  assert.throws(()=>walk.evaluate(files,p,...proof,{...f,...delta}),/Frozen forward-walk/);
 }
 assert.throws(()=>walk.evaluate(files,p,...proof.slice(0,2),"0".repeat(64),f),/checkpoint/);
 const changed=files.slice();changed[0]=Buffer.concat([files[0],Buffer.from(" ")]);
 assert.throws(()=>walk.evaluate(changed,p,...proof,f),/SHA-256 mismatch/);
});
test("Forward-walk is local, read-only and non-executable",()=>{
 const src=fs.readFileSync(require.resolve("../xmi2-forward-walk.cjs"),"utf8");
 for(const word of ["fetch(","WebSocket","placeOrder","DATABASE_URL","writeFile","/api/"])
  assert.equal(src.includes(word),false);
});
