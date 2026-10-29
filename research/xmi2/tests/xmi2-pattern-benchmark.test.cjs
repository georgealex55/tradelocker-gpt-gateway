const test=require("node:test"),assert=require("node:assert/strict");
const benchmark=require("../xmi2-pattern-benchmark.js"),detect=require("../xmi2-auto-patterns.js").detect;
const start=1780000000;
function fixture(id,split,offset=0,hasPattern=true){
 const highs=[10,10,14,10,9,8,9,10,13.9,10,9,8,7,7,7],
 lows=[8,8,9,8,6,5,6,8,9,8,6,4,3,3,3];
 const bars=highs.map((high,i)=>({time:start+offset+i*300,high,low:lows[i],open:(high+lows[i])/2,close:(high+lows[i])/2,closed:true}));
 if(hasPattern)bars[12].close=4.5;
 return {id,split,bars,expected:hasPattern?[{pattern:"Double Top",time:bars[12].time}]:[]};
}
test("Pinned synthetic true positive, negative and chronological holdout are deterministic",()=>{
 const cases=[fixture("train_hit","train",0,true),fixture("train_negative","train",100000,false),
 fixture("holdout_hit","holdout",200000,true),fixture("holdout_negative","holdout",300000,false)];
 const a=benchmark.score(cases),b=benchmark.score(structuredClone(cases));
 assert.deepEqual(a,b);assert.equal(a.version,"xmi-pattern-benchmark/v1");
 assert.equal(a.train.tp,1);assert.equal(a.holdout.tp,1);
 assert.equal(a.train.fn,0);assert.equal(a.holdout.fn,0);
 assert.equal(a.train.cases,2);assert.equal(a.holdout.cases,2);
 assert.equal(a.train.precision,1);assert.equal(a.holdout.precision,1);
 assert.equal(a.precisionGap,0);
});
test("Negative-only and unmatched labels use explicit null denominators",()=>{
 const c=fixture("negative","holdout",0,false),r=benchmark.score([c]);
 assert.equal(r.holdout.tp,0);assert.equal(r.holdout.precision,null);assert.equal(r.holdout.recall,null);
 assert.ok(Number.isFinite(r.holdout.falseDetectionsPer1000Bars));
 const missed=fixture("miss","train",0,false);
 missed.expected=[{pattern:"Triple Top",time:missed.bars[9].time}];
 const s=benchmark.score([missed]);assert.equal(s.train.fn,1);assert.equal(s.train.recall,0);
});
test("Future bars cannot make an earlier split successful",()=>{
 const c=fixture("held","holdout");
 const prefix={...c,bars:c.bars.slice(0,12),expected:[]};
 assert.equal(benchmark.score([prefix]).holdout.tp,0);
 assert.ok(!detect(prefix.bars).some(e=>e.pattern==="Double Top"));
});
test("Fail closed on malformed labels, open candles, repeated IDs and unbounded cases",()=>{
 const c=fixture("valid","train");
 assert.throws(()=>benchmark.score([c,c]),/Duplicate case/);
 assert.throws(()=>benchmark.score([{...c,bars:c.bars.map((b,i)=>i===3?{...b,closed:false}:b)}]),/Invalid closed/);
 assert.throws(()=>benchmark.score([{...c,expected:[{pattern:"x",time:9}]}]),/Invalid labeled/);
 assert.throws(()=>benchmark.score([c],{window:99}),/matching tolerance/);
 assert.throws(()=>benchmark.score(Array(101).fill(c)),/Invalid cases/);
});
test("Benchmark remains pure: no network, brokerage, database or evaluator",()=>{
 const fs=require("node:fs"),src=fs.readFileSync(require.resolve("../xmi2-pattern-benchmark.js"),"utf8");
 for(const token of ["fetch(","WebSocket","placeOrder","/api/","DATABASE_URL","eval(","new Function("])
  assert.ok(!src.includes(token),token);
});
