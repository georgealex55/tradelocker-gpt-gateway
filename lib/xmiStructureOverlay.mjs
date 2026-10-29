/* Lightweight Charts 5.2 series primitive: minimal level segments and translucent zones. */
export function structurePalette(direction){
 return direction==="bull"||["HH","HL"].includes(direction) ?
  {stroke:"#38b6a1",fill:"rgba(56,182,161,0.10)"}:
  direction==="bear"||["LH","LL"].includes(direction)?
  {stroke:"#e48191",fill:"rgba(228,129,145,0.10)"}:
  {stroke:"#99bce0",fill:"rgba(105,166,227,0.08)"};
}
export function toStructureMarkers(annotations){
 return annotations.filter(x=>Number.isFinite(x.chartTime)).map(e=>{
  const color=structurePalette(e.direction).stroke;
  return {time:e.chartTime,position:e.direction==="bull"||e.direction==="HL"||e.direction==="HH"?"belowBar":"aboveBar",
   shape:e.direction==="bull"?"arrowUp":e.direction==="bear"?"arrowDown":"circle",
   text:(e.label||e.concept).slice(0,7)+" "+e.resolution,color,size:1};
 }).sort((a,b)=>a.time-b.time);
}
export class StructureOverlayPrimitive{
 constructor(){this.items=[];this.finalTime=null;this.chart=null;this.series=null;this.request=null;}
 attached({chart,series,requestUpdate}){this.chart=chart;this.series=series;this.request=requestUpdate;}
 detached(){this.chart=null;this.series=null;this.request=null;}
 setAnnotations(items,finalTime){
  this.items=items.filter(e=>e.zone||Number.isFinite(e.level));
  this.finalTime=finalTime;
  this.request?.();
 }
 updateAllViews(){}
 paneViews(){
  return [{zOrder:()=>"bottom",renderer:()=>({draw:target=>this.drawSafely(target)})}];
 }
 drawSafely(target){
  try{this.draw(target);}catch{ /* Never let an optional drawing overlay blank the price chart. */ }
 }
 draw(target){
  if(!this.chart||!this.series||!this.items.length)return;
  const time=this.chart.timeScale(),price=this.series;
  target.useMediaCoordinateSpace(({context:ctx,mediaSize})=>{
   for(const e of this.items){
    const palette=structurePalette(e.direction);
    const right=time.timeToCoordinate(this.finalTime??e.chartTime);
    const eventX=time.timeToCoordinate(e.chartTime);
    const startX=time.timeToCoordinate(e.chartFrom);
    if(eventX==null||right==null)continue;
    const left=Math.max(-1000,startX??eventX);
    const end=Math.min(mediaSize.width+1000,Math.max(eventX+8,right+8));
    if(e.zone){
     const top=price.priceToCoordinate(e.zone.top),bottom=price.priceToCoordinate(e.zone.bottom);
     if(top===null||bottom===null)continue;
     const y=Math.min(top,bottom),h=Math.abs(bottom-top);
     if(!Number.isFinite(h)||h===0)continue;
     ctx.fillStyle=palette.fill;
     ctx.fillRect(left,y,Math.max(2,end-left),h);
     ctx.strokeStyle=palette.stroke;ctx.lineWidth=.7;ctx.globalAlpha=.55;
     ctx.strokeRect(left,y,Math.max(2,end-left),h);
     ctx.globalAlpha=1;
    }else if(Number.isFinite(e.level)){
     const y=price.priceToCoordinate(e.level);
     if(y===null)continue;
     ctx.beginPath();ctx.setLineDash([4,5]);ctx.strokeStyle=palette.stroke;ctx.globalAlpha=.55;
     ctx.moveTo(left,y);ctx.lineTo(Math.max(left+6,eventX),y);ctx.stroke();
     ctx.setLineDash([]);ctx.globalAlpha=1;
    }
   }
  });
 }
}
