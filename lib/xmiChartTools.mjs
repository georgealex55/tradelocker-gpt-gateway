/* Read-only chart workbench configuration, drawings and confirmed-price patterns. */
export const CHART_TYPES=Object.freeze(["Candlesticks","Hollow Candles","Heikin Ashi","OHLC Bars","Line","Area"]);
export const TOOL_CATALOG=Object.freeze({
 Annotations:["Text labels","Arrows","Rectangles and highlight boxes","Freehand drawing"],
 Patterns:["Double Top / Bottom","Head & Shoulders / Inverse","Triangles","Flags / Pennants","Wedges","Channels","Triple Top / Bottom"],
 Fibonacci:["Fib Retracement","Fib Extension","Trend-Based Fib Extension"],
 Lines:["Trendline","Horizontal Line","Vertical Line","Ray","Parallel Channel"],
 Measurements:["Price / Pip Ruler","Date / Bar Ruler","Long / Short Risk Reward","Percent Change"]
});
export const PANEL_NAMES=Object.freeze(["Indicators",...Object.keys(TOOL_CATALOG),"Chart Settings"]);
export const DEFAULT_TECH=Object.freeze({EMA:true,VWAP:true,RSI:true,MACD:true,Volume:true});
export const DEFAULT_CHART_SETTINGS=Object.freeze({
 theme:"dark",grid:true,crosshair:true,timezone:"UTC",scale:"normal",
 precision:5,wicks:true,borders:false,priceLine:true,bidAsk:false,
 syncTimeframes:false,indicatorDefaults:true,chartType:"Candlesticks",
 bull:"#2ab7a0",bear:"#ec7780"
});
export const DRAW_LIMIT=150,MAX_POINTS=600;
export function validateChartSettings(raw){
 const base={...DEFAULT_CHART_SETTINGS,...raw};
 const enums={theme:["dark","light"],timezone:["UTC","America/New_York","Europe/London","Asia/Tokyo"],
 scale:["normal","log"],chartType:CHART_TYPES,precision:[2,3,4,5,6]};
 for(const [key,allowed] of Object.entries(enums))
  if(!allowed.includes(base[key]))throw Error("Invalid chart setting: "+key);
 for(const key of ["grid","crosshair","wicks","borders","priceLine","bidAsk","syncTimeframes","indicatorDefaults"])
  if(typeof base[key]!=="boolean")throw Error("Invalid chart setting: "+key);
 for(const key of ["bull","bear"])
  if(!/^#[0-9a-f]{6}$/i.test(base[key]))throw Error("Invalid chart color");
 return base;
}
export function validateChartOverrides(raw){
 if(!raw||typeof raw!=="object"||Array.isArray(raw))throw Error("Invalid chart overrides");
 const clean={};
 for(const [slot,changes] of Object.entries(raw)){
  if(!/^[0-3]$/.test(slot)||!changes||typeof changes!=="object"||Array.isArray(changes))
   throw Error("Invalid chart override slot");
  const allowed=Object.keys(DEFAULT_CHART_SETTINGS);
  if(Object.keys(changes).some(k=>!allowed.includes(k)))throw Error("Unknown chart override");
  validateChartSettings(changes);
  clean[slot]={...changes};
 }
 return clean;
}
export function resolveChartSettings(global,overrides,slot){
 return validateChartSettings({...global,...(overrides?.[slot]||{})});
}
export function heikinAshi(bars){
 let priorOpen,priorClose;
 return bars.map((b,i)=>{
  const close=(b.open+b.high+b.low+b.close)/4;
  const open=i===0?(b.open+b.close)/2:(priorOpen+priorClose)/2;
  priorOpen=open;priorClose=close;
  return {time:b.time,open,high:Math.max(b.high,open,close),low:Math.min(b.low,open,close),close};
 });
}
export function chartSeriesData(bars,type){
 if(!CHART_TYPES.includes(type))throw Error("Unsupported chart type");
 if(type==="Heikin Ashi")return heikinAshi(bars);
 if(["Line","Area"].includes(type))return bars.map(b=>({time:b.time,value:b.close}));
 return bars.map(({time,open,high,low,close})=>({time,open,high,low,close}));
}
export function requiredClicks(tool){
 if(["Text labels","Horizontal Line","Vertical Line"].includes(tool))return 1;
 if(["Parallel Channel","Long / Short Risk Reward","Trend-Based Fib Extension"].includes(tool))return 3;
 if(tool==="Freehand drawing")return 0;
 if(tool==="Head & Shoulders / Inverse"||tool==="Triple Top / Bottom")return 5;
 if(["Triangles","Flags / Pennants","Wedges","Channels"].includes(tool))return 4;
 if(tool==="Double Top / Bottom")return 3;
 return 2;
}
export function drawingPoint(time,price){
 if(!Number.isSafeInteger(time)||time<=0||!Number.isFinite(price)||price<=0)throw Error("Invalid drawing coordinates");
 return {time,price};
}
export function validateDrawings(input){
 if(!Array.isArray(input)||input.length>DRAW_LIMIT)throw Error("Too many drawings");
 const available=Object.values(TOOL_CATALOG).flat();
 return input.map(d=>{
  if(!d||!available.includes(d.tool)||typeof d.symbol!=="string"||
    !/^[A-Z]{6}$/.test(d.symbol)||!Array.isArray(d.points)||d.points.length>MAX_POINTS||
    d.points.length<1||typeof d.id!=="string"||d.id.length>80||
    (d.text!=null&&(typeof d.text!=="string"||d.text.length>100)))throw Error("Invalid drawing");
  return {id:d.id,tool:d.tool,symbol:d.symbol,
   points:d.points.map(p=>drawingPoint(p.time,p.price)),text:d.text||""};
 });
}
export function drawingsForSymbol(all,symbol){return validateDrawings(all).filter(d=>d.symbol===symbol);}
export function serializeWorkspace(drawings,settings,tech,overrides={}){
 return JSON.stringify({version:1,drawings:validateDrawings(drawings),
  settings:validateChartSettings(settings),overrides:validateChartOverrides(overrides),technical:Object.fromEntries(Object.keys(DEFAULT_TECH)
   .map(k=>[k,Boolean(tech[k])]))},null,2);
}
export function deserializeWorkspace(s){
 if(typeof s!=="string"||s.length>350000)throw Error("Invalid chart workspace file size");
 const data=JSON.parse(s);
 if(data.version!==1)throw Error("Unsupported chart workspace version");
 return {drawings:validateDrawings(data.drawings),settings:validateChartSettings(data.settings),
  overrides:validateChartOverrides(data.overrides??{}),technical:Object.fromEntries(Object.keys(DEFAULT_TECH).map(k=>[k,Boolean(data.technical?.[k])]))};
}
export function detectedPivots(bars){
 const closed=bars.filter(x=>x.closed!==false);
 const pivots=[];
 for(let i=2;i+2<closed.length;i++){
  const w=closed.slice(i-2,i+3),b=closed[i];
  if(w.every((c,j)=>j===2||c.high<b.high))pivots.push({time:b.time,confirmedAt:closed[i+2].time,type:"H",price:b.high});
  if(w.every((c,j)=>j===2||c.low>b.low))pivots.push({time:b.time,confirmedAt:closed[i+2].time,type:"L",price:b.low});
 }
 return pivots.sort((a,b)=>a.time-b.time);
}
export function autoFibonacci(bars,tool){
 if(!TOOL_CATALOG.Fibonacci.includes(tool))return null;
 const pivots=detectedPivots(bars);
 const last=pivots.at(-1),opposite=pivots.slice(0,-1).reverse().find(x=>x.type!==last?.type);
 if(!last||!opposite)return null;
 const points=tool==="Trend-Based Fib Extension"?
  [pivots.slice(0,-2).reverse().find(x=>x.type===last.type),opposite,last].filter(Boolean):
  [opposite,last];
 if(points.length<(tool==="Trend-Based Fib Extension"?3:2))return null;
 return {tool,points:points.map(x=>({time:x.time,price:x.price})),
  confirmedAt:Math.max(...points.map(x=>x.confirmedAt))};
}
function near(a,b,tolerance){return Math.abs(a-b)<=Math.max(Math.abs(a),Math.abs(b))*.5*tolerance;}
function fitLine(points){
 const n=points.length,sx=points.reduce((a,p)=>a+p.time,0),sy=points.reduce((a,p)=>a+p.price,0);
 const mx=sx/n,my=sy/n;
 const varx=points.reduce((a,p)=>a+(p.time-mx)**2,0);
 const slope=varx?points.reduce((a,p)=>a+(p.time-mx)*(p.price-my),0)/varx:0;
 return {slope,intercept:my-slope*mx};
}
export function detectClassicPatterns(input){
 const bars=input.filter(b=>b.closed===true);
 if(bars.length<15)return [];
 const pivots=detectedPivots(bars);
 const out=[];
 const recent=pivots.slice(-40);
 const push=(name,seq,explanation)=>{
  if(!seq.length)return;
  const anchor=seq.at(-1);
  // Never emit patterns without confirmed post-pivot closing bars.
  if(anchor.confirmedAt>bars.at(-1).time)return;
  out.push({id:name+":"+anchor.confirmedAt,concept:name,confirmedAt:anchor.confirmedAt,
   points:seq.map(p=>({time:p.time,price:p.price})),summary:explanation+" · completed pivots, not a trade signal"});
 };
 const threshold=.018;
 for(let i=4;i<recent.length;i++){
  const p=recent.slice(i-4,i+1), types=p.map(x=>x.type).join("");
  if(types==="HLHLH"||types==="LHLHL"){
   const highs=p.filter(x=>x.type==="H"),lows=p.filter(x=>x.type==="L");
   if(highs.length===3&&near(highs[0].price,highs[2].price,threshold)&&
      highs[1].price>Math.max(highs[0].price,highs[2].price)*1.002)
    push("Head & Shoulders / Inverse",p,"Head-and-shoulders-style swing configuration");
   if(lows.length===3&&near(lows[0].price,lows[2].price,threshold)&&
      lows[1].price<Math.min(lows[0].price,lows[2].price)*.998)
    push("Head & Shoulders / Inverse",p,"Inverse-head-and-shoulders-style swing configuration");
   if(highs.length===3&&highs.every(h=>near(h.price,highs[0].price,.012)))
    push("Triple Top / Bottom",p,"Repeated three-swing resistance peaks");
   if(lows.length===3&&lows.every(l=>near(l.price,lows[0].price,.012)))
    push("Triple Top / Bottom",p,"Repeated three-swing support troughs");
  }
  const tri=p.slice(-3),pattern=tri.map(x=>x.type).join("");
  if(pattern==="HLH"&&near(tri[0].price,tri[2].price,.012))
   push("Double Top / Bottom",tri,"Two nearby swing highs with intervening low");
  if(pattern==="LHL"&&near(tri[0].price,tri[2].price,.012))
   push("Double Top / Bottom",tri,"Two nearby swing lows with intervening high");
  const four=p.slice(-4),hs=four.filter(x=>x.type==="H"),ls=four.filter(x=>x.type==="L");
  if(hs.length===2&&ls.length===2){
   const upper=fitLine(hs),lower=fitLine(ls);
   const dt=four.at(-1).time-four[0].time||1;
   const highSlope=upper.slope*dt,lowSlope=lower.slope*dt;
   const movement=Math.abs(four[0].price)*.002;
   if(highSlope<-movement&&lowSlope>movement)
    push("Triangles",four,"Converging confirmed swing highs and lows");
   if(Math.abs(highSlope-lowSlope)<movement&&Math.abs(highSlope)>movement)
    push("Channels",four,"Near-parallel sloping swing boundaries");
   if(highSlope<0&&lowSlope<0&&Math.abs(highSlope-lowSlope)>movement)
    push("Wedges",four,"Descending converging swing boundaries");
   if(highSlope>0&&lowSlope>0&&Math.abs(highSlope-lowSlope)>movement)
    push("Wedges",four,"Ascending converging swing boundaries");
   if(Math.abs(highSlope)<movement&&Math.abs(lowSlope)<movement&&p.length>=5)
    push("Flags / Pennants",four,"Short consolidation after preceding swings (heuristic)");
  }
 }
 const seen=new Set();
 return out.sort((a,b)=>b.confirmedAt-a.confirmedAt).filter(x=>{
  if(seen.has(x.id))return false;seen.add(x.id);return true;
 }).slice(0,30);
}
