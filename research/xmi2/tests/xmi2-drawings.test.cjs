const test=require("node:test"),assert=require("node:assert/strict");
const fs=require("node:fs");
const m=require("../xmi2-drawings.js");
const stamp=Date.parse("2026-10-28T15:00:00Z")/1000;
const p=(t,price)=>({time:stamp+t*300,price});
const drawing=(tool="Trendline",points=[p(0,1.08),p(3,1.09)],overrides={})=>
 ({id:"d_1",symbol:"FX:EURUSD",tool,points,text:"",color:"#65d1e7",...overrides});
test("All requested chart drawing and measurement families use explicit anchor counts",()=>{
 assert.deepEqual(Object.keys(m.TOOLS),["Annotations","Patterns","Fibonacci","Lines","Measurements"]);
 assert.equal(m.TOOLS.Annotations.length,4);
 assert.equal(m.TOOLS.Patterns.length,7);
 assert.equal(m.TOOLS.Fibonacci.length,3);
 assert.equal(m.TOOLS.Lines.length,5);
 assert.equal(m.TOOLS.Measurements.length,4);
 assert.equal(m.clicks("Freehand drawing"),0);
 assert.equal(m.clicks("Text labels"),1);
 assert.equal(m.clicks("Fib Retracement"),2);
 assert.equal(m.clicks("Trend-Based Fib Extension"),3);
 assert.equal(m.clicks("Parallel Channel"),3);
 assert.equal(m.clicks("Long / Short Risk Reward"),3);
 assert.equal(m.clicks("Head & Shoulders / Inverse"),5);
 assert.equal(m.clicks("Triple Top / Bottom"),5);
 assert.equal(m.clicks("Triangles"),4);
 assert.throws(()=>m.clicks("Place trade"),/Unsupported/);
});
test("Immutable validated JSON retains symbol drawings without a timeframe lock",()=>{
 const a=drawing(),b=drawing("Text labels",[p(2,1.10)],{id:"d_2",text:"London session"});
 const raw=m.serialize([a,b]);
 assert.match(raw,/xmi-drawings\/v2/);
 const parsed=m.deserialize(raw);
 assert.equal(parsed.length,2);
 assert.deepEqual(m.symbolDrawings(parsed,"FX:EURUSD"),parsed);
 assert.deepEqual(m.symbolDrawings(parsed,"FX:GBPUSD"),[]);
 assert.equal(parsed[1].text,"London session");
 assert.equal(parsed[0].points[1].time,stamp+900);
 assert.equal(parsed[0].points[1].price,1.09);
 assert.ok(!raw.includes("TradeLocker")&&!raw.includes("credentials"));
});
test("Malformed imported annotations reject injection and excessive geometry",()=>{
 const base=drawing();
 for(const invalid of [
  {...base,id:"../../bad"},{...base,symbol:"FX:GBPUSD\n"},
  {...base,tool:"Place Order"},
  {...base,color:"javascript:alert(1)"},
  {...base,points:[p(1,-1),p(2,1.2)]},
  {...base,points:[p(1,1.1)]},
  {...base,text:"x".repeat(101)},
  {...base,points:Array(301).fill(p(1,1.1))}
 ])assert.throws(()=>m.validate([invalid]),/Invalid/);
 assert.throws(()=>m.validate(Array(151).fill(base)),/Invalid/);
 assert.throws(()=>m.validate([base,base]),/Invalid/);
 assert.throws(()=>m.deserialize('{"format":"evil","drawings":[]}'),/Unsupported/);
 assert.throws(()=>m.deserialize("x".repeat(250001)),/size/);
 assert.throws(()=>m.deserialize('not json'));
});
test("Fibonacci retracement, extension, trend-based extension have real price levels",()=>{
 const retr=m.fibonacci(drawing("Fib Retracement",[p(0,1.10),p(1,1.20)]));
 assert.equal(retr[0].price,1.20);
 assert.ok(Math.abs(retr.find(l=>l.level===.5).price-1.15)<1e-9);
 assert.ok(Math.abs(retr.find(l=>l.level===1).price-1.10)<1e-9);
 const ext=m.fibonacci(drawing("Fib Extension",[p(0,1.10),p(1,1.20)]));
 assert.equal(ext[0].price,1.10);
 assert.ok(Math.abs(ext.find(l=>l.level===1.618).price-1.2618)<1e-9);
 const trend=m.fibonacci(drawing("Trend-Based Fib Extension",[p(0,1.10),p(1,1.20),p(2,1.15)]));
 assert.ok(Math.abs(trend.find(l=>l.level===1).price-1.25)<1e-9);
 assert.equal(m.RATES.length,9);
});
test("Pip, percent, time/bar and risk reward measurements remain hypothetical",()=>{
 const prices=drawing("Price / Pip Ruler",[p(0,1.083),p(3,1.088)]);
 const data=m.metrics(prices,300);
 assert.ok(Math.abs(data.pips-50)<1e-8);
 assert.ok(Math.abs(data.percent-.005/1.083*100)<1e-8);
 assert.equal(data.elapsedSeconds,900);
 assert.equal(data.bars,3);
 const yen=drawing("Price / Pip Ruler",[p(0,155.2),p(1,155.3)],{symbol:"FX:USDJPY"});
 assert.ok(Math.abs(m.metrics(yen).pips-10)<1e-8);
 const rr=drawing("Long / Short Risk Reward",[p(0,1.10),p(1,1.09),p(2,1.13)]);
 const risk=m.metrics(rr);assert.ok(Math.abs(risk.ratio-3)<1e-8);
 assert.equal(risk.direction,"long");
 assert.equal(m.metrics(drawing("Long / Short Risk Reward",[p(0,1.10),p(1,1.1),p(2,1.12)])).ratio,null);
});
test("Hit testing supports moving anchored shapes and individual handle editing",()=>{
 const a=drawing("Trendline",[p(0,1.10),p(1,1.20)]);
 const item=[{drawing:a,points:[{x:100,y:100},{x:200,y:200}]}];
 assert.deepEqual(m.hitTest(item,101,102),{id:a.id,kind:"handle",pointIndex:0});
 assert.deepEqual(m.hitTest(item,151,151),{id:a.id,kind:"body"});
 assert.equal(m.hitTest(item,15,17),null);
 const horizontal=[{drawing:drawing("Horizontal Line",[p(0,1.10)]),points:[{x:100,y:75}]}];
 assert.equal(m.hitTest(horizontal,250,77).kind,"body");
});
test("Renderer is anchored to imported chart coordinates and contains no broker/network calls",()=>{
 const src=fs.readFileSync(require.resolve("../xmi2-drawing-layer.js"),"utf8");
 const ui=fs.readFileSync(require.resolve("../../../public/xmi2/xmi2-chart-studio.js"),"utf8");
 const html=fs.readFileSync(require.resolve("../../../public/xmi2/chart-studio.html"),"utf8");
 assert.match(src,/coordinateToLogical/);
 assert.match(src,/priceToCoordinate/);
 assert.match(src,/subscribeVisibleLogicalRangeChange/);
 assert.match(src,/setPointerCapture/);
 assert.match(src,/svg\("svg"/);
 assert.match(src,/Long \/ Short Risk Reward/);
 assert.match(ui,/undoDrawing/);
 assert.match(ui,/redoDrawing/);
 assert.match(ui,/exportDrawings/);
 assert.match(ui,/importDrawings/);
 assert.match(html,/xmi2-drawings\.js/);
 assert.match(html,/xmi2-drawing-layer\.js/);
 for(const forbidden of ["fetch(","placeOrder","TRADING_ENABLED","DATABASE_URL","WebSocket","/api/xmi2-forex"])
  assert.equal(src.includes(forbidden),false);
});

test("Confirmed-swing Fib anchors require alternating, right-confirmed price pivots",()=>{
 const swings=[
  {kind:"H",time:stamp+300,price:1.20,confirmedAt:stamp+900},
  {kind:"L",time:stamp+1200,price:1.10,confirmedAt:stamp+1800},
  {kind:"H",time:stamp+2100,price:1.23,confirmedAt:stamp+2700}
 ];
 assert.deepEqual(m.confirmedSwingAnchors(swings,"Fib Retracement"),
  [{time:stamp+1200,price:1.10},{time:stamp+2100,price:1.23}]);
 assert.deepEqual(m.confirmedSwingAnchors(swings,"Trend-Based Fib Extension"),
  swings.map(s=>({time:s.time,price:s.price})));
 assert.equal(m.confirmedSwingAnchors(swings.slice(0,1),"Fib Extension"),null);
 assert.throws(()=>m.confirmedSwingAnchors(swings,"Place Order"),/Only Fibonacci/);
 assert.equal(m.confirmedSwingAnchors([
  {kind:"H",time:stamp,price:1.30,confirmedAt:stamp}
 ],"Fib Retracement"),null,"Unconfirmed pivot is not eligible");
});
