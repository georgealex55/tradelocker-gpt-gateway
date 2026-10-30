import test from "node:test";
import assert from "node:assert/strict";
import {normalizeIndicatorSettings,DEFAULT_INDICATOR_SETTINGS} from "../lib/xmiIndicatorSettings.mjs";
import {computeFive} from "../lib/xmiLiveMath.mjs";
import {evaluateScalpResearch,normalizeScalpSettings,SCALP_PRESET_ID} from "../lib/xmiScalpResearch.mjs";
import {STRATEGIES} from "../lib/xmiStrategyPresets.mjs";
import {normalizeStrategyEdit} from "../lib/xmiStrategyEdits.mjs";
import {stackChartMarkers} from "../lib/xmiIndicatorMarkers.mjs";
import {mapStructureToChart} from "../lib/xmiStructure.mjs";
const t=Date.parse("2026-10-29T00:00:00Z")/1000;
function prices(n=270){return Array.from({length:n},(_,i)=>{
 const close=1.1+i*.00002+Math.sin(i/7)*.0001;
 return {time:t+i*300,open:close-.00003,close,high:close+.0001,low:close-.0001,volume:30+i%10,closed:true};
});}
test("All study parameters are bounded, normalized and preserve defaults",()=>{
 const d=normalizeIndicatorSettings();
 assert.deepEqual(d,DEFAULT_INDICATOR_SETTINGS);
 const p=normalizeIndicatorSettings({emaFast:9,emaSlow:28,emaLong:100,rsiPeriod:10,macdFast:7,macdSlow:21,
  macdSignal:5,vwapSession:"weekly",volumeAverage:8,atrPeriod:7,adxPeriod:9,bbPeriod:10,
  bbDeviation:1.5,donchianPeriod:14,stochPeriod:9,stochSmooth:2,stochSignal:4});
 assert.equal(Object.keys(p).length,17);
 const stats=computeFive(prices(), "5m", (t+271*300)*1000,"broker-tick",p);
 assert.equal(stats.overlays.ema20[0].time,prices()[8].time);
 assert.equal(stats.overlays.ema50[0].time,prices()[27].time);
 assert.equal(stats.overlays.atr[0].time,prices()[7].time);
 assert.equal(stats.overlays.adx[0].time,prices()[17].time);
 assert.equal(stats.overlays.bbBasis[0].time,prices()[9].time);
 assert.equal(stats.overlays.donchianUpper[0].time,prices()[14].time);
 assert.equal(stats.overlays.volumeMA[0].time,prices()[7].time);
 assert.equal(stats.readiness.rsi,true);
 assert.equal(normalizeIndicatorSettings({emaFast:99}).emaFast,20);
 assert.equal(normalizeIndicatorSettings({bbDeviation:1000}).bbDeviation,2);
});
test("Custom studies and no-lookahead calculations preserve earlier results when future changes",()=>{
 const a=prices(),p=normalizeIndicatorSettings({atrPeriod:9,adxPeriod:10,rsiPeriod:11});
 const original=computeFive(a.slice(0,200),"5m",(t+200*300)*1000,"broker-tick",p);
 const future={...a[200],open:2,high:2.1,low:1.9,close:2};
 const changed=computeFive([...a.slice(0,200),future,...a.slice(201)],"5m",(t+271*300)*1000,"broker-tick",p);
 for(const key of ["ema20","rsi","adx","atr","bbUpper","donchianLower","stochD"]){
  const prior=original.overlays[key].filter(x=>x.time<a[199].time);
  const after=changed.overlays[key].filter(x=>x.time<a[199].time);
  assert.deepEqual(after,prior,key);
 }
});
test("EURUSD 5m + independently confirmed 15m research emits candidate and exit markers",()=>{
 const primary=Array.from({length:62},(_,i)=>({time:t+i*300,open:1.101,high:1.103,
  low:1.099,close:1.102,closed:true}));
 const higher=Array.from({length:62},(_,i)=>({time:t-62*900+i*900,closed:true}));
 const series=(bars,value)=>bars.map(b=>({time:b.time,value}));
 const p={bars:primary,overlays:{ema20:series(primary,1.1),ema50:series(primary,1.09),
  rsi:series(primary,60),adx:series(primary,30),atr:series(primary,.001)}};
 const h={bars:higher,overlays:{ema20:series(higher,1.1),ema50:series(higher,1.09)}};
 const config={adxMin:25,stopAtr:1.2,rewardRisk:1.5,maxHoldBars:2};
 const result=evaluateScalpResearch(p,h,config);
 assert.equal(result.ready,true);
 assert.ok(result.markers.some(x=>x.kind==="ENTRY"&&x.side==="LONG"));
 assert.ok(result.markers.some(x=>x.kind==="EXIT"&&x.reason==="STOP_TESTED"));
 const stack=stackChartMarkers([],[],{strategy:result.markers});
 assert.ok(stack.some(x=>x.source==="Strategy"&&x.label.includes("candidate")));
 assert.equal(STRATEGIES.find(x=>x.id===SCALP_PRESET_ID).pairs[0],"EURUSD");
 assert.equal(normalizeStrategyEdit(SCALP_PRESET_ID,{timeframe:"1m"}).timeframe,"5m");
 assert.equal(normalizeScalpSettings({stopAtr:100}).stopAtr,1.2);
 assert.equal(evaluateScalpResearch(p,null).ready,false);
 const trimmed=evaluateScalpResearch({...p,bars:primary.slice(0,10)},h);
 assert.equal(trimmed.ready,false);
});
test("Market-structure mapping never projects out-of-window events onto first candle",()=>{
 const bars=prices(40),step=300;
 const old={resolution:"5m",time:bars[0].time-900,confirmedAt:bars[0].time-600};
 const upcoming={resolution:"5m",time:bars.at(-1).time+900,confirmedAt:bars.at(-1).time+1200};
 assert.equal(mapStructureToChart(old,bars,"5m"),null);
 assert.equal(mapStructureToChart(upcoming,bars,"5m"),null);
 const within={resolution:"15m",time:bars[11].time,confirmedAt:bars[11].time+900};
 const mapped=mapStructureToChart(within,bars,"5m");
 assert.ok(mapped&&mapped.chartTime>=within.time);
 assert.ok(mapped.chartTime<=bars.at(-1).time);
});
