/* Read-only XMI chart drawing model. Browser + Node, no external I/O. */
(function(root,factory){
 const out=factory();
 if(typeof module==="object"&&module.exports)module.exports=out;
 if(root)root.XMIDrawingTools=out;
})(typeof window!=="undefined"?window:null,function(){
 "use strict";
 const TOOLS=Object.freeze({
  Annotations:["Text labels","Arrows","Rectangles and highlight boxes","Freehand drawing"],
  Patterns:["Double Top / Bottom","Head & Shoulders / Inverse","Triangles","Flags / Pennants","Wedges","Channels","Triple Top / Bottom"],
  Fibonacci:["Fib Retracement","Fib Extension","Trend-Based Fib Extension"],
  Lines:["Trendline","Horizontal Line","Vertical Line","Ray","Parallel Channel"],
  Measurements:["Price / Pip Ruler","Date / Bar Ruler","Long / Short Risk Reward","Percent Change"]
 });
 const ALL=Object.freeze(Object.values(TOOLS).flat());
 const MAX_DRAWINGS=150,MAX_POINTS=300;
 const RATES=Object.freeze([0,.236,.382,.5,.618,.786,1,1.272,1.618]);
 function clicks(tool){
  if(!ALL.includes(tool))throw Error("Unsupported drawing tool");
  if(tool==="Freehand drawing")return 0;
  if(["Text labels","Horizontal Line","Vertical Line"].includes(tool))return 1;
  if(["Parallel Channel","Trend-Based Fib Extension","Long / Short Risk Reward","Double Top / Bottom"].includes(tool))return 3;
  if(["Triangles","Flags / Pennants","Wedges","Channels"].includes(tool))return 4;
  if(["Head & Shoulders / Inverse","Triple Top / Bottom"].includes(tool))return 5;
  return 2;
 }
 function point(p){
  if(!p||!Number.isFinite(p.time)||p.time<=0||!Number.isFinite(p.price)||p.price<=0||
   p.time>1e13||p.price>1e12)throw Error("Invalid price/time drawing point");
  return {time:p.time,price:p.price};
 }
 function validate(input){
  if(!Array.isArray(input)||input.length>MAX_DRAWINGS)throw Error("Invalid drawing count");
  const ids=new Set();
  return input.map(d=>{
   if(!d||typeof d!=="object"||typeof d.id!=="string"||!/^[a-zA-Z0-9_-]{1,64}$/.test(d.id)||
    ids.has(d.id)||typeof d.symbol!=="string"||!/^FX:[A-Z]{6}$/.test(d.symbol)||
    !ALL.includes(d.tool)||!Array.isArray(d.points)||d.points.length<1||
    d.points.length>MAX_POINTS||
    (d.tool==="Freehand drawing"&&d.points.length<2)||
    (d.tool!=="Freehand drawing"&&d.points.length!==clicks(d.tool))||
    (d.text!=null&&(typeof d.text!=="string"||d.text.length>100))||
    (d.color!=null&&!/^#[0-9a-f]{6}$/i.test(d.color)))
    throw Error("Invalid drawing record");
   ids.add(d.id);
   const points=d.points.map(point);
   return {id:d.id,symbol:d.symbol,tool:d.tool,points,
    text:String(d.text||"").slice(0,100),color:d.color||"#65d1e7"};
  });
 }
 function symbolDrawings(drawings,symbol){return validate(drawings).filter(d=>d.symbol===symbol);}
 function serialize(drawings){return JSON.stringify({format:"xmi-drawings/v2",drawings:validate(drawings)},null,2);}
 function deserialize(raw){
  if(typeof raw!=="string"||raw.length>250000)throw Error("Invalid drawing file size");
  const parsed=JSON.parse(raw);
  if(parsed?.format!=="xmi-drawings/v2")throw Error("Unsupported drawing file format");
  return validate(parsed.drawings);
 }
 function fibonacci(d){
  const [a,b,c]=d.points;
  if(!a||!b)return [];
  const origin=d.tool==="Fib Retracement"?b.price:
   d.tool==="Trend-Based Fib Extension"?(c?.price??b.price):a.price;
  const sign=d.tool==="Fib Retracement"?-1:1;
  return RATES.map(level=>({level,price:origin+sign*(b.price-a.price)*level}));
 }
 function confirmedSwingAnchors(pivots,tool){
  if(!TOOLS.Fibonacci.includes(tool))throw Error("Only Fibonacci supports swing anchors");
  if(!Array.isArray(pivots))throw Error("Invalid pivot set");
  const n=tool==="Trend-Based Fib Extension"?3:2,ordered=pivots.filter(p=>
   p&&(p.kind==="H"||p.kind==="L")&&Number.isFinite(p.time)&&
   Number.isFinite(p.price)&&Number.isFinite(p.confirmedAt)&&
   p.confirmedAt>p.time&&p.price>0).sort((a,b)=>a.confirmedAt-b.confirmedAt);
  const chosen=[];
  for(let i=ordered.length-1;i>=0&&chosen.length<n;i--){
   const item=ordered[i];
   if((!chosen.length||chosen.at(-1).kind!==item.kind)&&
      !chosen.some(x=>x.time===item.time))chosen.push(item);
  }
  if(chosen.length<n)return null;
  return chosen.reverse().map(p=>point({time:p.time,price:p.price}));
 }
 function pipSize(symbol){return /^FX:[A-Z]{3}JPY$/.test(symbol)?.01:.0001;}
 function metrics(d,step=60){
  const [a,b,c]=d.points,delta=a&&b?b.price-a.price:0;
  const result={priceDelta:delta,percent:a?delta/a.price*100:0,pips:Math.abs(delta)/pipSize(d.symbol),
   elapsedSeconds:a&&b?Math.abs(b.time-a.time):0,
   bars:a&&b&&step>0?Math.abs(b.time-a.time)/step:0};
  if(d.tool==="Long / Short Risk Reward"&&c){
   const risk=Math.abs(a.price-b.price),reward=Math.abs(c.price-a.price);
   result.risk= risk;result.reward=reward;result.ratio=risk>0?reward/risk:null;
   result.direction=c.price>=a.price?"long":"short";
  }
  return result;
 }
 function distance(x,y,a,b){
  const dx=b.x-a.x,dy=b.y-a.y,len=dx*dx+dy*dy;
  const t=len?Math.max(0,Math.min(1,((x-a.x)*dx+(y-a.y)*dy)/len)):0;
  return Math.hypot(x-a.x-t*dx,y-a.y-t*dy);
 }
 function hitTest(projected,x,y,tolerance=12){
  // Projected entries are {drawing,points:[{x,y}...]}, sorted oldest to newest.
  for(let i=projected.length-1;i>=0;i--){
   const d=projected[i],p=d.points;
   for(let k=0;k<p.length;k++)if(Math.hypot(x-p[k].x,y-p[k].y)<=tolerance)
    return {id:d.drawing.id,kind:"handle",pointIndex:k};
   for(let k=1;k<p.length;k++)if(distance(x,y,p[k-1],p[k])<=tolerance)
    return {id:d.drawing.id,kind:"body"};
   if(d.drawing.tool==="Horizontal Line"&&Math.abs(y-p[0]?.y)<=tolerance)
    return {id:d.drawing.id,kind:"body"};
   if(d.drawing.tool==="Vertical Line"&&Math.abs(x-p[0]?.x)<=tolerance)
    return {id:d.drawing.id,kind:"body"};
  }
  return null;
 }
 return Object.freeze({TOOLS,ALL,MAX_DRAWINGS,MAX_POINTS,RATES,clicks,point,
  validate,symbolDrawings,serialize,deserialize,fibonacci,confirmedSwingAnchors,pipSize,metrics,hitTest});
});
