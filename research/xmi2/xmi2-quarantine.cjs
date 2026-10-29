/* Local, read-only quarantine diagnostics; never changes evidence or overrides admission. */
"use strict";
const crypto=require("node:crypto");
const VERSION="xmi-offline-quarantine/v1";
const digest=b=>crypto.createHash("sha256").update(b).digest("hex");
const names=["dataset","registry","reviews","receipt","publicKey","adjudications","trustRegistry","intake","quality","sessions"];
function inspect(inputs,evaluate){
 if(!Array.isArray(inputs)||inputs.length!==10||inputs.some(b=>!Buffer.isBuffer(b)||b.length>2*1024*1024))
  throw Error("Quarantine requires ten bounded local inputs");
 const hashes=Object.fromEntries(inputs.map((b,i)=>[names[i],digest(b)]));
 const findings=[];
 function add(code,location){if(findings.length<100)findings.push({code,location});}
 let dataset,registry,evidence;
 try{dataset=JSON.parse(inputs[0].toString("utf8"));}catch{add("DATASET_JSON_INVALID","dataset");}
 try{registry=JSON.parse(inputs[1].toString("utf8"));}catch{add("REGISTRY_JSON_INVALID","registry");}
 try{evidence=JSON.parse(inputs[9].toString("utf8"));}catch{add("SESSION_EVIDENCE_JSON_INVALID","sessions");}
 if(dataset&&Array.isArray(dataset.bars)&&dataset.bars.length<=5000){
  const seen=new Set();let last=0;
  for(let i=0;i<dataset.bars.length;i++){
   const b=dataset.bars[i];
   if(!b||!Number.isSafeInteger(b.time)){add("INVALID_CANDLE_TIME","bars["+i+"]");continue;}
   if(seen.has(b.time))add("DUPLICATE_CANDLE_TIME","bars["+i+"]");
   if(b.time<last)add("OUT_OF_ORDER_CANDLE","bars["+i+"]");
   if(b.closed!==true||![b.open,b.high,b.low,b.close].every(x=>Number.isFinite(x)&&x>0)||
      b.low>Math.min(b.open,b.close)||b.high<Math.max(b.open,b.close))
    add("INVALID_CLOSED_OHLC","bars["+i+"]");
   seen.add(b.time);last=b.time;
  }
  if(registry&&Array.isArray(registry.partitions)&&evidence&&Array.isArray(evidence.sessions)){
   for(const p of registry.partitions.slice(0,30)){
    if(!p||!Number.isSafeInteger(p.start)||!Number.isSafeInteger(p.end)||!Number.isSafeInteger(p.barSeconds)||p.barSeconds<=0)continue;
    const expected=new Set();
    for(const s of evidence.sessions.slice(0,5000)){
     if(!s||!Number.isSafeInteger(s.open)||!Number.isSafeInteger(s.close)||s.close<=s.open)continue;
     for(let t=Math.max(s.open,p.start);t+p.barSeconds<=Math.min(s.close,p.end)&&expected.size<5000;t+=p.barSeconds)
      if((t-p.start)%p.barSeconds===0)expected.add(t);
    }
    const observed=new Set(dataset.bars.filter(b=>b&&b.time>=p.start&&b.time<p.end).map(b=>b.time));
    for(const t of expected)if(!observed.has(t))add("MISSING_SCHEDULED_BAR",p.id+"@"+t);
    for(const t of observed)if(!expected.has(t))add("UNSCHEDULED_BAR",p.id+"@"+t);
   }
  }
 }
 let admitted=false;
 try{evaluate(...inputs);admitted=true;}catch{add("ADMISSION_REJECTED","signed-validation");}
 return {version:VERSION,status:admitted?"admitted":"quarantined",inputSha256:hashes,
  findings:findings.sort((a,b)=>a.code.localeCompare(b.code)||a.location.localeCompare(b.location)),
  note:"Diagnostic output does not authorize imports, change original bytes, or bypass signed validation."};
}
module.exports=Object.freeze({VERSION,inspect});
