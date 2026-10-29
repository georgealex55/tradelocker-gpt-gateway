import test from "node:test";
import assert from "node:assert/strict";
import {parseHistoricalFile} from "../lib/xmiHistoricalFile.mjs";
import {evaluateStrategy} from "../lib/xmiStrategyPresets.mjs";
import {computeFive} from "../lib/xmiLiveMath.mjs";
const minute=60,now=1800000000000,until=Math.floor(now/1000/minute)*minute;
function bars(){return Array.from({length:260},(_,i)=>{
 const t=until-(260-i)*minute,base=1.1+i*0.00004;
 return {time:t,open:base,high:base+0.00015,low:base-0.00012,close:base+0.00004,volume:100+i};
});}
test("Manual historical OHLC file admits aligned finite candles without fetching",()=>{
 const json=JSON.stringify({symbol:"EURUSD",resolution:"1m",bars:bars()});
 const v=parseHistoricalFile(json,{symbol:"EURUSD",resolution:"1m",now});
 assert.equal(v.bars.length,260);
 assert.equal(v.bars.every(b=>b.closed),true);
 const stats=computeFive(v.bars,"1m",now,"provider");
 const report=evaluateStrategy("scalp",stats,"HISTORICAL");
 assert.equal(report.ready,true);
 assert.match(report.summary,/historical|offline/i);
});
test("Manual historical import rejects fake symbols, timeframe and malformed candles",()=>{
 const valid={symbol:"EURUSD",resolution:"1m",bars:bars()};
 for(const changed of [{...valid,symbol:"GBPUSD"},{...valid,resolution:"1H"},
  {...valid,bars:[{...bars()[0],close:100},bars()[1]]},
  {...valid,bars:bars().slice(0,1)}]){
  assert.throws(()=>parseHistoricalFile(JSON.stringify(changed),{symbol:"EURUSD",resolution:"1m",now}));
 }
 assert.throws(()=>parseHistoricalFile("not-json",{symbol:"EURUSD",resolution:"1m",now}));
 assert.throws(()=>parseHistoricalFile("x".repeat(900001),{symbol:"EURUSD",resolution:"1m",now}));
});
test("Raw imported duplicate timestamps reject rather than hide OHLC differences",()=>{
 const input=bars(),copy={...input[55],high:input[55].high+0.00005};
 for(const duplicate of [copy,{...copy,time:input[55].time*1000}]){
  const data=JSON.stringify({symbol:"EURUSD",resolution:"1m",bars:[...input.slice(0,56),duplicate,...input.slice(56)]});
  assert.throws(()=>parseHistoricalFile(data,{symbol:"EURUSD",resolution:"1m",now}),/Duplicate imported candle timestamps/);
 }
});
test("Production live-broker adapter remains locked; refresh does not enable trading",async()=>{
 const {previewEnabled}=await import("../lib/xmiLiveProvider.mjs");
 assert.equal(previewEnabled({VERCEL_ENV:"production",XMI_READONLY_MARKET_DATA_ENABLED:"true"}),false);
 const {XMI_CROSS_PROJECT_BRIDGE_APPROVED}=await import("../lib/xmiBridgePolicy.mjs");
 assert.equal(XMI_CROSS_PROJECT_BRIDGE_APPROVED,false);
});
