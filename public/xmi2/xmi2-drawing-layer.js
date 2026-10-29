/* SVG drawing plane bound to Lightweight Charts price/time coordinates.
 * It projects saved source timestamps at any imported timeframe without
 * manufacturing candle prices. Active drawing/select mode intercepts input.
 */
(function(root,factory){
 const layer=factory();
 if(typeof module==="object"&&module.exports)module.exports=layer;
 if(root)root.XMIDrawingLayer=layer;
})(typeof window!=="undefined"?window:null,function(){
 "use strict";
 const ns="http://www.w3.org/2000/svg";
 const M=()=>window.XMIDrawingTools;
 const C={annotation:"#66d2ed",fib:"#eac077",measure:"#b5d99a",risk:"#efa9ae"};
 function svg(tag,attrs={},text){
  const el=document.createElementNS(ns,tag);
  for(const [key,value] of Object.entries(attrs))if(value!=null)el.setAttribute(key,String(value));
  if(text!==undefined)el.textContent=String(text);
  return el;
 }
 function append(parent,tag,attrs,text){
  const e=svg(tag,attrs,text);parent.append(e);return e;
 }
 function fmt(price){return Number(price).toFixed(price>20?3:5);}
 function label(group,x,y,text,color="#dbe9f5"){
  if(!Number.isFinite(x)||!Number.isFinite(y))return;
  const safe=String(text).slice(0,100),px=Math.max(6,x+5),py=Math.max(15,y-8);
  append(group,"text",{x:px,y:py,fill:color,"font-family":"system-ui,sans-serif",
   "font-size":11,stroke:"#091728","stroke-width":3,"paint-order":"stroke"},safe);
 }
 function line(group,a,b,color="#69cde0",width=1.6,dashed=false){
  append(group,"line",{x1:a.x,y1:a.y,x2:b.x,y2:b.y,stroke:color,
   "stroke-width":width,"stroke-dasharray":dashed?"5 4":null});
 }
 function path(group,pts,color,fill="none"){
  if(!pts.length)return;
  append(group,"polyline",{points:pts.map(p=>p.x+","+p.y).join(" "),stroke:color,
   "stroke-width":1.7,fill,"stroke-linejoin":"round","stroke-linecap":"round"});
 }
 function bounds(a,b){return {x:Math.min(a.x,b.x),y:Math.min(a.y,b.y),
  w:Math.abs(a.x-b.x),h:Math.abs(a.y-b.y)};}
 function drawShape(root,d,p,w,h,scalePrice,step){
  const group=append(root,"g",{"data-drawing-id":d.id});
  const kind=d.tool,a=p[0],b=p[1],c=p[2],last=p.at(-1);
  if(!a)return;
  const color=d.color||C.annotation;
  if(kind==="Text labels"){label(group,a.x,a.y,d.text||"Note",color);return;}
  if(kind==="Horizontal Line"){line(group,{x:0,y:a.y},{x:w,y:a.y},color);label(group,10,a.y,fmt(d.points[0].price),color);return;}
  if(kind==="Vertical Line"){line(group,{x:a.x,y:0},{x:a.x,y:h},color);label(group,a.x,20,new Date(d.points[0].time*1000).toISOString().slice(0,16),color);return;}
  if(kind==="Rectangles and highlight boxes"&&b){
   const {x,y,w:rw,h:rh}=bounds(a,b);
   append(group,"rect",{x,y,width:rw,height:rh,fill:color,"fill-opacity":.13,stroke:color,"stroke-width":1.4});return;
  }
  if(kind==="Arrows"&&b){
   line(group,a,b,color,2);
   const angle=Math.atan2(b.y-a.y,b.x-a.x);
   append(group,"path",{d:"M "+b.x+" "+b.y+" L "+(b.x-12*Math.cos(angle-.5))+" "+(b.y-12*Math.sin(angle-.5))+
    " L "+(b.x-12*Math.cos(angle+.5))+" "+(b.y-12*Math.sin(angle+.5))+" Z",fill:color});return;
  }
  if(kind==="Trendline"&&b){line(group,a,b,color,2);return;}
  if(kind==="Ray"&&b){
   line(group,a,{x:a.x+(b.x-a.x)*Math.max(1,w/Math.max(1,Math.abs(b.x-a.x))),
    y:a.y+(b.y-a.y)*Math.max(1,w/Math.max(1,Math.abs(b.x-a.x)))},color,2);return;
  }
  if(kind==="Parallel Channel"&&b&&c){
   const other={x:c.x+b.x-a.x,y:c.y+b.y-a.y};
   append(group,"polygon",{points:[a,b,other,c].map(q=>q.x+","+q.y).join(" "),fill:color,"fill-opacity":.09});
   line(group,a,b,color);line(group,c,other,color);return;
  }
  if(kind==="Freehand drawing"){path(group,p,color);return;}
  if(M().TOOLS.Fibonacci.includes(kind)&&b){
   const originX=Math.min(a.x,b.x,c?.x??b.x),right=w-5;
   const levels=M().fibonacci(d);
   for(const item of levels){
    const y=scalePrice(item.price);
    if(!Number.isFinite(y))continue;
    line(group,{x:originX,y},{x:right,y},C.fib,1,true);
    label(group,Math.min(w-140,Math.max(0,b.x)),y,(item.level*100).toFixed(1)+"% · "+fmt(item.price),C.fib);
   }
   line(group,a,b,C.fib,1.7);
   if(c)line(group,b,c,C.fib,1.7);
   return;
  }
  if(kind==="Long / Short Risk Reward"&&b&&c){
   const x=Math.max(0,a.x),end=Math.max(x+1,w-6),width=end-x;
   const stop=b,goal=c;
   append(group,"rect",{x,y:Math.min(a.y,stop.y),width,height:Math.abs(a.y-stop.y),
    fill:C.risk,"fill-opacity":.16,stroke:C.risk,"stroke-opacity":.6});
   append(group,"rect",{x,y:Math.min(a.y,goal.y),width,height:Math.abs(a.y-goal.y),
    fill:"#42c995","fill-opacity":.14,stroke:"#42c995","stroke-opacity":.6});
   line(group,{x,y:a.y},{x:end,y:a.y},"#e9c36b",1.5);
   const metric=M().metrics(d,step);
   label(group,a.x,a.y,"Hypothetical "+metric.direction+" · R:R "+(metric.ratio?.toFixed(2)??"N/A"),"#f4d8a6");
   label(group,b.x,b.y,"Stop (hypothetical) "+fmt(d.points[1].price),C.risk);
   label(group,c.x,c.y,"Target (hypothetical) "+fmt(d.points[2].price),"#84ddbb");
   return;
  }
  // Date/bar, pip and percentage rulers and manually drawn technical patterns.
  if(b){path(group,p,color);}
  if(M().TOOLS.Measurements.includes(kind)&&b){
   const m=M().metrics(d,step);
   let t=kind==="Date / Bar Ruler"?m.bars.toFixed(1)+" bars / "+(m.elapsedSeconds/60).toFixed(1)+" min":
    kind==="Percent Change"?(m.percent>=0?"+":"")+m.percent.toFixed(2)+"%":
    m.pips.toFixed(1)+" approx. pips / "+(m.percent>=0?"+":"")+m.percent.toFixed(2)+"%";
   label(group,last.x,last.y,t,C.measure);
  }else if(M().TOOLS.Patterns.includes(kind)&&last)label(group,last.x,last.y,kind+" · manual",color);
 }
 class DrawingLayer{
  constructor(options){
   Object.assign(this,options);
   this.svg=svg("svg",{class:"xmi-drawing-overlay",role:"application",
    "aria-label":"Editable chart drawing overlay"});
   this.svg.setAttribute("data-active-tool","none");
   this.root.append(this.svg);
   this.mode=null;this.selected=null;this.pending=[];this.preview=null;this.drag=null;
   this.disposed=false;this.raf=0;
   this.down=e=>this.pointerDown(e);this.move=e=>this.pointerMove(e);
   this.up=e=>this.pointerUp(e);
   this.svg.addEventListener("pointerdown",this.down,true);
   this.svg.addEventListener("pointermove",this.move);
   this.svg.addEventListener("pointerup",this.up);
   this.svg.addEventListener("pointercancel",this.up);
   this.rangeChange=()=>this.schedule();
   this.chart.timeScale().subscribeVisibleLogicalRangeChange(this.rangeChange);
   this.resize=new ResizeObserver(()=>this.schedule());this.resize.observe(this.root);
   this.schedule();
  }
  setMode(mode){
   this.mode=mode;this.pending=[];this.preview=null;
   this.svg.classList.toggle("interactive",Boolean(mode));
   this.svg.dataset.activeTool=mode||"none";
   this.schedule();
  }
  setSelected(id){
   this.selected=id;
   this.onSelect?.(id);
   // A selection is an immediate interactive change: the browser can defer an
   // already queued chart-layout frame while pointer capture is active.
   // Draw handles synchronously rather than waiting behind that frame.
   this.draw();
  }
  schedule(){
   if(this.disposed||this.raf)return;
   this.raf=requestAnimationFrame(()=>{this.raf=0;this.draw();});
  }
  chartPoint(x,y){
   const scale=this.chart.timeScale(),logical=scale.coordinateToLogical(x);
   const price=this.series.coordinateToPrice(y);
   if(logical==null||!Number.isFinite(price)||price<=0)return null;
   const bars=this.record.bars,i=Math.max(0,Math.min(bars.length-2,Math.floor(logical)));
   const a=bars[i],b=bars[i+1];
   const time=a.time+(logical-i)*(b.time-a.time);
   return M().point({time,price});
  }
  projectPoint(p){
   const scale=this.chart.timeScale(),bars=this.record.bars;
   // Interpolate in actual timestamps, preserving stored symbol drawings across resolutions.
   let lo=0,hi=bars.length-1;
   while(lo<hi){const mid=Math.floor((lo+hi)/2);if(bars[mid].time<p.time)lo=mid+1;else hi=mid;}
   const i=Math.max(0,Math.min(bars.length-2,lo-(bars[lo].time>p.time?1:0)));
   const a=bars[i],b=bars[i+1],xa=scale.timeToCoordinate(a.time),xb=scale.timeToCoordinate(b.time);
   const y=this.series.priceToCoordinate(p.price);
   if(xa==null||xb==null||y==null)return null;
   return {x:xa+(xb-xa)*(p.time-a.time)/(b.time-a.time),y};
  }
  projected(){
   const out=[];
   for(const drawing of this.getDrawings().filter(d=>d.symbol===this.symbol)){
    const points=drawing.points.map(p=>this.projectPoint(p));
    if(points.every(Boolean))out.push({drawing,points});
   }
   return out;
  }
  pointerDown(e){
   if(!this.mode||e.button!==0)return;
   e.preventDefault();e.stopPropagation();
   const rect=this.svg.getBoundingClientRect(),x=e.clientX-rect.left,y=e.clientY-rect.top;
   const p=this.chartPoint(x,y);
   if(this.mode==="Select / Edit"){
    const found=M().hitTest(this.projected(),x,y);
    if(found&&p){
     const d=this.getDrawings().find(d=>d.id===found.id);
     this.drag={id:found.id,kind:found.kind,index:found.pointIndex,
      initial:p,original:d.points.map(q=>({...q}))};
     this.svg.setPointerCapture(e.pointerId);
    }
    // Capture before repainting; repaint replaces SVG line child nodes.
    this.setSelected(found?.id||null);
    return;
   }
   if(!p)return;
   if(this.mode==="Freehand drawing"){
    this.pending=[p];this.drag={kind:"freehand"};this.svg.setPointerCapture(e.pointerId);this.schedule();return;
   }
   this.pending.push(p);
   const count=M().clicks(this.mode);
   if(this.pending.length>=count)this.commit(this.pending);
   else this.onNotice?.(this.mode+": "+this.pending.length+"/"+count+" anchors selected");
   this.schedule();
  }
  pointerMove(e){
   if(!this.mode)return;
   const rect=this.svg.getBoundingClientRect(),x=e.clientX-rect.left,y=e.clientY-rect.top;
   const p=this.chartPoint(x,y);
   if(this.drag?.kind==="freehand"&&p){
    const last=this.pending.at(-1),prev=this.projectPoint(last),here=this.projectPoint(p);
    if(prev&&here&&Math.hypot(prev.x-here.x,prev.y-here.y)>3&&this.pending.length<M().MAX_POINTS)
     this.pending.push(p);
   }else if(this.drag&&p){
    const original=this.drag.original;
    const points=this.drag.kind==="handle"?
     original.map((v,i)=>i===this.drag.index?p:v):
     original.map(v=>M().point({time:v.time+(p.time-this.drag.initial.time),
       price:v.price+(p.price-this.drag.initial.price)}));
    if(points.every(q=>q.price>0)){
     this.drag.preview={...this.getDrawings().find(d=>d.id===this.drag.id),points};
    }
   }else this.preview=p;
   this.schedule();
  }
  pointerUp(e){
   if(!this.drag)return;
   const drag=this.drag;this.drag=null;
   if(drag.kind==="freehand"){
    if(this.pending.length>1)this.commit(this.pending);
    else{this.pending=[];this.schedule();}
   }else if(drag.preview){
    try{this.onSave?.(drag.preview);}catch(err){this.onError?.(err);}
    this.schedule();
   }
   if(this.svg.hasPointerCapture(e.pointerId))this.svg.releasePointerCapture(e.pointerId);
  }
  commit(points){
   let text="";
   if(this.mode==="Text labels"){
    const entered=window.prompt("Chart label (maximum 100 characters):","Note");
    if(entered===null||!entered.trim()){this.pending=[];return;}
    text=entered.trim().slice(0,100);
   }
   const draw={id:"d"+Date.now().toString(36)+Math.random().toString(36).slice(2,9),
    symbol:this.symbol,tool:this.mode,points:points.map(M().point),text,color:"#65d1e7"};
   try{this.onSave?.(draw);this.setSelected(draw.id);}
   catch(err){this.onError?.(err);}
   this.pending=[];this.preview=null;this.schedule();
  }
  draw(){
   if(this.disposed||!this.svg.isConnected)return;
   const w=this.root.clientWidth;
   // Only cover the main price pane, not auxiliary RSI/MACD/volume panes.
   // The main series coordinate conversion is defined relative to this pane.
   const h=this.chart.panes()[0]?.getHeight()||this.root.clientHeight;
   if(w<1||h<1)return;
   this.svg.style.height=h+"px";
   this.svg.setAttribute("viewBox","0 0 "+w+" "+h);
   this.svg.replaceChildren();
   const entries=this.projected();
   if(this.drag?.preview){
    const i=entries.findIndex(x=>x.drawing.id===this.drag.id);
    if(i>=0)entries[i]={drawing:this.drag.preview,points:this.drag.preview.points.map(p=>this.projectPoint(p))};
   }
   const scalePrice=p=>this.series.priceToCoordinate(p),step=Number(this.record.bars[1].time-this.record.bars[0].time)||60;
   for(const {drawing,points} of entries){
    if(points.some(p=>!p))continue;
    drawShape(this.svg,drawing,points,w,h,scalePrice,step);
    if(drawing.id===this.selected)for(let i=0;i<points.length;i++){
     const p=points[i];append(this.svg,"circle",{cx:p.x,cy:p.y,r:5,fill:"#e8faff",stroke:"#306985",
      "stroke-width":2,"data-handle":i});
    }
   }
   if(this.pending.length){
    const draft=this.pending.map(p=>this.projectPoint(p));
    if(this.preview&&this.mode!=="Freehand drawing")draft.push(this.projectPoint(this.preview));
    if(draft.every(Boolean))path(this.svg,draft,"#eabf6d");
   }
  }
  dispose(){
   this.disposed=true;cancelAnimationFrame(this.raf);
   this.chart.timeScale().unsubscribeVisibleLogicalRangeChange(this.rangeChange);
   this.resize.disconnect();this.svg.remove();
  }
 }
 return Object.freeze({DrawingLayer});
});
