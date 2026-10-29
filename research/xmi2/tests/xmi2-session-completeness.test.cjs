const test=require("node:test"),assert=require("node:assert/strict");
const quality=require("../xmi2-historical-quality.cjs"),sessions=require("../xmi2-session-evidence.cjs");
const t=1800000000,step=300;
function fixture(){
 const registry={datasetId:"sample",partitions:[{id:"train",start:t,end:t+8*step,barSeconds:step}]};
 const dataset={bars:[0,1,2,6,7].map(i=>({time:t+i*step,open:10,high:11,low:9,close:10,closed:true}))};
 const policy={version:quality.VERSION,timezone:"UTC",assetClass:"synthetic",adjustmentBasis:"synthetic-no-actions",allowUnscheduledGaps:false};
 const evidence={version:sessions.VERSION,datasetId:"sample",calendarType:"synthetic",marketTimezone:"UTC",sourceReference:"synthetic-calendar-1",reviewerApproved:true,corporateActions:[],
 sessions:[{open:t,close:t+3*step,kind:"regular"},{open:t+6*step,close:t+8*step,kind:"shortened"}]};
 return {dataset,registry,policy,evidence};
}
test("Reviewed closures are excluded without manufacturing bars",()=>{
 const f=fixture(),before=JSON.stringify(f.dataset);
 assert.equal(quality.inspect(f.dataset,f.registry,f.policy,f.evidence).verifiedBars,5);
 assert.equal(sessions.validate(f.dataset,f.registry,f.policy,f.evidence).sessionCount,2);
 assert.equal(JSON.stringify(f.dataset),before);
 assert.throws(()=>quality.inspect(f.dataset,f.registry,f.policy),/missing-partition-bars/);
});
test("Missing scheduled bar still fails closed",()=>{
 const f=fixture();f.dataset.bars.splice(1,1);
 assert.throws(()=>quality.inspect(f.dataset,f.registry,f.policy,f.evidence),/missing-scheduled-bar/);
 assert.throws(()=>sessions.validate(f.dataset,f.registry,f.policy,f.evidence),/Missing scheduled/);
});
test("Fake closure cannot authorize a candle outside reviewed session",()=>{
 const f=fixture();f.dataset.bars.push({time:t+4*step,open:10,high:11,low:9,close:10,closed:true});
 f.dataset.bars.sort((a,b)=>a.time-b.time);
 assert.throws(()=>quality.inspect(f.dataset,f.registry,f.policy,f.evidence),/unscheduled-bar/);
 assert.throws(()=>sessions.validate(f.dataset,f.registry,f.policy,f.evidence),/outside admitted session/);
});
test("Unreviewed calendar is rejected and cannot exempt data gaps",()=>{
 const f=fixture();f.evidence.reviewerApproved=false;
 assert.throws(()=>quality.inspect(f.dataset,f.registry,f.policy,f.evidence),/session evidence required/);
 assert.throws(()=>sessions.validate(f.dataset,f.registry,f.policy,f.evidence),/Invalid session evidence/);
});
