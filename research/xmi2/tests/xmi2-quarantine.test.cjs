const test=require("node:test"),assert=require("node:assert/strict"),crypto=require("node:crypto");
const q=require("../xmi2-quarantine.cjs");
function inputs(){return Array.from({length:10},(_,i)=>Buffer.from(JSON.stringify(i===0?{bars:[{time:10,open:2,high:3,low:1,close:2,closed:true},{time:10,open:2,high:3,low:1,close:2,closed:true},{time:20,open:2,high:3,low:1,close:2,closed:true}]}:i===1?{partitions:[{id:"train",start:10,end:40,barSeconds:10}]}:i===9?{sessions:[{open:10,close:40}]}:{})));}
test("Quarantine catches deterministic duplicate and missing bars and never mutates evidence",()=>{
 const input=inputs(),before=input.map(x=>Buffer.from(x));
 const result=q.inspect(input,()=>{throw Error("Private token must not leak");});
 assert.equal(result.status,"quarantined");
 assert.deepEqual(result.findings.map(x=>x.code),["ADMISSION_REJECTED","DUPLICATE_CANDLE_TIME","MISSING_SCHEDULED_BAR"]);
 assert.deepEqual(input,before);
 assert.ok(!JSON.stringify(result).includes("Private token"));
 assert.deepEqual(q.inspect(input,()=>{throw Error("other");}),result);
});
test("Quarantine is not an admission bypass, and bad arguments refuse",()=>{
 const input=inputs();assert.equal(q.inspect(input,()=>true).status,"admitted");
 assert.throws(()=>q.inspect(input.slice(1),()=>true),/ten bounded/);
 const copy=inputs();copy[0]=Buffer.alloc(2*1024*1024+1);
 assert.throws(()=>q.inspect(copy,()=>true),/ten bounded/);
});
test("Input digests trace original evidence without exposing source bytes",()=>{
 const input=inputs(),result=q.inspect(input,()=>{throw Error("rejected");});
 assert.equal(result.inputSha256.dataset,crypto.createHash("sha256").update(input[0]).digest("hex"));
 assert.equal(Object.keys(result.inputSha256).length,10);
});
