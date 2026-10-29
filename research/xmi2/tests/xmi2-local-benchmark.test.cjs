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
test("Verified frozen hashes produce deterministic train and holdout report",()=>{
 const inputs1=inputs(),a=runner.evaluate(...inputs1),b=runner.evaluate(...inputs1);
 assert.deepEqual(a,b);assert.equal(a.format,"xmi-local-benchmark-report/v1");
 assert.equal(a.dataSha256,runner.digest(inputs1[0]));
 assert.equal(a.metrics.train.tp,1);assert.equal(a.metrics.holdout.tp,1);
 assert.equal(a.labelingAudit.excluded,0);
 assert.match(a.limitations.join(" "),/not an exhaustive/);
});
test("Dataset tamper or registry/reviewer mismatch fail closed",()=>{
 const [raw,reg,labels,receipt,key,decisions,registry,manifest,qualityPolicy,sessionEvidence]=inputs();
 const tampered=Buffer.from(raw);tampered[0]=tampered[0]===123?32:123;
 assert.throws(()=>runner.evaluate(tampered,reg,labels,receipt,key,decisions,registry,manifest,qualityPolicy,sessionEvidence),/SHA-256 mismatch/);
 const conflicting=JSON.parse(labels.toString());conflicting[1].verdict="negative";
 assert.throws(()=>runner.evaluate(raw,reg,Buffer.from(JSON.stringify(conflicting)),receipt,key,decisions,registry,manifest,qualityPolicy,sessionEvidence),/Unresolved blind labels/);
 const wrong=JSON.parse(reg.toString());wrong.datasetId="other";
 assert.throws(()=>runner.evaluate(raw,Buffer.from(JSON.stringify(wrong)),labels,receipt,key,decisions,registry,manifest,qualityPolicy,sessionEvidence),/mismatch|envelope/);
});
test("CLI reads only supplied files, returns report and rejects mutated bytes",()=>{
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),"xmi2-offline-"));
 try{
  const contents=inputs(),files=["data.json","registry.json","labels.json","receipt.json","trusted.pem","decisions.json","trusted-signers.json","historical-intake.json","historical-quality.json","session-evidence.json"].map((f,i)=>{
   const name=path.join(temp,f);fs.writeFileSync(name,contents[i]);return name;});
  const ok=cp.spawnSync(process.execPath,[require.resolve("../xmi2-local-benchmark.cjs"),...files],{encoding:"utf8",timeout:10000});
  assert.equal(ok.status,0,ok.stderr);
  assert.equal(JSON.parse(ok.stdout).metrics.holdout.tp,1);
  fs.appendFileSync(files[0]," ");
  const bad=cp.spawnSync(process.execPath,[require.resolve("../xmi2-local-benchmark.cjs"),...files],{encoding:"utf8",timeout:10000});
  assert.equal(bad.status,1);assert.match(bad.stderr,/SHA-256 mismatch/);
 }finally{fs.rmSync(temp,{recursive:true,force:true});}
});
test("No executable paths or remote data access",()=>{
 const src=fs.readFileSync(require.resolve("../xmi2-local-benchmark.cjs"),"utf8");
 for(const token of ["fetch(","WebSocket","placeOrder","execSync","DATABASE_URL","https://","/api/"])
  assert.ok(!src.includes(token),token);
 assert.throws(()=>runner.readFile(__filename.replace(/\.cjs$/,".missing")));
});

test("Signed evidence is mandatory and mutation or key substitution rejects reports",()=>{
 const inputs1=inputs();
 assert.throws(()=>runner.evaluate(...inputs1.slice(0,3)),/Offline session evidence required/);
 const mutated=inputs1.slice();const receipt=JSON.parse(mutated[3].toString());receipt.payload.datasetId="fake";mutated[3]=Buffer.from(JSON.stringify(receipt));
 assert.throws(()=>runner.evaluate(...mutated),/mismatch|signature/);
 const untrusted=inputs1.slice();untrusted[4]=Buffer.from(crypto.generateKeyPairSync("ed25519").publicKey.export({type:"spki",format:"pem"}));
 assert.throws(()=>runner.evaluate(...untrusted),/Trusted key mismatch/);
});

test("Pinned signer rotation and revocation fail closed",()=>{
 const parts=inputs(),good=JSON.parse(parts[6].toString());
 assert.equal(runner.evaluate(...parts).authorizedSignerId,"primary");
 for(const status of ["retired","revoked"]){
  const registry=structuredClone(good);registry.signers[0].status=status;
  if(status==="revoked")registry.signers[0].revokedAt="2026-10-28T19:30:00Z";
  const changed=[...parts];changed[6]=Buffer.from(JSON.stringify(registry));
  assert.throws(()=>runner.evaluate(...changed),/Retired|revoked/);
 }
 const absent=[...parts];absent[6]=Buffer.from(JSON.stringify({...good,signers:[]}));
 assert.throws(()=>runner.evaluate(...absent),/trust registry/);
 const rotated=structuredClone(good);
 rotated.signers.push({id:"successor",publicKeyPem:crypto.generateKeyPairSync("ed25519").publicKey.export({type:"spki",format:"pem"}),
 status:"active",validFrom:"2026-10-28T00:00:00Z",validUntil:"2027-01-01T00:00:00Z"});
 const accepted=[...parts];accepted[6]=Buffer.from(JSON.stringify(rotated));
 assert.equal(runner.evaluate(...accepted).authorizedSignerId,"primary");
 rotated.signers[0].status="retired";
 accepted[6]=Buffer.from(JSON.stringify(rotated));
 assert.throws(()=>runner.evaluate(...accepted),/Retired/);
});

test("Historical intake rejects absent, unapproved, altered and post-freeze rights claims",()=>{
 const a=inputs();
 assert.throws(()=>runner.evaluate(...a.slice(0,7)),/Offline session evidence required/);
 const m=JSON.parse(a[7].toString());
 for(const change of [{rightsReviewed:false},{dataSha256:"0".repeat(64)},{approvedAt:"2026-10-29T00:00:00Z"},{networkFetchAllowed:true},{permittedUse:"broker-live"}]){
  const altered=[...a];altered[7]=Buffer.from(JSON.stringify({...m,...change}));
  assert.throws(()=>runner.evaluate(...altered),/Historical/);
 }
 assert.equal(runner.evaluate(...a).provenance.basis,"owner-created-synthetic");
});

test("Mandatory quality policy rejects gap, duplicates and incorrect adjustments",()=>{
 const data=inputs(),policy=JSON.parse(data[8].toString());
 assert.equal(runner.evaluate(...data).qualityReport.verifiedBars,30);
 assert.throws(()=>runner.evaluate(...data.slice(0,8)),/Offline session evidence required/);
 for(const change of [{timezone:"America/New_York"},{assetClass:"equity"},{allowUnscheduledGaps:true}]){
  const x=[...data];x[8]=Buffer.from(JSON.stringify({...policy,...change}));
  assert.throws(()=>runner.evaluate(...x),/Historical/);
 }
 const x=[...data],modified=JSON.parse(x[0].toString());modified.bars.splice(3,1);
 x[0]=Buffer.from(JSON.stringify(modified));
 const manifest=JSON.parse(x[7].toString()),registry=JSON.parse(x[1].toString());
 const hash=runner.digest(x[0]);manifest.dataSha256=hash;registry.dataSha256=hash;
 x[1]=Buffer.from(JSON.stringify(registry));x[7]=Buffer.from(JSON.stringify(manifest));
 assert.throws(()=>runner.evaluate(...x),/Freeze receipt mismatch|Historical quality rejected/);
});

test("Offline session evidence rejects fabricated, missing, and unmatched calendars",()=>{
 const inputs1=inputs();assert.equal(runner.evaluate(...inputs1).sessionReport.sessionCount,2);
 assert.throws(()=>runner.evaluate(...inputs1.slice(0,9)),/Offline session evidence required/);
 const evidence=JSON.parse(inputs1[9].toString());
 for(const change of [{marketTimezone:"Asia/Tokyo"},{reviewerApproved:false},{sessions:[]},
  {sessions:[{open:base+300,close:base+15*300,kind:"regular"},evidence.sessions[1]]}]){
  const a=[...inputs1];a[9]=Buffer.from(JSON.stringify({...evidence,...change}));
  assert.throws(()=>runner.evaluate(...a),/session|calendar|evidence|scheduled/i);
 }
});
