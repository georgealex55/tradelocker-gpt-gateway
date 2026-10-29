const test=require("node:test"),assert=require("node:assert/strict");
const {detect}=require("../xmi2-auto-patterns.js");
const t=1780000000;
function make(highs,lows,closes=null){return highs.map((h,i)=>({time:t+i*300,open:closes?.[i]??(h+lows[i])/2,high:h,low:lows[i],close:closes?.[i]??(h+lows[i])/2,closed:true}));}
test("Only complete closed imports may contribute; forming and future bars never confirm",()=>{
 const hi=[10,10,14,10,9,8,9,10,13.9,10,9,8,7,7,7];
 const lo=[8,8,9,8,6,5,6,8,9,8,6,4,3,3,3];
 const bars=make(hi,lo);bars[11].close=4.5;
 const full=detect(bars);
 assert.ok(full.some(e=>e.pattern==="Double Top"));
 const earlier=detect(bars.map((b,i)=>i>=11?{...b,closed:false}:b));
 assert.ok(!earlier.some(e=>e.pattern==="Double Top"));
 assert.deepEqual(detect([...bars,{...bars.at(-1),time:t+999999,closed:false}]),full);
});
test("Breakout requires candle CLOSE after fully confirmed right pivot",()=>{
 const hi=[10,10,14,10,9,8,9,10,13.9,10,9,8,7,7,7],lo=[8,8,9,8,6,5,6,8,9,8,6,4,3,3,3];
 const bars=make(hi,lo);
 bars[11].close=6;bars[11].low=4;assert.equal(detect(bars).filter(e=>e.pattern==="Double Top").length,0);
 bars[12].close=4.5;assert.equal(detect(bars).filter(e=>e.pattern==="Double Top").length,1);
});
test("Pattern confidence is reproducible, bounded and not a predictive probability",()=>{
 const hi=[10,10,14,10,9,8,9,10,13.9,10,9,8,7,7,7],lo=[8,8,9,8,6,5,6,8,9,8,6,4,3,3,3];
 const bars=make(hi,lo);bars[12].close=4.5;
 const result=detect(bars);
 assert.deepEqual(result,detect(structuredClone(bars)));
 for(const e of result){assert.ok(e.confidence>=.35&&e.confidence<=.9);assert.equal(e.confidenceType,"heuristic-score-not-probability");assert.equal(e.confirmedAt,e.time);assert.ok(e.points.every(p=>p.confirmedAt<=e.confirmedAt));}
});
test("Later close beyond resistance invalidates bearish setup, never overwrites detection time",()=>{
 const hi=[10,10,14,10,9,8,9,10,13.9,10,9,8,7,7,16,16,16,16],lo=[8,8,9,8,6,5,6,8,9,8,6,4,3,3,5,5,5,5];
 const bars=make(hi,lo);bars[12].close=4.5;bars[14].close=15;
 const e=detect(bars).find(x=>x.pattern==="Double Top");
 assert.equal(e.status,"invalidated");assert.equal(e.invalidatedAt,bars[14].time);assert.equal(e.time,bars[12].time);
});
test("Invalid OHLC and oversized inputs fail closed, without network or execution",()=>{
 assert.throws(()=>detect([{time:t,open:1,high:0,low:1,close:1,closed:true}]),/Invalid/);
 assert.throws(()=>detect(Array(5001).fill(null)),/Invalid/);
 const fs=require("node:fs"),src=fs.readFileSync(require.resolve("../xmi2-auto-patterns.js"),"utf8");
 for(const s of ["fetch(","WebSocket","placeOrder","/api/","DATABASE_URL","eval("])assert.equal(src.includes(s),false);
});
