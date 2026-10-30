import test from "node:test";
import assert from "node:assert/strict";
import {computeChartAlgorithms} from "../lib/xmiChartAlgorithms.mjs";
import {stackChartMarkers,markerSeriesPayload,buildIndicatorMarkers} from "../lib/xmiIndicatorMarkers.mjs";
import {validateChartSettings,DEFAULT_CHART_SETTINGS,serializeWorkspace,deserializeWorkspace,DEFAULT_TECH} from "../lib/xmiChartTools.mjs";
const first=Date.parse("2026-10-23T00:00:00Z")/1000;
const bars=Array.from({length:130},(_,i)=>{const close=1.2+i*.00007+Math.sin(i/5)*.0004;
 return {time:first+i*300,open:close-.00003,high:close+.00008,low:close-.00008,
  close,volume:20,closed:true};});
test("Rolling regression and ATR bands use only previously known candles",()=>{
 const out=computeChartAlgorithms(bars,{mode:"both",window:50,multiplier:2});
 assert.equal(out.regression.length,81);
 assert.equal(out.regression[0].time,bars[49].time);
 assert.equal(out.atrUpper[0].time,bars[15].time);
 assert.ok(out.regUpper.every((x,i)=>x.value>=out.regression[i].value));
 assert.ok(out.regLower.every((x,i)=>x.value<=out.regression[i].value));
 const now=bars.slice(0,110);
 const prior=computeChartAlgorithms(now,{mode:"both",window:50,multiplier:2});
 const next={...bars[110],close:2,open:2,high:2.1,low:1.9};
 const future=computeChartAlgorithms([...now,next,...bars.slice(111)],{mode:"both",window:50,multiplier:2});
 for(const k of Object.keys(prior))assert.deepEqual(future[k].filter(v=>v.time<=now.at(-1).time),prior[k],k);
});
test("Forming candles do not contaminate algorithm output and settings fail closed",()=>{
 const forming={...bars.at(-1),time:bars.at(-1).time+300,closed:false,close:10,high:12};
 const a=computeChartAlgorithms(bars,{mode:"both",window:20,multiplier:1.5});
 const b=computeChartAlgorithms([...bars,forming],{mode:"both",window:20,multiplier:1.5});
 assert.deepEqual(a,b);
 assert.deepEqual(computeChartAlgorithms(bars,{mode:"off"}).regression,[]);
 assert.throws(()=>computeChartAlgorithms(bars,{mode:"future-lookahead"}),/Invalid/);
 assert.throws(()=>computeChartAlgorithms(bars,{window:51}),/Invalid/);
 assert.throws(()=>computeChartAlgorithms([...bars].reverse(),{mode:"both"}),/Invalid/);
});
test("Multiple simultaneous marker events stack without overwriting and click toggles label",()=>{
 const t=bars[110].time;
 const structures=[{time:t,event:"BOS",text:"BOS 5m",position:"aboveBar",shape:"arrowUp",color:"#ff0"}];
 const technical=[
  {time:t,event:"Donchian ↑",position:"belowBar",shape:"arrowUp",color:"#0f0"},
  {time:t,event:"ADX 25+",position:"aboveBar",shape:"square",color:"#f0f"},
  {time:t,event:"Stoch ↑",position:"belowBar",shape:"circle",color:"#00f"}
 ];
 const dots=stackChartMarkers(structures,technical);
 assert.equal(dots.length,4);
 assert.ok(dots.every(x=>x.time===t&&x.shape==="circle"&&x.text===""));
 assert.equal(new Set(dots.map(x=>x.id)).size,4);
 const expanded=stackChartMarkers(structures,technical,{expandedId:dots[2].id});
 assert.equal(expanded.filter(x=>x.text!=="").length,1);
 assert.equal(expanded.find(x=>x.id===dots[2].id).text,dots[2].label);
 assert.deepEqual(markerSeriesPayload(expanded)[0]&&Object.keys(markerSeriesPayload(expanded)[0]).sort(),
  ["color","id","position","shape","size","text","time"].sort());
 assert.equal(stackChartMarkers(structures,technical,{mode:"off"}).length,0);
});
test("Stack overflow retains total event count and never consumes unclosed data",()=>{
 const t=bars[90].time;
 const events=Array.from({length:20},(_,i)=>({time:t,event:"Event "+i,color:"#abc",shape:"circle"}));
 const stacked=stackChartMarkers([],events,{maxPerBar:5});
 assert.equal(stacked.length,5);
 assert.equal(stacked[4].stackTotal,20);
 assert.match(stacked[4].label,/\+16 more/);
 const forming={...bars.at(-1),time:bars.at(-1).time+300,closed:false};
 const a=buildIndicatorMarkers([...bars,forming],{adx:[],donchianUpper:[],donchianLower:[],bbUpper:[],bbLower:[],stochK:[],stochD:[]},
  {enabled:{ADX:true,Donchian:true}});
 assert.ok(a.every(x=>x.time<forming.time));
});
test("Saved chart settings preserve local toggles, log axis, algorithms and smooth pan",()=>{
 const opts=validateChartSettings({...DEFAULT_CHART_SETTINGS,scale:"log",
  markerADX:false,markerDonchian:false,algorithmMode:"both",algorithmWindow:100,
  algorithmMultiplier:1.5,kineticScroll:false});
 const json=serializeWorkspace([],opts,DEFAULT_TECH,{});
 const restored=deserializeWorkspace(json);
 assert.equal(restored.settings.scale,"log");
 assert.equal(restored.settings.markerADX,false);
 assert.equal(restored.settings.algorithmMode,"both");
 assert.equal(restored.settings.algorithmWindow,100);
 assert.equal(restored.settings.kineticScroll,false);
 assert.throws(()=>validateChartSettings({...opts,algorithmMultiplier:99}),/Invalid chart setting/);
 assert.throws(()=>validateChartSettings({...opts,markerStructure:"sure"}),/Invalid chart setting/);
});
