import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
const root=process.cwd(),read=p=>fs.readFileSync(path.join(root,p),"utf8");
test("XMI preview historical studio retains import-only browser gate",()=>{
 const html=read("public/xmi2/chart-studio.html");
 for(const src of ["xmi2-chart-core.js","xmi2-auto-patterns.js","xmi2-drawings.js","xmi2-drawing-layer.js","xmi2-chart-studio.js"])
  assert.match(html,new RegExp('src="/xmi2/'+src.replace(".","\\.")+'"'));
 assert.match(html,/HISTORICAL IMPORT ONLY/);
 assert.match(html,/href="\/xmi"/);
 const studio=read("public/xmi2/xmi2-chart-studio.js");
 for(const forbidden of ["fetch(","WebSocket(","placeOrder","/api/xmi/bridge","DATABASE_URL"]){
  assert.equal(studio.includes(forbidden),false,"Unexpected live route: "+forbidden);
 }
});
test("Existing gateway XMI entry links to isolated offline studio",()=>{
 const page=read("app/xmi/XMIWorkstation.jsx");
 assert.match(page,/href="\/xmi2\/chart-studio.html"/);
 assert.match(page,/Import Only/);
 const policy=read("lib/xmiBridgePolicy.mjs");
 assert.match(policy,/IMPORT_ONLY_POLICY|HISTORICAL_IMPORT_ONLY/);
});
