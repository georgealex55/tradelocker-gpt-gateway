import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const path=new URL("../app/xmi/XMILiveChart.jsx",import.meta.url);
const source=readFileSync(path,"utf8");
test("visible-chart active prop cannot be shadowed inside the polling effect",()=>{
 assert.match(source,/if\(!libReady\|\|!series\.current\|\|!active\)return;/);
 assert.match(source,/let running=true,abort=null,timer=null(?:,failures=0)?;/);
 assert.doesNotMatch(source,/let active=true,abort=null,timer=null;/);
 assert.match(source,/return \(\)=>\{running=false;[\s\S]*?abort\?\.abort\(\)/);
});
