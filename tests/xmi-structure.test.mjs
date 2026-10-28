import test from "node:test";
import assert from "node:assert/strict";
import {FX_RESOLUTIONS} from "../lib/xmiLiveMath.mjs";
import {STRUCTURE_CONCEPTS,STRUCTURE_IDS,defaultStructureSettings,setStructureOption,
 validateStructureSettings,requiredStructureTimeframes,detectStructure,mapStructureToChart,
 assembleStructure,MAX_STRUCTURE_PER_CONCEPT} from "../lib/xmiStructure.mjs";
import {structurePalette,toStructureMarkers} from "../lib/xmiStructureOverlay.mjs";
const start=Date.parse("2026-10-26T00:00:00Z")/1000;
const mk=(index,o=100,h=101,l=99,c=100,step=60)=>({
 time:start+index*step,open:o,high:h,low:l,close:c,volume:20
});
test("The specified eleven independent concepts default to chart-visible 5m",()=>{
 assert.equal(STRUCTURE_CONCEPTS.length,11);
 for(const id of ["BOS","CHoCH","FVG","Order Blocks","Liquidity Sweeps",
  "HH / HL / LH / LL","Support / Resistance","MSS",
  "Premium / Discount","Displacement","Session High / Low"])assert.ok(STRUCTURE_IDS.includes(id));
 const c=defaultStructureSettings();
 assert.equal(Object.keys(c).length,11);
 assert.ok(Object.values(c).every(x=>x.enabled&&x.resolution==="5m"));
 assert.deepEqual(requiredStructureTimeframes(c,"5m"),[]);
});
test("Every SMC concept may have a different timeframe; disabled concepts never fetch",()=>{
 let c=defaultStructureSettings();
 c=setStructureOption(c,"BOS",{resolution:"1H"});
 c=setStructureOption(c,"CHoCH",{resolution:"15m"});
 c=setStructureOption(c,"FVG",{resolution:"1H"});
 c=setStructureOption(c,"Session High / Low",{enabled:false,resolution:"4H"});
 assert.deepEqual(requiredStructureTimeframes(c,"5m"),["1H","15m"]);
 assert.equal(c.BOS.enabled,true);
 assert.equal(c["Session High / Low"].enabled,false);
 assert.throws(()=>setStructureOption(c,"Unknown",{enabled:true}),/Unknown/);
 assert.throws(()=>setStructureOption(c,"BOS",{resolution:"7m"}),/Unsupported/);
 assert.throws(()=>validateStructureSettings({}),/Invalid/);
});
test("No structure from a forming candle, FVG appears after its exact candle close",()=>{
 const bars=Array.from({length:8},(_,i)=>mk(i));
 bars.push(mk(8,103,104,102,103));
 const forming=detectStructure(bars,"1m",(start+8*60+30)*1000);
 const closed=detectStructure(bars,"1m",(start+9*60)*1000);
 assert.equal(forming.events.FVG.length,0);
 assert.ok(closed.events.FVG.some(x=>x.direction==="bull"));
 assert.equal(closed.events.FVG.at(-1).confirmedAt,start+9*60);
 assert.equal(closed.events.FVG.at(-1).zone.bottom,101);
 assert.equal(closed.events.FVG.at(-1).zone.top,102);
 assert.equal(closed.events.FVG.at(-1).resolution,"1m");
});
test("A BOS requires a confirmed pivot and a CLOSING break, not wick-only",()=>{
 const bars=Array.from({length:11},(_,i)=>mk(i));
 bars[3]=mk(3,100,105,99,100);
 bars[7]=mk(7,100,107,99,104); // wick through 105, close below
 bars[8]=mk(8,104,108,103,106); // closing break > 105
 const result=detectStructure(bars,"1m",(start+11*60)*1000);
 const bos=result.events.BOS.find(x=>x.direction==="bull");
 assert.ok(bos);
 assert.equal(bos.time,start+8*60);
 assert.equal(bos.level,105);
 assert.ok(result.events["Liquidity Sweeps"].some(x=>x.time===start+7*60));
});
test("Displacement is determined by previously closed candle ranges, not a volume feed",()=>{
 const bars=Array.from({length:12},(_,i)=>mk(i));
 bars[10]=mk(10,101,112,100,111);
 const s=detectStructure(bars,"1m",(start+12*60)*1000);
 assert.ok(s.events.Displacement.find(e=>e.time===start+10*60));
 assert.equal(s.events.Displacement.find(e=>e.time===start+10*60).direction,"bull");
});
test("Completed UTC reference session levels do not use partial sessions",()=>{
 const bars=Array.from({length:12},(_,i)=>mk(i,100,101+i*.1,99-i*.1,100,3600));
 const before=detectStructure(bars.slice(0,8),"1H",(start+8*3600)*1000);
 const after=detectStructure(bars,"1H",(start+12*3600)*1000);
 assert.equal(before.events["Session High / Low"].length,0);
 assert.ok(after.events["Session High / Low"].find(e=>e.summary.includes("Asia")));
});
test("Higher-timeframe annotation never appears before the HTF close",()=>{
 const event={time:start+12*3600,confirmedAt:start+13*3600,resolution:"1H",concept:"BOS",level:105};
 const earlier=[{time:start+12*3600+50*60,closed:true}];
 const confirmation=[...earlier,{time:start+12*3600+55*60,closed:true}];
 assert.equal(mapStructureToChart(event,earlier,"5m"),null);
 const mapped=mapStructureToChart(event,confirmation,"5m");
 assert.equal(mapped.chartTime,start+12*3600+55*60);
 assert.equal(mapStructureToChart(event,confirmation.map(x=>({...x,closed:false})),"5m"),null);
});
test("Only enabled concepts appear; missing source is explicitly unavailable",()=>{
 let c=defaultStructureSettings();
 c=setStructureOption(c,"BOS",{resolution:"1H"});
 c=setStructureOption(c,"FVG",{enabled:false});
 const display=Array.from({length:20},(_,i)=>({...mk(i,100,101,99,100,300),closed:true}));
 const result=assembleStructure(c,{"5m":{structure:detectStructure(display,"5m",
  (start+21*300)*1000)}}, "5m",display);
 assert.ok(result.unavailable.some(x=>x.concept==="BOS"&&x.resolution==="1H"));
 assert.ok(!result.unavailable.some(x=>x.concept==="FVG"));
 assert.equal(result.annotations.filter(x=>x.concept==="FVG").length,0);
});
test("Annotations are capped to five per concept and have safe chart marker attributes",()=>{
 const bars=Array.from({length:90},(_,i)=>mk(i,i%2?110:100,i%2?112:102,
  i%2?99:90,i%2?111:91));
 const result=detectStructure(bars,"1m",(start+90*60)*1000);
 for(const id of STRUCTURE_IDS)assert.ok(result.events[id].length<=MAX_STRUCTURE_PER_CONCEPT);
 const markers=toStructureMarkers([{
  chartTime:start+60,label:"FVG",concept:"FVG",resolution:"1H",direction:"bull"
 }]);
 assert.equal(markers.length,1);
 assert.equal(markers[0].shape,"arrowUp");
 assert.equal(markers[0].position,"belowBar");
 assert.match(structurePalette("bull").fill,/rgba/);
});
