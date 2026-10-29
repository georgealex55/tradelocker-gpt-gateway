/* Frozen, deterministic historical labeling registry. Pure validation; no I/O. */
(function(root,factory){
 const api=factory();if(typeof module==="object"&&module.exports)module.exports=api;
 if(root)root.XMIBlindProtocol=api;
})(typeof window!=="undefined"?window:null,function(){
 "use strict";
 const VERSION="xmi-blind-label-registry/v1";
 const PATTERNS=new Set(["Double Top","Double Bottom","Triple Top","Triple Bottom","Head & Shoulders","Inverse Head & Shoulders"]);
 const ID=/^[A-Za-z0-9_-]{1,48}$/;
 function fail(reason){throw Error("Invalid blind registry: "+reason);}
 function int(n){return Number.isSafeInteger(n)&&n>0;}
 function validate(registry){
  if(!registry||registry.version!==VERSION||registry.frozen!==true||
    !ID.test(registry.datasetId||"")||!ID.test(registry.protocolId||"")||
    !Array.isArray(registry.partitions)||registry.partitions.length<2||
    registry.partitions.length>30)fail("header");
  if(typeof registry.dataSha256!=="string"||!/^[a-f0-9]{64}$/.test(registry.dataSha256))fail("dataset digest");
  if(typeof registry.frozenAt!=="string"||!Number.isFinite(Date.parse(registry.frozenAt))||
    !/(Z|[+-]\d\d:\d\d)$/.test(registry.frozenAt))fail("freeze timestamp");
  const partitions=registry.partitions,ids=new Set();let lastEnd=0,seenHoldout=false,hasTrain=false,hasHoldout=false;
  for(const p of partitions){
   if(!p||!ID.test(p.id||"")||ids.has(p.id)||!["train","holdout"].includes(p.split)||
    !int(p.start)||!int(p.end)||p.end<=p.start||p.start<=lastEnd||
    !int(p.embargoBars)||p.embargoBars<2||!int(p.barSeconds)||
    !Number.isSafeInteger(p.end-p.start)||!int(p.labelWindowBars))fail("partition bounds");
   if((p.end-p.start)%p.barSeconds!==0||p.labelWindowBars>5000)fail("partition alignment");
   if(p.split==="train"&&seenHoldout)fail("train after holdout");
   if(p.split==="holdout"){seenHoldout=true;hasHoldout=true;}else hasTrain=true;
   ids.add(p.id);lastEnd=p.end;
  }
  if(!hasTrain||!hasHoldout)fail("missing chronological split");
  // Exclude neighboring bars so confirmation windows cannot straddle partitions.
  for(let i=1;i<partitions.length;i++){
   const a=partitions[i-1],b=partitions[i];
   if(a.barSeconds!==b.barSeconds||b.start-a.end<(a.embargoBars+b.embargoBars)*a.barSeconds)fail("insufficient temporal embargo");
  }
  return Object.freeze({version:VERSION,frozen:true,datasetId:registry.datasetId,protocolId:registry.protocolId,
   dataSha256:registry.dataSha256,frozenAt:registry.frozenAt,
   partitions:partitions.map(p=>Object.freeze({...p}))});
 }
 function validateLabels(registry,submitted){
  const r=validate(registry);
  if(!Array.isArray(submitted)||submitted.length>5000)fail("labels size");
  const unique=new Set();
  return submitted.map(l=>{
   if(!l||!ID.test(l.partitionId||"")||!ID.test(l.reviewerId||"")||
    !["positive","negative","uncertain"].includes(l.verdict)||
    !PATTERNS.has(l.pattern)||!int(l.time)||!["blind-v1"].includes(l.protocol)||
    typeof l.detectorVisible!=="boolean"||l.detectorVisible)fail("label or unblinding");
   const p=r.partitions.find(p=>p.id===l.partitionId);
   if(!p||l.time<p.start||l.time>=p.end||((l.time-p.start)%p.barSeconds)!==0)fail("label outside partition");
   const k=l.partitionId+"|"+l.reviewerId+"|"+l.pattern+"|"+l.time;
   if(unique.has(k))fail("duplicate review");unique.add(k);
   return Object.freeze({partitionId:l.partitionId,reviewerId:l.reviewerId,
    pattern:l.pattern,time:l.time,verdict:l.verdict,protocol:"blind-v1",detectorVisible:false});
  });
 }
 function adjudicate(registry,labels,{reviewersRequired=2}={}){
  if(reviewersRequired!==2)fail("independent dual review required");
  const r=validate(registry),all=validateLabels(r,labels);
  const grouped=new Map();
  for(const l of all){const key=l.partitionId+"|"+l.pattern+"|"+l.time;
   if(!grouped.has(key))grouped.set(key,[]);
   grouped.get(key).push(l);
  }
  const accepted=[],unresolved=[];
  for(const reviews of grouped.values()){
   const distinct=new Set(reviews.map(l=>l.reviewerId));
   if(distinct.size<2||reviews.length!==2||reviews[0].verdict!==reviews[1].verdict||
     reviews[0].verdict==="uncertain"){unresolved.push({partitionId:reviews[0].partitionId,pattern:reviews[0].pattern,time:reviews[0].time});continue;}
   if(reviews[0].verdict==="positive")accepted.push({partitionId:reviews[0].partitionId,pattern:reviews[0].pattern,time:reviews[0].time});
  }
  return {version:VERSION,protocolId:r.protocolId,accepted,unresolved,
   audit:{candidateGroups:grouped.size,adjudicated:grouped.size-unresolved.length,excluded:unresolved.length},
   warning:"Unresolved/uncertain labels excluded; negative reviews are not evidence of exhaustive negatives"};
 }
 return Object.freeze({VERSION,validate,validateLabels,adjudicate});
});