/* Offline versioned research replay: signals only, never executable orders. */
"use strict";
const crypto=require("node:crypto"),runner=require("./xmi2-local-benchmark.cjs");
const VERSION="xmi-strategy-lab/v1",ID=/^[A-Za-z0-9_-]{1,48}$/;
const sha=b=>crypto.createHash("sha256").update(b).digest("hex");
function replay(inputs,strategy){
 if(!Array.isArray(inputs)||inputs.length!==10||inputs.some(b=>!Buffer.isBuffer(b)))
  throw Error("Ten signed local historical evidence files required");
 // Mandatory admission runs first; no other code path can waive it.
 const admission=runner.evaluate(...inputs);
 if(!strategy||strategy.version!==VERSION||!ID.test(strategy.id||"")||
  strategy.rule!=="close-crosses-prior-high"||strategy.lookback!==1||
  strategy.executionEnabled!==false||strategy.liveDataEnabled!==false||
  strategy.allowParameterSearch!==false)throw Error("Research-only strategy specification required");
 const dataset=JSON.parse(inputs[0].toString("utf8")),registry=JSON.parse(inputs[1].toString("utf8"));
 const results=[];
 for(const p of registry.partitions){
  const bars=dataset.bars.filter(b=>b.time>=p.start&&b.time<p.end);
  const signals=[];
  for(let i=1;i<bars.length;i++){
   const previous=bars[i-1],current=bars[i];
   // Signals use only the current closed candle and preceding candle.
   if(current.close>previous.high)signals.push({time:current.time,barIndex:i});
  }
  results.push({partitionId:p.id,split:p.split,observations:bars.length,signalCount:signals.length,signals});
 }
 return {version:VERSION,mode:"offline-research-only",strategyId:strategy.id,
  strategySha256:sha(Buffer.from(JSON.stringify(strategy))),datasetSha256:admission.dataSha256,
  admissionEvidence:{registrySha256:admission.registrySha256,freezeReceiptSha256:admission.freezeReceiptSha256,
   trustRegistrySha256:admission.trustRegistrySha256,intakeManifestSha256:admission.intakeManifestSha256,
   qualityPolicySha256:admission.qualityPolicySha256,sessionEvidenceSha256:admission.sessionEvidenceSha256},
  results,limitations:["Signals are not orders or trade recommendations.",
   "No P&L, fills, fees, slippage, win rate, predictive validity, or live performance is calculated.",
   "Holdout signals are reported separately and never used for parameter selection."]};
}
module.exports=Object.freeze({VERSION,replay});
