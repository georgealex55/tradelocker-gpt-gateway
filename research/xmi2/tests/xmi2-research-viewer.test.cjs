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

const viewer=require("../xmi2-research-viewer.cjs");
function render(f,head=f.head,chain=[f.link]){
 return viewer.view(f.x.files,f.researchBundle,f.x.publicPem,f.x.proof[1],f.x.proof[2],
  chain,f.witnessPem,checkpoint.GENESIS,0,head);
}
test("Verified read-only viewer renders signed research results without scripts or trading controls",()=>{
 const f=anchored(),html=render(f);
 assert.match(html,/XMI 2.0 Research Audit/);
 assert.match(html,/VERIFIED · OFFLINE RESEARCH ONLY · NO EXECUTION/);
 assert.match(html,/sealed_a/);
 assert.match(html,/Chronological embargo audit/);
 assert.match(html,/default-src 'none'/);
 assert.match(html,/connect-src 'none'/);
 assert.match(html,new RegExp(f.head));
 assert.equal(html.includes("<script"),false);
 assert.equal(html.includes("<form"),false);
 assert.equal(html.includes("http://"),false);
 assert.equal(html.includes("https://"),false);
});
test("HTML escaping and signed audit check prevent unverified display",()=>{
 assert.equal(viewer.escapeHtml("<script>alert('x')&\""),"&lt;script&gt;alert(&#39;x&#39;)&amp;&quot;");
 const f=anchored();
 assert.throws(()=>render(f,"0".repeat(64)),/terminal checkpoint/);
 const changed=structuredClone(f.researchBundle);changed.payload.report.comparison.results[0].id="<img src=x onerror=1>";
 assert.throws(()=>viewer.view(f.x.files,changed,f.x.publicPem,f.x.proof[1],f.x.proof[2],
  [f.link],f.witnessPem,checkpoint.GENESIS,0,f.head),/signature invalid/);
});
test("Local report CLI emits static HTML only after full chain and evidence verification",()=>{
 const f=anchored(),dir=fs.mkdtempSync(path.join(os.tmpdir(),"xmi2-viewer-"));
 try{
  function save(name,contents){const pathName=path.join(dir,name);fs.writeFileSync(pathName,contents);return pathName;}
  const evidence=f.x.files.map((v,i)=>save("historical-"+i+".dat",v));
  const rest=[save("bundle.json",JSON.stringify(f.researchBundle)),save("bundle.pem",f.x.publicPem),
   save("prereg.pem",f.x.proof[1]),save("prereg-checkpoint.txt",f.x.proof[2]),
   save("chain.json",JSON.stringify([f.link])),save("witness.pem",f.witnessPem),
   save("anchor.txt",checkpoint.GENESIS),save("anchor-seq.txt","0"),save("terminal.txt",f.head)];
  const script=require.resolve("../xmi2-research-viewer-cli.cjs");
  const valid=cp.spawnSync(process.execPath,[script,...evidence,...rest],{encoding:"utf8",timeout:15000});
  assert.equal(valid.status,0,valid.stderr);
  assert.match(valid.stdout,/<!doctype html>/);
  assert.match(valid.stdout,/Train signals/);
  const badRest=[...rest];badRest[8]=save("wrong-terminal.txt","0".repeat(64));
  const invalid=cp.spawnSync(process.execPath,[script,...evidence,...badRest],{encoding:"utf8",timeout:15000});
  assert.equal(invalid.status,1);
  assert.equal(invalid.stdout,"");
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test("Viewer source never reads network, places orders or modifies files",()=>{
 for(const file of ["../xmi2-research-viewer.cjs","../xmi2-research-viewer-cli.cjs"]){
  const src=fs.readFileSync(require.resolve(file),"utf8");
  for(const word of ["fetch(","WebSocket","placeOrder","DATABASE_URL","writeFile","/api/"])
   assert.equal(src.includes(word),false,word+" in "+file);
 }
});
