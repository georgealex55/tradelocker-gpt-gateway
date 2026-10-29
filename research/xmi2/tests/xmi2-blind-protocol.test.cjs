const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs");
const p=require("../xmi2-blind-protocol.js");
const R=()=>({version:p.VERSION,frozen:true,datasetId:"invented_candles",protocolId:"blind_001",
 dataSha256:"a".repeat(64),frozenAt:"2026-10-28T12:00:00Z",
 partitions:[{id:"train1",split:"train",start:1800000000,end:1800003600,barSeconds:300,embargoBars:2,labelWindowBars:12},
 {id:"test1",split:"holdout",start:1800004800,end:1800008400,barSeconds:300,embargoBars:2,labelWindowBars:12}]});
const L=(reviewerId,verdict="positive")=>({partitionId:"test1",reviewerId,pattern:"Double Top",time:1800005100,verdict,protocol:"blind-v1",detectorVisible:false});
test("Frozen chronological splits enforce alignment and temporal embargo",()=>{
 assert.equal(p.validate(R()).partitions.length,2);
 const overlap=R();overlap.partitions[1].start=1800003900;
 assert.throws(()=>p.validate(overlap),/embargo/);
 const reversed=R();reversed.partitions[0].split="holdout";reversed.partitions[1].split="train";
 assert.throws(()=>p.validate(reversed),/train after holdout/);
 const wrong=R();wrong.dataSha256="not pinned";
 assert.throws(()=>p.validate(wrong),/digest/);
});
test("Blind independent labels require two matching reviewers and reject unblinding",()=>{
 const result=p.adjudicate(R(),[L("alice"),L("bob")]);
 assert.deepEqual(result.accepted,[{partitionId:"test1",pattern:"Double Top",time:1800005100}]);
 assert.equal(result.audit.adjudicated,1);
 assert.equal(p.adjudicate(R(),[L("alice"),L("bob","negative")]).unresolved.length,1);
 assert.equal(p.adjudicate(R(),[L("alice")]).unresolved.length,1);
 assert.throws(()=>p.validateLabels(R(),[{...L("alice"),detectorVisible:true}]),/unblinding/);
 assert.throws(()=>p.validateLabels(R(),[L("alice"),L("alice")]),/duplicate/);
});
test("Labels are partition-scoped; unreviewed or uncertain never become positives",()=>{
 assert.throws(()=>p.validateLabels(R(),[{...L("alice"),time:1800001200}]),/outside partition/);
 assert.equal(p.adjudicate(R(),[L("alice","uncertain"),L("bob","uncertain")]).accepted.length,0);
 assert.throws(()=>p.adjudicate(R(),[],{reviewersRequired:1}),/dual review/);
});
test("Registry has no network, broker, database or executable code",()=>{
 const src=fs.readFileSync(require.resolve("../xmi2-blind-protocol.js"),"utf8");
 for(const s of ["fetch(","WebSocket","placeOrder","DATABASE_URL","eval(","/api/"])assert.ok(!src.includes(s),s);
});
