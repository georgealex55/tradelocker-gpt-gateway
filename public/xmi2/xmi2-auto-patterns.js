/* Deterministic, import-only XMI historical pattern research. No I/O or orders. */
(function(root,factory){
 const api=factory();
 if(typeof module==="object"&&module.exports)module.exports=api;
 if(root)root.XMIAutoPatterns=api;
})(typeof window!=="undefined"?window:null,function(){
 "use strict";
 const MAX_EVENTS=20;
 const round=x=>Math.round(x*1000)/1000;
 function detect(bars){
  if(!Array.isArray(bars)||bars.length>5000)throw Error("Invalid historical bars");
  const closed=bars.filter(b=>b&&b.closed===true);
  for(let i=0;i<closed.length;i++){
   const b=closed[i];
   if(!Number.isSafeInteger(b.time)||b.time<=0||(i&&b.time<=closed[i-1].time)||
    ![b.open,b.high,b.low,b.close].every(x=>Number.isFinite(x)&&x>0)||
    b.low>Math.min(b.open,b.close)||b.high<Math.max(b.open,b.close))
    throw Error("Invalid closed candle");
  }
  const events=[],pivots=[];
  // Symmetrical two-bar confirmation: the pivot is never usable until the right two bars close.
  for(let i=2;i+2<closed.length;i++){
   const surrounding=[i-2,i-1,i+1,i+2];
   if(surrounding.every(j=>closed[i].high>closed[j].high))
    pivots.push({kind:"H",index:i,price:closed[i].high,time:closed[i].time,ready:i+2});
   if(surrounding.every(j=>closed[i].low<closed[j].low))
    pivots.push({kind:"L",index:i,price:closed[i].low,time:closed[i].time,ready:i+2});
  }
  pivots.sort((a,b)=>a.index-b.index||a.kind.localeCompare(b.kind));
  const push=(name,pts,level,direction,at,score)=>{
   if(!Number.isFinite(level)||level<=0||at>=closed.length)return;
   const time=closed[at].time;
   const key=name+"|"+pts.map(p=>p.index).join(",");
   if(events.some(e=>e.key===key))return;
   const future=closed.slice(at+1);
   const invalid=future.find(c=>direction==="bear"?c.close>Math.max(...pts.filter(p=>p.kind==="H").map(p=>p.price))*1.002:
    c.close<Math.min(...pts.filter(p=>p.kind==="L").map(p=>p.price))*0.998);
   events.push({key,pattern:name,time,confirmedAt:time,confirmationIndex:at,
    confidence:round(Math.min(.9,Math.max(.35,score))),confidenceType:"heuristic-score-not-probability",
    direction,breakLevel:level,points:pts.map(p=>({kind:p.kind,time:p.time,price:p.price,confirmedAt:closed[p.ready].time})),
    status:invalid?"invalidated":"confirmed",invalidatedAt:invalid?invalid.time:null,
    evidence:"closed imported OHLC; two-right-bar confirmed pivots"});
  };
  const near=(x,y,t=.012)=>Math.abs(x-y)/Math.max(x,y)<=t;
  for(let k=2;k<pivots.length;k++){
   const [a,b,c]=pivots.slice(k-2,k+1);
   if(a.kind!==c.kind||a.kind===b.kind||!(a.index<b.index&&b.index<c.index)||!near(a.price,c.price))continue;
   const bear=a.kind==="H",level=b.price;
   if(bear?level>=Math.min(a.price,c.price):level<=Math.max(a.price,c.price))continue;
   const start=Math.max(c.ready,b.ready);
   // Confirm with a subsequent CLOSE through neckline; a wick is not enough.
   const at=closed.findIndex((bar,i)=>i>start&&(bear?bar.close<level:bar.close>level));
   if(at<0)continue;
   push(bear?"Double Top":"Double Bottom",[a,b,c],level,bear?"bear":"bull",at,
    .72+.16*(1-Math.abs(a.price-c.price)/Math.max(a.price,c.price)/.012));
  }
  for(let k=4;k<pivots.length;k++){
   const pts=pivots.slice(k-4,k+1),[a,b,c,d,e]=pts;
   if(!(a.kind===c.kind&&c.kind===e.kind&&b.kind===d.kind&&a.kind!==b.kind))continue;
   const tops=a.kind==="H";
   // H&S: the middle peak is above both shoulders (inverse: below).
   if(!(tops?c.price>a.price*1.004&&c.price>e.price*1.004:
    c.price<a.price*.996&&c.price<e.price*.996) || !near(a.price,e.price,.025))continue;
   if(!near(b.price,d.price,.03))continue;
   const neckline=(b.price+d.price)/2,start=Math.max(...pts.map(p=>p.ready));
   const at=closed.findIndex((bar,i)=>i>start&&(tops?bar.close<neckline:bar.close>neckline));
   if(at<0)continue;
   push(tops?"Head & Shoulders":"Inverse Head & Shoulders",pts,neckline,tops?"bear":"bull",at,.68);
  }
  // Triple top/bottom: repeated peaks/troughs with two alternating valleys/peaks.
  for(let k=4;k<pivots.length;k++){
   const pts=pivots.slice(k-4,k+1),[a,b,c,d,e]=pts;
   if(a.kind!==c.kind||c.kind!==e.kind||a.kind===b.kind||b.kind!==d.kind||
      !near(a.price,c.price)||!near(c.price,e.price))continue;
   const bear=a.kind==="H",level=bear?Math.min(b.price,d.price):Math.max(b.price,d.price);
   if(bear?level>=Math.min(a.price,c.price,e.price):level<=Math.max(a.price,c.price,e.price))continue;
   const start=Math.max(...pts.map(p=>p.ready));
   const at=closed.findIndex((bar,i)=>i>start&&(bear?bar.close<level:bar.close>level));
   if(at<0)continue;
   push(bear?"Triple Top":"Triple Bottom",pts,level,bear?"bear":"bull",at,.76);
  }
  return events.sort((a,b)=>a.time-b.time||a.pattern.localeCompare(b.pattern)).slice(-MAX_EVENTS)
   .map(({key,...e})=>e);
 }
 return Object.freeze({detect});
});