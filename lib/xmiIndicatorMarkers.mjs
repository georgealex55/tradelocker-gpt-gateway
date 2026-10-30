/* Non-repainting chart annotations: only confirmed closed candle timestamps.
 * One event per bar avoids the stacked-marker collisions of a multi-indicator chart.
 * Shapes use public Lightweight Charts 5.x marker types.
 */
export const MARKER_STYLES=Object.freeze(["compact","full","off"]);
export const MARKER_PALETTES=Object.freeze(["vivid","contrast"]);
const PALETTE=Object.freeze({
 vivid:{up:"#25d6ab",down:"#ff5b8a",strength:"#f6c65b",momentum:"#9c84ff"},
 contrast:{up:"#24b9ff",down:"#ffab37",strength:"#fae36f",momentum:"#e595fa"}
});
const val=(rows,time)=>rows?.findLast?.(x=>x.time<=time)?.value??null;
export function buildIndicatorMarkers(bars,overlays,{mode="compact",palette="vivid",enabled={}}={}){
 if(!MARKER_STYLES.includes(mode)||!MARKER_PALETTES.includes(palette))throw Error("Invalid marker display");
 if(mode==="off"||!Array.isArray(bars)||!overlays)return [];
 const closed=bars.filter(x=>x?.closed===true).slice(-160),colors=PALETTE[palette],out=[];
 for(let i=1;i<closed.length;i++){
  const b=closed[i],prior=closed[i-1],events=[];
  const dUpper=val(overlays.donchianUpper,b.time),dLower=val(overlays.donchianLower,b.time);
  const dUpPrev=val(overlays.donchianUpper,prior.time),dLowPrev=val(overlays.donchianLower,prior.time);
  if(enabled.Donchian&&dUpper!=null&&dUpPrev!=null&&prior.close<=dUpPrev&&b.close>dUpper)
   events.push({name:"Donchian ↑",tone:"up",position:"belowBar",shape:"arrowUp",priority:5});
  if(enabled.Donchian&&dLower!=null&&dLowPrev!=null&&prior.close>=dLowPrev&&b.close<dLower)
   events.push({name:"Donchian ↓",tone:"down",position:"aboveBar",shape:"arrowDown",priority:5});
  const adx=val(overlays.adx,b.time),adxPrior=val(overlays.adx,prior.time);
  if(enabled.ADX&&adx!=null&&adxPrior!=null&&adxPrior<25&&adx>=25)
   events.push({name:"ADX 25+",tone:"strength",position:"aboveBar",shape:"square",priority:3});
  const upper=val(overlays.bbUpper,b.time),lower=val(overlays.bbLower,b.time);
  const upperPrior=val(overlays.bbUpper,prior.time),lowerPrior=val(overlays.bbLower,prior.time);
  if(enabled.Bollinger&&upper!=null&&upperPrior!=null&&prior.close<=upperPrior&&b.close>upper)
   events.push({name:"BB ↑",tone:"momentum",position:"aboveBar",shape:"circle",priority:1});
  if(enabled.Bollinger&&lower!=null&&lowerPrior!=null&&prior.close>=lowerPrior&&b.close<lower)
   events.push({name:"BB ↓",tone:"momentum",position:"belowBar",shape:"circle",priority:1});
  const k=val(overlays.stochK,b.time),d=val(overlays.stochD,b.time);
  const oldK=val(overlays.stochK,prior.time),oldD=val(overlays.stochD,prior.time);
  if(enabled.Stochastic&&k!=null&&d!=null&&oldK!=null&&oldD!=null){
   if(oldK<=oldD&&k>d&&k<=25)
    events.push({name:"Stoch ↑",tone:"up",position:"belowBar",shape:"circle",priority:2});
   if(oldK>=oldD&&k<d&&k>=75)
    events.push({name:"Stoch ↓",tone:"down",position:"aboveBar",shape:"circle",priority:2});
  }
  if(!events.length)continue;
  events.sort((a,b)=>b.priority-a.priority);
  const e=events[0];
  out.push({time:b.time,position:e.position,
   color:colors[e.tone],shape:mode==="compact"?"circle":e.shape,
   size:mode==="compact"?0.5:1.2,...(mode==="full"?{text:e.name}:{}),
   event:e.name});
 }
 return out.slice(-65);
}
export function combineChartMarkers(structure,technical,mode="compact"){
 if(mode==="off")return [];
 const merged=[...technical,...structure].sort((a,b)=>a.time-b.time);
 const seen=new Set();
 return merged.filter(x=>{
  const key=String(x.time);if(seen.has(key))return false;
  seen.add(key);return true;
 }).map(({event,...marker})=>mode==="compact"?{...marker,shape:"circle",size:0.5,text:""}:marker);
}
