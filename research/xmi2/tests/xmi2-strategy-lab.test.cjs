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
test("Admitted local evidence produces stable, partition-separated non-executable signals",()=>{
 const files=inputs(),a=lab.replay(files,spec),b=lab.replay(files,spec);
 assert.deepEqual(a,b);assert.equal(a.mode,"offline-research-only");
 assert.equal(a.results.length,2);assert.equal(a.results[0].split,"train");assert.equal(a.results[1].split,"holdout");
 assert.ok(a.results.every(r=>r.signals.every(s=>Number.isSafeInteger(s.time)&&s.barIndex>0)));
 assert.equal(a.admissionEvidence.freezeReceiptSha256,runner.digest(files[3]));
 assert.match(a.limitations.join(" "),/No P&L/);
});
test("No unsigned, tampered, or unreviewed dataset can enter Strategy Lab",()=>{
 const files=inputs();assert.throws(()=>lab.replay(files.slice(0,9),spec),/Ten signed/);
 const modified=files.slice();modified[0]=Buffer.from(modified[0].toString()+" ");
 assert.throws(()=>lab.replay(modified,spec),/SHA-256 mismatch/);
 const modifiedTrust=files.slice();const trustRegistry=JSON.parse(modifiedTrust[6].toString());
 trustRegistry.signers[0].status="revoked";trustRegistry.signers[0].revokedAt="2026-10-28T20:00:00Z";
 modifiedTrust[6]=Buffer.from(JSON.stringify(trustRegistry));
 assert.throws(()=>lab.replay(modifiedTrust,spec),/revoked/);
});
test("No execution, live-data, strategy tuning or invalid research spec",()=>{
 const files=inputs();
 for(const change of [{executionEnabled:true},{liveDataEnabled:true},{allowParameterSearch:true},
   {rule:"broker-submit"},{lookback:2}]){
  assert.throws(()=>lab.replay(files,{...spec,...change}),/Research-only/);
 }
 const src=fs.readFileSync(require.resolve("../xmi2-strategy-lab.cjs"),"utf8");
 for(const token of ["fetch(","WebSocket","placeOrder","DATABASE_URL","writeFile","/api/"])
  assert.equal(src.includes(token),false);
});
