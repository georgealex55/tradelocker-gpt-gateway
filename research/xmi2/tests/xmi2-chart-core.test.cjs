const test=require("node:test"),assert=require("node:assert/strict");
const fs=require("node:fs"),path=require("node:path");
const core=require("../xmi2-chart-core.js");
const start=Date.parse("2026-10-28T15:00:00Z")/1000;
function b(i,overrides={}){return {time:start+i*300,open:1.10,high:1.105,low:1.095,close:1.101,volume:25,...overrides};}
function input(bars=Array.from({length:60},(_,i)=>b(i)),asOf=start+60*300){
 return {symbol:"FX:EURUSD",timeframe:"5m",asOf:new Date(asOf*1000).toISOString(),
  source:"user research file",bars};
}
test("Only qualified FX data with explicit source time can drive the studio",()=>{
 const result=core.normalize(input());
 assert.equal(result.symbol,"FX:EURUSD");assert.equal(result.origin,"user-import");
 assert.equal(result.bars.length,60);
 assert.ok(result.bars.every(x=>x.closed));
 assert.throws(()=>core.normalize({...input(),symbol:"EURUSD"}),/qualified forex/);
 assert.throws(()=>core.normalize({...input(),asOf:"2026-10-28T15:00:00"}),/source asOf/);
 assert.throws(()=>core.normalize({...input(),bars:[b(0),b(0)]}),/Unordered/);
 assert.throws(()=>core.normalize({...input(),bars:[b(0,{low:1.2}),b(1)]}),/Invalid OHLC/);
 assert.throws(()=>core.normalize({...input(),bars:[b(0,{volume:-1}),b(1)]}),/Invalid volume/);
 assert.throws(()=>core.normalize({...input(),bars:[b(0),b(100)]}),/future/);
});
test("Forming bar cannot be included in confirmed indicator or structure output",()=>{
 const data=core.normalize(input(Array.from({length:60},(_,i)=>b(i)),
  start+59*300+60));
 assert.equal(data.bars.at(-1).closed,false);
 const metrics=core.indicators(data.bars);
 assert.equal(metrics.closed.length,59);
 const withForming=core.structure(data.bars);
 const withoutForming=core.structure(data.bars.slice(0,-1));
 assert.deepEqual(withForming,withoutForming);
});
test("Five user-selected technical indicator families and 11 structure families are present",()=>{
 assert.deepEqual(core.TECH,["EMA","VWAP","RSI","MACD","Volume"]);
 assert.equal(core.SMC.length,11);
 assert.deepEqual(Object.keys(core.structure(core.normalize(input()).bars)).sort(),[...core.SMC].sort());
 const metrics=core.indicators(core.normalize(input()).bars);
 assert.ok(metrics.ema20.length>0);
 assert.ok(metrics.ema50.length>0);
 assert.equal(metrics.ema200.length,0);
 assert.ok(metrics.rsi.length>0);
 assert.ok(metrics.macd.length>0);
 assert.ok(metrics.vwap.length>0);
 assert.equal(metrics.volume.length,60);
});
test("Volume-absent forex data cannot yield a fake VWAP proxy",()=>{
 const data=core.normalize(input(Array.from({length:60},(_,i)=>b(i,{volume:null}))));
 const metrics=core.indicators(data.bars);
 assert.deepEqual(metrics.vwap,[]);
 assert.deepEqual(metrics.volume,[]);
});
test("BOS must confirm at a close beyond a previously confirmed pivot",()=>{
 const bars=Array.from({length:20},(_,i)=>b(i));
 bars[3]=b(3,{high:1.12});
 bars[8]=b(8,{high:1.125,close:1.118});
 bars[9]=b(9,{high:1.13,close:1.123});
 const result=core.structure(core.normalize(input(bars,start+20*300)).bars);
 const breakEvent=result.BOS.find(x=>x.side==="bull");
 assert.ok(breakEvent,"Confirmed upward break should be visible");
 assert.equal(breakEvent.time,start+9*300);
 assert.equal(breakEvent.price,1.12);
});
test("All six requested chart presentations exist; transformed HA differs from broker OHLC",()=>{
 const data=core.normalize(input([b(0,{open:1,close:1.1,high:1.2,low:.9}),
  b(1,{open:1.1,close:1.15,high:1.25,low:1.05})],start+600));
 assert.deepEqual(core.TYPES,["Candlesticks","Hollow Candles","Heikin Ashi","OHLC Bars","Line","Area"]);
 assert.equal(core.chartBars(data.bars,"Line")[0].value,1.1);
 assert.equal(core.chartBars(data.bars,"Area")[1].value,1.15);
 const ha=core.chartBars(data.bars,"Heikin Ashi");
 assert.notEqual(ha[0].close,data.bars[0].close);
 assert.throws(()=>core.chartBars(data.bars,"Renko"),/Unknown/);
});
test("Confirmed swing pivot timestamps include the closing time of the right-hand candle",()=>{
 const bars=Array.from({length:14},(_,i)=>b(i));
 bars[4]=b(4,{high:1.15});
 const points=core.pivots(core.normalize(input(bars,start+14*300)).bars);
 const pivot=points.find(x=>x.kind==="H"&&x.price===1.15);
 assert.ok(pivot);
 assert.equal(pivot.confirmedAt,start+7*300);
});
test("Static route links back to Neon XMI and never reads TradeLocker credentials",()=>{
 const main=fs.readFileSync(path.resolve(__dirname,"../index.html"),"utf8");
 const html=fs.readFileSync(path.resolve(__dirname,"../chart-studio.html"),"utf8");
 const script=fs.readFileSync(path.resolve(__dirname,"../xmi2-chart-studio.js"),"utf8");
 assert.match(main,/href="\/chart-studio.html"/);
 assert.match(html,/cdn.jsdelivr.net\/npm\/lightweight-charts@5\.2\.1/);
 assert.match(html,/TradingView/);
 assert.match(html,/Import historical OHLC JSON/);
 assert.match(html,/No broker feed is connected/);
 for(const forbidden of ["placeOrder","TRADING_ENABLED","ALPACA_API_KEY","DATABASE_URL","TRAD ELOCKER_PASSWORD"])
  assert.ok(!script.includes(forbidden),"No broker, private account or secret code in browser");
 assert.doesNotMatch(html,/https?:\/\/[^\s"'<>]*\/api\/xmi\/live/);
});
