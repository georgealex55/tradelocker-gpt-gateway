import test from "node:test";
import assert from "node:assert/strict";
import {computeFive} from "../lib/xmiLiveMath.mjs";
import {computeAdvancedIndicators} from "../lib/xmiAdvancedIndicators.mjs";
import {buildIndicatorMarkers,combineChartMarkers} from "../lib/xmiIndicatorMarkers.mjs";
import {STRATEGIES,evaluateStrategy} from "../lib/xmiStrategyPresets.mjs";
import {normalizeStrategyEdit} from "../lib/xmiStrategyEdits.mjs";
import {nextFeedDelay} from "../lib/xmiFeedRecovery.mjs";
import {validateChartSettings,DEFAULT_CHART_SETTINGS,DEFAULT_TECH} from "../lib/xmiChartTools.mjs";
const start=Date.parse("2026-10-26T00:00:00Z")/1000;
const bars=Array.from({length:260},(_,i)=>{
 const base=1.12+i*.00003+Math.sin(i/8)*.00022;
 return {time:start+i*300,open:base-.00002,high:base+.00008,low:base-.00008,
  close:base,volume:20+i%9,closed:true};
});
const now=(bars.at(-1).time+300)*1000;
const value=(data,key)=>data[key].at(-1)?.value;
test("Additional indicators warm up causally and remain within their mathematical domains",()=>{
 const a=computeAdvancedIndicators(bars);
 assert.equal(a.atr[0].time,bars[14].time);
 assert.equal(a.adx[0].time,bars[27].time);
 assert.equal(a.bbUpper[0].time,bars[19].time);
 assert.equal(a.donchianUpper[0].time,bars[20].time);
 assert.equal(a.stochK[0].time,bars[15].time);
 assert.equal(a.stochD[0].time,bars[17].time);
 assert.ok(value(a,"bbUpper")>value(a,"bbBasis"));
 assert.ok(value(a,"bbBasis")>value(a,"bbLower"));
 assert.ok(value(a,"atr")>0);
 assert.ok(value(a,"adx")>=0&&value(a,"adx")<=100);
 assert.ok(value(a,"stochK")>=0&&value(a,"stochK")<=100);
 assert.equal(a.donchianUpper[0].value,Math.max(...bars.slice(0,20).map(b=>b.high)));
 const stats=computeFive(bars,"5m",now);
 for(const k of ["atr","adx","bbUpper","bbBasis","bbLower","donchianUpper","donchianLower","stochK","stochD"])
  assert.ok(stats.overlays[k].length>0,k+" must integrate into the existing overlay contract");
 assert.equal(stats.readiness.adx,true);
});
test("Appended extreme future data cannot repaint the historic indicator values",()=>{
 const base=computeAdvancedIndicators(bars.slice(0,230));
 const future={...bars[230],close:2,open:2,high:2.1,low:1.9};
 const changed=computeAdvancedIndicators([...bars.slice(0,230),future,...bars.slice(231)]);
 for(const name of Object.keys(base))assert.deepEqual(changed[name].filter(x=>x.time<=bars[229].time),base[name]);
});
test("Marker events use closed bars only and collapse to at most one dot per timestamp",()=>{
 const s=computeFive(bars,"5m",now),partial={...bars.at(-1),time:bars.at(-1).time+300,closed:false};
 const input=[...s.bars,partial],opts={mode:"full",palette:"vivid",
  enabled:{ADX:true,Donchian:true,Bollinger:true,Stochastic:true}};
 const markers=buildIndicatorMarkers(input,s.overlays,opts);
 assert.ok(markers.every(x=>x.time<partial.time));
 const extra=[{time:bars[220].time,position:"aboveBar",shape:"arrowDown",color:"#fff",text:"X"}];
 const compact=combineChartMarkers(extra,markers,"compact");
 assert.equal(new Set(compact.map(x=>x.time)).size,compact.length);
 assert.ok(compact.every(x=>x.shape==="circle"&&x.text===""));
 assert.equal(combineChartMarkers(extra,markers,"off").length,0);
 assert.throws(()=>buildIndicatorMarkers(input,s.overlays,{mode:"flash"}),/Invalid/);
});
test("Pair-specific strategy requires exact FX instrument and causal strength/ATR thresholds",()=>{
 const all=STRATEGIES.filter(x=>x.pairs&&x.id!=="eur-scalp-5m");
 assert.deepEqual(all.map(x=>x.pairs[0]),["EURUSD","GBPUSD","USDJPY"]);
 const stats=computeFive(bars,"5m",now);
 for(const preset of all){
  assert.equal(evaluateStrategy(preset.id,stats,"CURRENT",null,"AUDUSD").ready,false);
  assert.equal(evaluateStrategy(preset.id,stats,"CURRENT",null,"AUDUSD").state,"PAIR_NOT_APPLICABLE");
  const config=normalizeStrategyEdit(preset.id,{adxMin:22,atrMinPips:2});
  const model=evaluateStrategy(preset.id,stats,"CURRENT",config,preset.pairs[0]);
  assert.equal(model.barTime,bars.at(-1).time);
  assert.ok(model.inputs.some(x=>x.name==="ADX 14 strength"));
  assert.ok(model.inputs.some(x=>x.name==="ATR 14 pips"));
  assert.doesNotMatch(JSON.stringify(model),/placeOrder|executeTrade|predictiveReturn/);
  assert.equal(normalizeStrategyEdit(preset.id,{adxMin:999,atrMinPips:55}).adxMin,20);
 }
});
test("Responsive polling is optional, visible-only and retains bounded exponential backoff",()=>{
 assert.ok(nextFeedDelay({resolution:"1m",profile:"responsive",now})<
  nextFeedDelay({resolution:"1m",profile:"balanced",now}));
 assert.ok(nextFeedDelay({resolution:"1m",profile:"responsive",hidden:true,now})>=120000);
 assert.ok(nextFeedDelay({resolution:"1m",profile:"responsive",failures:4,now})>6000);
 const settings=validateChartSettings({...DEFAULT_CHART_SETTINGS,
  markerStyle:"full",markerPalette:"contrast",refreshProfile:"responsive"});
 assert.equal(settings.markerStyle,"full");
 assert.throws(()=>validateChartSettings({...settings,refreshProfile:"streaming"}),/Invalid/);
 assert.equal(DEFAULT_TECH.ATR,false);
});
