#!/usr/bin/env node
/* Explicit local-only XMI benchmark. No network, strategy execution or database. */
"use strict";
const fs=require("node:fs"),crypto=require("node:crypto"),path=require("node:path");
const protocol=require("./xmi2-blind-protocol.js");
const benchmark=require("./xmi2-pattern-benchmark.js");
const audit=require("./xmi2-freeze-audit.cjs");
const trust=require("./xmi2-trusted-signers.cjs");
const intake=require("./xmi2-historical-intake.cjs");
const quality=require("./xmi2-historical-quality.cjs");
const sessions=require("./xmi2-session-evidence.cjs");
const MAX_BYTES=2*1024*1024;
function readFile(filename){
 const stat=fs.statSync(filename);
 if(!stat.isFile()||stat.size>MAX_BYTES)throw Error("Local input must be a regular file <= 2 MiB");
 const bytes=fs.readFileSync(filename);
 if(bytes.length>MAX_BYTES)throw Error("Oversized local input");
 return bytes;
}
function digest(bytes){return crypto.createHash("sha256").update(bytes).digest("hex");}
function json(bytes){return JSON.parse(bytes.toString("utf8"));}
function evaluate(datasetBytes,registryBytes,reviewBytes,receiptBytes,trustKeyBytes,decisionsBytes,trustRegistryBytes,intakeBytes,qualityBytes,sessionBytes){
 if(!Buffer.isBuffer(sessionBytes))throw Error("Offline session evidence required");
 if(!Buffer.isBuffer(qualityBytes))throw Error("Historical quality policy required");
 if(!Buffer.isBuffer(intakeBytes))throw Error("Approved historical intake manifest required");
 if(!Buffer.isBuffer(trustRegistryBytes))throw Error("Pinned trust registry required");
 if(!Buffer.isBuffer(receiptBytes)||!Buffer.isBuffer(trustKeyBytes)||!Buffer.isBuffer(decisionsBytes))throw Error("Signed evidence inputs required");
 const actualDigest=digest(datasetBytes);
 const registry=protocol.validate(json(registryBytes));
 if(actualDigest!==registry.dataSha256)throw Error("Dataset SHA-256 mismatch; evaluation refused");
 const provenance=intake.check(datasetBytes,json(intakeBytes),registry);
 const signedReceipt=json(receiptBytes);
 const authorized=trust.authorize(json(trustRegistryBytes),signedReceipt);
 if(authorized.publicKeyPem!==trustKeyBytes.toString("utf8"))throw Error("Trusted key mismatch");
 audit.verifyReceipt(registry,signedReceipt,authorized.publicKeyPem);
 const dataset=json(datasetBytes);
 if(!dataset||dataset.version!=="xmi-historical-bars/v1"||
    dataset.datasetId!==registry.datasetId||!Array.isArray(dataset.bars)||
    dataset.bars.length>5000)throw Error("Invalid historical dataset envelope");
 const qualityReport=quality.inspect(dataset,registry,json(qualityBytes),json(sessionBytes));
 const sessionReport=sessions.validate(dataset,registry,json(qualityBytes),json(sessionBytes));
 const labels=json(reviewBytes);
 const reviewed=audit.resolve(registry,labels,json(decisionsBytes));
 if(reviewed.unresolved.length)throw Error("Unresolved blind labels; evaluation refused");
 const cases=[],used=new Set();
 for(const p of registry.partitions){
  const bars=dataset.bars.filter(b=>b.time>=p.start&&b.time<p.end);
  if(bars.length<2||bars.length>5000)throw Error("Partition lacks sufficient closed candles: "+p.id);
  if(bars.some(b=>b.closed!==true||!Number.isSafeInteger(b.time)||
    (b.time-p.start)%p.barSeconds!==0))throw Error("Invalid partition candle: "+p.id);
  const expected=reviewed.accepted.filter(l=>l.partitionId===p.id).map(l=>({pattern:l.pattern,time:l.time}));
  if(expected.some(l=>!bars.some(b=>b.time===l.time)))throw Error("Accepted label has no imported candle");
  for(const b of bars){
   if(used.has(b.time))throw Error("Cross-partition candle reuse");used.add(b.time);
  }
  cases.push({id:p.id,split:p.split,bars,expected});
 }
 const output=benchmark.score(cases);
 return {format:"xmi-local-benchmark-report/v1",datasetId:registry.datasetId,
  dataSha256:actualDigest,registrySha256:digest(registryBytes),reviewsSha256:digest(reviewBytes),
  frozenAt:registry.frozenAt,protocolId:registry.protocolId,
  freezeReceiptSha256:digest(receiptBytes),trustedKeySha256:digest(trustKeyBytes),adjudicationsSha256:digest(decisionsBytes),
  trustRegistrySha256:digest(trustRegistryBytes),authorizedSignerId:authorized.signerId,
  intakeManifestSha256:digest(intakeBytes),provenance,qualityPolicySha256:digest(qualityBytes),qualityReport,sessionEvidenceSha256:digest(sessionBytes),sessionReport,
  labelingAudit:reviewed.audit,metrics:output,
  limitations:["Results reflect reviewed candidate coverage, not an exhaustive ground truth.",
   "No detector calibration or real-world predictive validity is established by this tool."]};
}
function main(args){
 if(args.length!==10)throw Error("Usage: node xmi2-local-benchmark.cjs <dataset.json> <registry.json> <blind-reviews.json> <signed-receipt.json> <trusted-public-key.pem> <third-decisions.json> <trusted-signers.json> <historical-intake.json> <historical-quality.json> <session-evidence.json>");
 const inputs=args.map(p=>readFile(path.resolve(p)));
 const report=evaluate(...inputs);
 process.stdout.write(JSON.stringify(report,null,2)+"\n");
}
if(require.main===module){
 try{main(process.argv.slice(2));}
 catch(e){process.stderr.write("Local benchmark rejected: "+e.message+"\n");process.exitCode=1;}
}
module.exports={evaluate,digest,readFile,main};
