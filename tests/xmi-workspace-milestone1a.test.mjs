import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {DEFAULT_SHELL_UI,CHART_UI_KEY,SHELL_UI_KEY,TABS,normalizeShellUI,normalizeChartUI}
 from "../lib/xmiWorkspaceState.mjs";
test("Five tabs exist with independent collapse and maximize state",()=>{
 assert.deepEqual(TABS,["live","research","strategy","journal","admin"]);
 assert.ok(CHART_UI_KEY!==SHELL_UI_KEY);
 const shell=normalizeShellUI({tab:"journal",showBanner:false,
  collapsed:{journal:true,research:true,unknown:true},
  maximized:{journal:true,admin:true,unknown:true}});
 assert.equal(shell.tab,"journal");
 assert.equal(shell.showBanner,false);
 assert.equal(shell.collapsed.journal,true);
 assert.equal(shell.collapsed.live,false);
 assert.equal(shell.maximized.admin,true);
 assert.equal(Object.keys(shell.collapsed).length,5);
 assert.deepEqual(normalizeShellUI(null),DEFAULT_SHELL_UI);
});
test("Shell migration tolerates legacy settings and rejects malformed workspace ids",()=>{
 assert.equal(normalizeShellUI({tab:"deleted"},{showTabs:false}).tab,"live");
 assert.equal(normalizeShellUI({}, {showBanner:false,showTabs:false}).showTabs,false);
 assert.equal(normalizeShellUI({showTabs:true},{showTabs:false}).showTabs,true);
 assert.equal(normalizeShellUI({collapsed:["live"]}).collapsed.live,false);
});
test("Chart layout restores bounded tickers, timeframe, rails and active slot",()=>{
 const record=normalizeChartUI({watchlist:["FX:GBPUSD","NASDAQ:AAPL"],
  chartKeys:["FX:GBPUSD","NASDAQ:AAPL","FX:EURUSD","FX:USDJPY"],
  resolutions:["1m","1D","5m","1H"],layout:2,focus:1,
  leftView:"snapshot",watchVisible:false,intelVisible:false,autoFib:true,
  maximized:true});
 assert.equal(record.layout,2);
 assert.equal(record.focus,1);
 assert.equal(record.chartKeys[1],"NASDAQ:AAPL");
 assert.equal(record.resolutions[1],"1D");
 assert.deepEqual(record.watchlist,["FX:GBPUSD","NASDAQ:AAPL"]);
 assert.equal(record.leftView,"snapshot");
 assert.equal(record.watchVisible,false);
 assert.equal(record.maximized,true);
});
test("Invalid chart layouts fail back to safe values, with no arbitrary URL or script",()=>{
 const record=normalizeChartUI({watchlist:["BOGUS","NASDAQ:AAPL"],
  chartKeys:["javascript:alert(1)"],resolutions:["bad"],
  layout:100,focus:100,leftView:"iframe"});
 assert.equal(record.layout,1);
 assert.equal(record.focus,0);
 assert.equal(record.chartKeys[0],"FX:EURUSD");
 assert.equal(record.resolutions[0],"5m");
 assert.equal(record.leftView,"watchlist");
 assert.ok(record.watchlist.length>0);
 assert.ok(record.watchlist.every(x=>/^(FX:|NASDAQ:|NYSE:|AMEX:|ARCA:)/.test(x)));
});
test("Trading Journal remains a separate mounted component and broker authorization unchanged",()=>{
 const workstation=readFileSync(new URL("../app/xmi/XMIWorkstation.jsx",import.meta.url),"utf8");
 const live=readFileSync(new URL("../app/xmi/XMIEngineDesk.jsx",import.meta.url),"utf8");
 const source=readFileSync(new URL("../app/api/xmi/live/route.js",import.meta.url),"utf8");
 assert.match(workstation,/id:"journal",title:"Trading Journal"/);
 assert.match(workstation,/hidden=\{tab!=="journal"\}/);
 assert.match(workstation,/<XMICoachPanel ticker=\{item.key\}/);
 assert.equal((workstation.match(/<XMICoachPanel/g)||[]).length,1);
 assert.match(workstation,/workspaceControls\("admin"\)/);
 assert.match(workstation,/workspaceControls\("journal"\)/);
 assert.match(live,/CHART_UI_KEY/);
 assert.match(source,/verifySession\(/);
 assert.doesNotMatch(workstation,/placeOrder|executeOrder|submitOrder/);
});
