/* Optional v5 Lightweight Charts price-pane drawing primitive. Never touches brokerage routes. */
import {TOOL_CATALOG} from "./xmiChartTools.mjs";
const accent="#5ec9ea";
const levels=[0,.236,.382,.5,.618,.786,1,1.272,1.618];
function finite(x){return typeof x==="number"&&Number.isFinite(x);}
export function drawingTooltip(item){
 const points=item.points||[];
 if(points.length<2)return item.tool;
 const a=points[0],b=points.at(-1),diff=b.price-a.price;
 const pct=(diff/a.price*100).toFixed(2);
 const pips=Math.abs(diff)/(a.price>20?.01:.0001);
 return item.tool+": "+(diff>=0?"+":"")+diff.toFixed(5)+" ("+pct+"%, "+pips.toFixed(1)+" approx. pips)";
}
export class XMIDrawingPrimitive{
 constructor(){this.chart=null;this.series=null;this.request=null;this.items=[];}
 attached({chart,series,requestUpdate}){this.chart=chart;this.series=series;this.request=requestUpdate;}
 detached(){this.chart=null;this.series=null;this.request=null;}
 setDrawings(items){this.items=Array.isArray(items)?items:[];this.request?.();}
 updateAllViews(){}
 paneViews(){return [{zOrder:()=>"top",renderer:()=>({draw:t=>{try{this.draw(t);}catch{ /* optional overlay isolation */ }}})}];}
 draw(target){
  if(!this.chart||!this.series||!this.items.length)return;
  const scale=this.chart.timeScale();
  target.useMediaCoordinateSpace(({context:ctx,mediaSize})=>{
   for(const d of this.items){
    const pts=d.points?.map(p=>({x:scale.timeToCoordinate(p.time),y:this.series.priceToCoordinate(p.price)}))||[];
    if(!pts.length||pts.some(p=>p.x==null||p.y==null))continue;
    const type=d.tool;
    ctx.save();ctx.lineWidth=1.5;ctx.strokeStyle=type.startsWith("Fib")?"#e6b966":accent;
    ctx.fillStyle=accent;ctx.font="11px sans-serif";
    const first=pts[0],last=pts.at(-1);
    if(type==="Text labels"){
     ctx.fillText((d.text||"Note").slice(0,80),first.x+5,first.y-8);
    }else if(["Horizontal Line","Vertical Line","Ray","Trendline","Extended Line"].includes(type)){
     const end=type==="Horizontal Line"?{x:mediaSize.width,y:first.y}:
      type==="Vertical Line"?{x:first.x,y:mediaSize.height}:last;
     ctx.beginPath();ctx.moveTo(type==="Horizontal Line"?0:first.x,type==="Vertical Line"?0:first.y);
     ctx.lineTo(end.x,end.y);ctx.stroke();
     if(type==="Ray"&&pts.length>=2){ctx.setLineDash([5,4]);ctx.beginPath();
      ctx.moveTo(end.x,end.y);ctx.lineTo(end.x+(end.x-first.x)*2,end.y+(end.y-first.y)*2);ctx.stroke();}
    }else if(type==="Rectangles and highlight boxes"){
     ctx.fillStyle="rgba(94,201,234,.12)";ctx.fillRect(first.x,first.y,last.x-first.x,last.y-first.y);
     ctx.strokeRect(first.x,first.y,last.x-first.x,last.y-first.y);
    }else if(type==="Arrows"){
     ctx.beginPath();ctx.moveTo(first.x,first.y);ctx.lineTo(last.x,last.y);ctx.stroke();
     const angle=Math.atan2(last.y-first.y,last.x-first.x);ctx.beginPath();
     ctx.moveTo(last.x,last.y);ctx.lineTo(last.x-10*Math.cos(angle-.5),last.y-10*Math.sin(angle-.5));
     ctx.lineTo(last.x-10*Math.cos(angle+.5),last.y-10*Math.sin(angle+.5));ctx.closePath();ctx.fill();
    }else if(TOOL_CATALOG.Fibonacci.includes(type)){
     const a=d.points[0],b=d.points[1];if(!a||!b){ctx.restore();continue;}
     const anchor=type==="Trend-Based Fib Extension"?(d.points[2]?.price??b.price):a.price;
     for(const ratio of levels){
      const value=type==="Fib Retracement"?b.price-(b.price-a.price)*ratio:
       anchor+(b.price-a.price)*ratio;
      const y=this.series.priceToCoordinate(value);if(y==null)continue;
      ctx.globalAlpha=.65;ctx.beginPath();ctx.setLineDash([4,4]);ctx.moveTo(Math.min(first.x,last.x),y);
      ctx.lineTo(mediaSize.width-6,y);ctx.stroke();ctx.setLineDash([]);
      ctx.fillText((ratio*100).toFixed(1)+"% · "+value.toFixed(5),Math.min(mediaSize.width-120,Math.max(4,last.x)),y-3);
     }
    }else if(type==="Parallel Channel"&&pts.length>=3){
     const [a,b,c]=pts;ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);
     ctx.moveTo(c.x,c.y);ctx.lineTo(c.x+b.x-a.x,c.y+b.y-a.y);ctx.stroke();
     ctx.fillStyle="rgba(94,201,234,.06)";ctx.beginPath();
     ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.lineTo(c.x+b.x-a.x,c.y+b.y-a.y);
     ctx.lineTo(c.x,c.y);ctx.closePath();ctx.fill();
    }else if(type==="Long / Short Risk Reward"&&pts.length>=3){
     const entry=pts[0],stop=pts[1],take=pts[2];
     ctx.fillStyle="rgba(230,126,138,.14)";ctx.fillRect(entry.x,entry.y,mediaSize.width-entry.x,stop.y-entry.y);
     ctx.fillStyle="rgba(58,192,151,.14)";ctx.fillRect(entry.x,entry.y,mediaSize.width-entry.x,take.y-entry.y);
     ctx.strokeStyle="#e6bc80";ctx.beginPath();ctx.moveTo(entry.x,entry.y);ctx.lineTo(mediaSize.width,entry.y);ctx.stroke();
     const risk=Math.abs(d.points[0].price-d.points[1].price),reward=Math.abs(d.points[2].price-d.points[0].price);
     ctx.fillStyle="#e9e4c5";ctx.fillText("R:R "+(risk?reward/risk:0).toFixed(2)+" : 1 · hypothetical",entry.x+5,entry.y-7);
    }else{
     ctx.beginPath();ctx.moveTo(first.x,first.y);
     for(let i=1;i<pts.length;i++)ctx.lineTo(pts[i].x,pts[i].y);
     ctx.stroke();
     if(TOOL_CATALOG.Measurements.includes(type)&&pts.length>=2){
      const pct=((d.points.at(-1).price-d.points[0].price)/d.points[0].price*100).toFixed(2);
      const secs=Math.abs(d.points.at(-1).time-d.points[0].time);
      const diff=Math.abs(d.points.at(-1).price-d.points[0].price);
      const pip=diff/(d.points[0].price>20?.01:.0001);
      const label=type==="Date / Bar Ruler"?(secs/60).toFixed(0)+" minutes":
       type==="Percent Change"?pct+"%":pip.toFixed(1)+" approximate pips / "+pct+"%";
      ctx.fillText(label,last.x+5,last.y-8);
     }else if(TOOL_CATALOG.Patterns.includes(type)){
      ctx.fillText(type.slice(0,28)+(d.auto?" · detected":" · manual"),last.x+5,last.y-8);
     }
    }
    ctx.restore();
   }
  });
 }
}
