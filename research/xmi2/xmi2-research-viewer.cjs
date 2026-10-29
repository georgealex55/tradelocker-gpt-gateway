/* Pure static verified report viewer. No scripts, networks, trading or persistence. */
"use strict";
const checkpoint=require("./xmi2-research-checkpoint.cjs");
const VERSION="xmi-verified-report-view/v1";
const escapeHtml=v=>String(v).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
function view(inputs,bundle,trustedBundlePem,trustedPreregPem,preregCheckpoint,chain,trustedWitnessPem,
 anchorHead,anchorSequence,expectedHead){
 // Authentication and complete original-data replay MUST succeed before any HTML is rendered.
 const audit=checkpoint.verifyAnchoredBundle(inputs,bundle,trustedBundlePem,trustedPreregPem,preregCheckpoint,
  chain,trustedWitnessPem,anchorHead,anchorSequence,expectedHead);
 const report=bundle.payload.report;
 if(!report||report.mode!=="offline-research-only"||!report.comparison||
   !Array.isArray(report.comparison.results)||!Array.isArray(report.windows))
  throw Error("Verified bundle does not contain supported offline report");
 const cells=report.comparison.results.map(r=>
  "<tr><td>"+escapeHtml(r.id)+"</td><td>"+escapeHtml(r.trainObservations)+"</td><td>"+
  escapeHtml(r.trainSignalCount)+"</td><td>"+escapeHtml(r.holdoutObservations)+"</td><td>"+
  escapeHtml(r.holdoutSignalCount)+"</td></tr>").join("");
 const windows=report.windows.map(w=>"<tr><td>"+escapeHtml(w.before)+" → "+escapeHtml(w.after)+
  "</td><td>"+escapeHtml(w.requiredSeconds)+"</td><td>"+escapeHtml(w.actualSeconds)+"</td></tr>").join("");
 const notes=[...report.limitations,...report.comparison.limitations,...bundle.payload.limitations].map(x=>
  "<li>"+escapeHtml(x)+"</li>").join("");
 const hash=(value)=>"<code>"+escapeHtml(value)+"</code>";
 return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src 'none'; connect-src 'none'; form-action 'none'; base-uri 'none'">
<title>XMI 2.0 · Verified Offline Research</title>
<style>
:root{color-scheme:dark;font:16px system-ui,-apple-system,Segoe UI,sans-serif}
body{background:#0e1521;color:#e9eef5;margin:0;padding:32px 18px}
main{max-width:1040px;margin:auto}
header{border-bottom:1px solid #344359;padding-bottom:20px;margin-bottom:24px}
h1{font-size:clamp(1.6rem,4vw,2.3rem);margin:8px 0}
h2{font-size:1.16rem;margin:0 0 14px}
p,li{line-height:1.6;color:#b8c9da}
.status{font-weight:750;letter-spacing:.05em;color:#85e2c2}
section{background:#182334;padding:22px;border:1px solid #2c4058;border-radius:12px;margin:16px 0}
table{border-collapse:collapse;width:100%;font-variant-numeric:tabular-nums;font-size:.92rem}
th,td{text-align:left;padding:12px 9px;border-bottom:1px solid #334456}
th{font-weight:650;color:#c9e0ed}
.tablewrap{overflow-x:auto}
code{overflow-wrap:anywhere;color:#8edbd6;font-size:.83rem}
.meta{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:16px}
.label{display:block;color:#b6c8d8;margin-bottom:8px;font-size:.88rem}
.warning{color:#f6cea4}
</style></head><body><main>
<header><div class="status">VERIFIED · OFFLINE RESEARCH ONLY · NO EXECUTION</div>
<h1>XMI 2.0 Research Audit</h1>
<p>Generated only after independent verification of the signer, original historical evidence, preregistration, audit chain and reproducible research calculations.</p></header>
<section><h2>Audit identity</h2><div class="meta">
<div><span class="label">Bundle SHA-256</span>${hash(audit.reproducedBundleSha256)}</div>
<div><span class="label">Terminal chain SHA-256</span>${hash(audit.terminalHead)}</div>
<div><span class="label">Reproduced report SHA-256</span>${hash(audit.reproducedReportSha256)}</div>
<div><span class="label">Verified audit links</span><strong>${escapeHtml(audit.verifiedCount)}</strong></div>
</div></section>
<section><h2>Frozen strategy comparison</h2>
<p class="warning">Descriptive closed-candle signal counts only — not orders, profitability, win rates, predictive power or adjusted significance.</p>
<div class="tablewrap"><table><thead><tr><th>Candidate</th><th>Train bars</th><th>Train signals</th><th>Holdout bars</th><th>Holdout signals</th></tr></thead>
<tbody>${cells}</tbody></table></div></section>
<section><h2>Chronological embargo audit</h2><div class="tablewrap">
<table><thead><tr><th>Adjacent frozen partitions</th><th>Required seconds</th><th>Observed seconds</th></tr></thead><tbody>${windows}</tbody></table></div></section>
<section><h2>Research limitations</h2><ul>${notes}</ul></section>
<p>Static verified artifact. No JavaScript, external dependencies, data refresh, broker controls or order submission.</p>
</main></body></html>`;
}
module.exports=Object.freeze({VERSION,view,escapeHtml});
