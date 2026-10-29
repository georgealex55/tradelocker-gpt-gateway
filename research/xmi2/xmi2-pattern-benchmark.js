/* Offline evaluation of imported, closed historical candles. No I/O, execution or tuning. */
(function(root,factory){
 const out=factory(typeof module==="object"&&module.exports?require("./xmi2-auto-patterns.js"):root.XMIAutoPatterns);
 if(typeof module==="object"&&module.exports)module.exports=out;
 if(root)root.XMIPatternBenchmark=out;
})(typeof window!=="undefined"?window:null,function(engine){
 "use strict";
 const VERSION="xmi-pattern-benchmark/v1",TOLERANCE=0;
 function requireArray(v,max,label){
  if(!Array.isArray(v)||v.length>max)throw Error("Invalid "+label);
  return v;
 }
 function validateCase(c){
  if(!c||typeof c.id!=="string"||!/^[a-zA-Z0-9_-]{1,48}$/.test(c.id)||
    !["train","holdout"].includes(c.split))throw Error("Invalid case identity or split");
  const bars=requireArray(c.bars,5000,"bars");
  if(bars.length<2)throw Error("Too few historical bars");
  let prev=0;
  for(const b of bars){
   if(!b||b.closed!==true||!Number.isSafeInteger(b.time)||b.time<=prev||
    ![b.open,b.high,b.low,b.close].every(v=>Number.isFinite(v)&&v>0)||
    b.low>Math.min(b.open,b.close)||b.high<Math.max(b.open,b.close))throw Error("Invalid closed historical bar");
   prev=b.time;
  }
  const expected=requireArray(c.expected,100,"ground truth").map(e=>{
   if(!e||typeof e.pattern!=="string"||!Number.isSafeInteger(e.time)||
      !bars.some(b=>b.time===e.time))throw Error("Invalid labeled outcome");
   return {pattern:e.pattern,time:e.time};
  });
  const labels=new Set(expected.map(e=>e.pattern+"|"+e.time));
  if(labels.size!==expected.length)throw Error("Duplicate ground truth");
  return {id:c.id,split:c.split,bars,expected};
 }
 function score(cases,{window=0}={}){
  requireArray(cases,100,"cases");
  if(!Number.isSafeInteger(window)||window<0||window>3)throw Error("Invalid matching tolerance");
  const ids=new Set(),results=[];
  for(const original of cases){
   const c=validateCase(original);
   if(ids.has(c.id))throw Error("Duplicate case");ids.add(c.id);
   const detections=engine.detect(c.bars);
   const matched=new Set();let tp=0,fp=0;
   for(const e of detections){
    const index=c.expected.findIndex((label,i)=>!matched.has(i)&&label.pattern===e.pattern&&
      Math.abs(c.bars.findIndex(b=>b.time===label.time)-c.bars.findIndex(b=>b.time===e.time))<=window);
    if(index<0)fp++;else{matched.add(index);tp++;}
   }
   const fn=c.expected.length-tp;
   results.push({id:c.id,split:c.split,bars:c.bars.length,labels:c.expected.length,detections:detections.length,tp,fp,fn});
  }
  function summarize(items){
   const tp=items.reduce((v,r)=>v+r.tp,0),fp=items.reduce((v,r)=>v+r.fp,0),fn=items.reduce((v,r)=>v+r.fn,0);
   const bars=items.reduce((v,r)=>v+r.bars,0);
   return {cases:items.length,bars,tp,fp,fn,precision:tp+fp?tp/(tp+fp):null,
    recall:tp+fn?tp/(tp+fn):null,falseDetectionsPer1000Bars:bars?fp*1000/bars:null};
  }
  const train=summarize(results.filter(r=>r.split==="train")),holdout=summarize(results.filter(r=>r.split==="holdout"));
  return {version:VERSION,matchingWindowBars:window,results,train,holdout,
   precisionGap:train.precision!==null&&holdout.precision!==null?holdout.precision-train.precision:null,
   recallGap:train.recall!==null&&holdout.recall!==null?holdout.recall-train.recall:null,
   disclaimer:"Synthetic fixture benchmark; no market performance or probability estimate"};
 }
 return Object.freeze({VERSION,validateCase,score});
});