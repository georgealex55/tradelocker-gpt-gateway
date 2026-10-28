/* Deterministic, read-only market-structure observations.
 * All pivots are confirmed with two right-hand CLOSED bars. Signals never trade.
 * These are heuristic definitions, not an institutional order-flow feed.
 */
import {FX_RESOLUTIONS,normalizeBars,validateResolution} from "./xmiLiveMath.mjs";
export const STRUCTURE_CONCEPTS=Object.freeze([
 {id:"BOS",label:"BOS",description:"Close beyond an established swing in the existing structure direction"},
 {id:"CHoCH",label:"CHoCH",description:"Close beyond an established swing opposite the previous structure trend"},
 {id:"FVG",label:"FVG",description:"Three-candle price imbalance, not a guaranteed fill"},
 {id:"Order Blocks",label:"Order Blocks",description:"Last opposite candle before a qualifying displacement break (heuristic)"},
 {id:"Liquidity Sweeps",label:"Liquidity Sweeps",description:"Wick beyond a confirmed swing, followed by a close back inside"},
 {id:"HH / HL / LH / LL",label:"HH / HL / LH / LL",description:"Confirmed higher/lower swing highs and lows"},
 {id:"Support / Resistance",label:"Support / Resistance",description:"Levels based on confirmed swing points"},
 {id:"MSS",label:"MSS",description:"Opposing structure break accompanied by displacement"},
 {id:"Premium / Discount",label:"Premium / Discount",description:"Price relative to midpoint of latest confirmed swing range"},
 {id:"Displacement",label:"Displacement",description:"Wide directional candle relative to preceding closed bars"},
 {id:"Session High / Low",label:"Session High / Low",description:"Completed UTC reference-session high and low; not DST-adjusted"}
]);
export const STRUCTURE_IDS=Object.freeze(STRUCTURE_CONCEPTS.map(x=>x.id));
export const DEFAULT_STRUCTURE_TIMEFRAME="5m";
export const MAX_STRUCTURE_PER_CONCEPT=5;
export const STRUCTURE_TIMEFRAMES=Object.freeze(Object.keys(FX_RESOLUTIONS));
export function defaultStructureSettings(){
 return Object.fromEntries(STRUCTURE_IDS.map(id=>[id,{enabled:true,resolution:DEFAULT_STRUCTURE_TIMEFRAME}]));
}
export function validateStructureSettings(raw){
 if(!raw||typeof raw!=="object"||Array.isArray(raw))throw Error("Invalid structure settings");
 return Object.fromEntries(STRUCTURE_IDS.map(id=>{
  const item=raw[id];if(!item||typeof item.enabled!=="boolean")throw Error("Invalid "+id+" setting");
  return [id,{enabled:item.enabled,resolution:validateResolution(item.resolution)}];
 }));
}
export function setStructureOption(settings,id,update){
 if(!STRUCTURE_IDS.includes(id))throw Error("Unknown market-structure concept");
 const prev=validateStructureSettings(settings);
 return validateStructureSettings({...prev,[id]:{...prev[id],...update}});
}
export function requiredStructureTimeframes(settings,chartResolution){
 validateResolution(chartResolution);
 const clean=validateStructureSettings(settings);
 return [...new Set(STRUCTURE_IDS.filter(id=>clean[id].enabled&&clean[id].resolution!==chartResolution)
  .map(id=>clean[id].resolution))];
}
function make(id,bar,direction,summary,other={}){
 return {id,time:bar.time,direction,summary,...other};
}
function rangeBefore(bars,i,n=12){
 const prev=bars.slice(Math.max(0,i-n),i);
 return prev.length<5?null:prev.reduce((s,b)=>s+(b.high-b.low),0)/prev.length;
}
function displaced(bars,i){
 const b=bars[i],avg=rangeBefore(bars,i);
 return avg!==null&&b.high-b.low>=avg*1.5&&Math.abs(b.close-b.open)>=.55*(b.high-b.low);
}
function swing(bars,i,kind,left=2,right=2){
 const k=kind==="high"?"high":"low",center=bars[i];
 if(i<left||i+right>=bars.length)return false;
 for(let n=i-left;n<=i+right;n++){
  if(n===i)continue;
  if(kind==="high"&&bars[n][k]>=center[k])return false;
  if(kind==="low"&&bars[n][k]<=center[k])return false;
 }
 return true;
}
const SESSIONS=[
 {name:"Asia",start:0,end:8},{name:"London",start:8,end:16},{name:"New York",start:13,end:22}
];
function detectSessions(bars,put){
 const size=bars.length<2?0:bars[1].time-bars[0].time;
 // 1H and faster only; UTC reference windows are not local exchange times.
 if(size===0||size>3600)return;
 const firstDay=Math.floor(bars[0].time/86400),lastDay=Math.floor(bars.at(-1).time/86400);
 for(let day=firstDay;day<=lastDay;day++){
  for(const s of SESSIONS){
   const from=day*86400+s.start*3600,to=day*86400+s.end*3600;
   const within=bars.filter(b=>b.time>=from&&b.time+size<=to);
   const subsequent=bars.find(b=>b.time>=to);
   if(!within.length||!subsequent)continue;
   // Only post-closure confirmed values; never use partial live session as completed.
   const hi=Math.max(...within.map(b=>b.high)),lo=Math.min(...within.map(b=>b.low));
   put("Session High / Low",make("Session High / Low",subsequent,"neutral",s.name+
    " session completed (UTC reference); high "+hi+" / low "+lo,{
     high:hi,low:lo,zone:{top:hi,bottom:lo,from:subsequent.time,kind:"range"},label:s.name+" H/L"
   }));
  }
 }
}
export function detectStructure(input,resolution,asOf=Date.now()){
 const bars=normalizeBars(input,resolution,asOf).filter(x=>x.closed);
 const events=Object.fromEntries(STRUCTURE_IDS.map(id=>[id,[]]));
 const put=(id,item)=>{events[id].push({...item,concept:id,resolution});};
 if(bars.length<8)return {events,completedBars:bars.length,latestClosed:bars.at(-1)?.time??null};
 let lastHigh=null,lastLow=null,prevHigh=null,prevLow=null,trend=null;
 let brokenHighTime=null,brokenLowTime=null,lastPremium=null;
 for(let i=0;i<bars.length;i++){
  const b=bars[i],before=bars[i-1];
  // A pivot at i-2 only becomes available after this bar has closed.
  const pivot=i-2;
  if(pivot>=2&&swing(bars,pivot,"high")){
   prevHigh=lastHigh;lastHigh={price:bars[pivot].high,time:bars[pivot].time};
   if(prevHigh){
    const name=lastHigh.price>prevHigh.price?"HH":"LH";
    put("HH / HL / LH / LL",make("HH / HL / LH / LL",b,name,name+" confirmed at "+lastHigh.price,{
     level:lastHigh.price,origin:lastHigh.time,label:name}));
   }
   put("Support / Resistance",make("Support / Resistance",b,"resistance",
    "Confirmed resistance swing at "+lastHigh.price,{
     level:lastHigh.price,origin:lastHigh.time,label:"R"}));
  }
  if(pivot>=2&&swing(bars,pivot,"low")){
   prevLow=lastLow;lastLow={price:bars[pivot].low,time:bars[pivot].time};
   if(prevLow){
    const name=lastLow.price>prevLow.price?"HL":"LL";
    put("HH / HL / LH / LL",make("HH / HL / LH / LL",b,name,name+" confirmed at "+lastLow.price,{
     level:lastLow.price,origin:lastLow.time,label:name}));
   }
   put("Support / Resistance",make("Support / Resistance",b,"support",
    "Confirmed support swing at "+lastLow.price,{
     level:lastLow.price,origin:lastLow.time,label:"S"}));
  }
  if(i<5||!before)continue;
  const impulse=displaced(bars,i),bull=b.close>b.open;
  if(impulse)put("Displacement",make("Displacement",b,bull?"bull":"bear",
   "Wide "+(bull?"bullish":"bearish")+" candle closed relative to the prior 12-bar range",{
     label:"DSP",level:b.close}));
  const sweptHigh=lastHigh&&b.high>lastHigh.price&&b.close<lastHigh.price;
  const sweptLow=lastLow&&b.low<lastLow.price&&b.close>lastLow.price;
  if(sweptHigh)put("Liquidity Sweeps",make("Liquidity Sweeps",b,"bear",
    "Price swept confirmed swing high "+lastHigh.price+" and closed back below",{
     label:"SWP",level:lastHigh.price,origin:lastHigh.time}));
  if(sweptLow)put("Liquidity Sweeps",make("Liquidity Sweeps",b,"bull",
    "Price swept confirmed swing low "+lastLow.price+" and closed back above",{
     label:"SWP",level:lastLow.price,origin:lastLow.time}));
  // Require a CLOSE past a previously confirmed pivot; a wick does not confirm.
  const crossedHigh=lastHigh&&before.close<=lastHigh.price&&b.close>lastHigh.price&&lastHigh.time!==brokenHighTime;
  const crossedLow=lastLow&&before.close>=lastLow.price&&b.close<lastLow.price&&lastLow.time!==brokenLowTime;
  if(crossedHigh||crossedLow){
   const direction=crossedHigh?"bull":"bear",pivotRef=crossedHigh?lastHigh:lastLow;
   const reversal=trend!==null&&trend!==direction;
   const concept=reversal?"CHoCH":"BOS";
   put(concept,make(concept,b,direction,concept+" confirmed on closed candle beyond "+pivotRef.price,{
    label:concept,level:pivotRef.price,origin:pivotRef.time
   }));
   if(reversal&&impulse)put("MSS",make("MSS",b,direction,
    "Opposing closed-candle swing break with displacement",{
     label:"MSS",level:pivotRef.price,origin:pivotRef.time}));
   if(impulse){
    for(let j=i-1;j>=Math.max(0,i-5);j--){
     const candidate=bars[j],opposing=direction==="bull"?candidate.close<candidate.open:candidate.close>candidate.open;
     if(opposing){
      put("Order Blocks",make("Order Blocks",b,direction,
       "Heuristic last opposing candle before displacement "+direction+" break",{
        label:"OB",origin:candidate.time,level:candidate.close,
        zone:{top:candidate.high,bottom:candidate.low,from:candidate.time,kind:"block"}
       }));
      break;
     }
    }
   }
   trend=direction;
   if(crossedHigh)brokenHighTime=lastHigh.time;
   if(crossedLow)brokenLowTime=lastLow.time;
  }
  // 3 CLOSED candle imbalance: third candle does not overlap first candle.
  if(i>=2){
   const first=bars[i-2],third=b,avg=rangeBefore(bars,i);
   if(avg!==null){
    if(third.low>first.high&&third.low-first.high>=avg*.10)
     put("FVG",make("FVG",b,"bull","Bullish three-candle price gap "+first.high+"–"+third.low,{
      label:"FVG",zone:{bottom:first.high,top:third.low,from:first.time,kind:"gap"}}));
    if(third.high<first.low&&first.low-third.high>=avg*.10)
     put("FVG",make("FVG",b,"bear","Bearish three-candle price gap "+third.high+"–"+first.low,{
      label:"FVG",zone:{bottom:third.high,top:first.low,from:first.time,kind:"gap"}}));
   }
  }
  // Premium/discount midpoint of most recently CONFIRMED swing extremes.
  if(lastHigh&&lastLow&&lastHigh.price>lastLow.price){
   const midpoint=(lastHigh.price+lastLow.price)/2;
   const state=b.close>midpoint?"premium":b.close<midpoint?"discount":"equilibrium";
   if(state!=="equilibrium"&&state!==lastPremium){
    const isPremium=state==="premium";
    put("Premium / Discount",make("Premium / Discount",b,isPremium?"bear":"bull",
     "Closed in "+state+" half of latest confirmed swing range",{
      label:isPremium?"PREM":"DISC",level:midpoint,zone:{
       top:isPremium?lastHigh.price:midpoint,bottom:isPremium?midpoint:lastLow.price,
       from:b.time,kind:"range"}
     }));
   }
   lastPremium=state;
  }
 }
 detectSessions(bars,put);
 for(const id of STRUCTURE_IDS)events[id]=events[id].sort((a,b)=>a.time-b.time).slice(-MAX_STRUCTURE_PER_CONCEPT);
 return {events,completedBars:bars.length,latestClosed:bars.at(-1)?.time??null};
}
// Map a confirmation time to the first chart candle existing at/after that timestamp.
// The original event timestamp is retained for the intelligence panel.
export function mapStructureToChart(event,displayBars){
 if(!event||!Array.isArray(displayBars)||!displayBars.length)return null;
 const aligned=displayBars.find(x=>x.time>=event.time);
 if(!aligned)return null; // Higher-timeframe confirmation beyond displayed data.
 const baseTime=event.zone?.from??event.origin??event.time;
 const from=displayBars.find(x=>x.time>=baseTime)?.time??aligned.time;
 return {...event,chartTime:aligned.time,chartFrom:from};
}
export function assembleStructure(settings,byResolution,chartResolution,displayBars){
 const config=validateStructureSettings(settings);
 const annotations=[],summaries=[],unavailable=[];
 for(const id of STRUCTURE_IDS){
  if(!config[id].enabled)continue;
  const res=config[id].resolution;
  const source=byResolution[res];
  if(!source||source.error){
   unavailable.push({concept:id,resolution:res,reason:source?.error||"No verified candles"});
   continue;
  }
  const result=source.structure;
  const recent=result?.events?.[id]||[];
  for(const item of recent){
   const projected=mapStructureToChart(item,displayBars);
   if(projected)annotations.push(projected);
  }
  if(recent.length)summaries.push({concept:id,resolution:res,event:recent.at(-1)});
 }
 annotations.sort((a,b)=>a.chartTime-b.chartTime||STRUCTURE_IDS.indexOf(a.concept)-STRUCTURE_IDS.indexOf(b.concept));
 summaries.sort((a,b)=>b.event.time-a.event.time);
 return {annotations,summaries,unavailable};
}
