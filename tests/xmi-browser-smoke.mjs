/* Browser regression smoke against local Next.js dev server.
 * Candle fixtures are mocked ONLY inside this isolated CI test.
 * No test data, credentials or synthetic prices are ever deployed to users.
 */
import {chromium} from "playwright";
import assert from "node:assert/strict";
const root=process.env.XMI_SMOKE_ORIGIN||"http://127.0.0.1:3000";
const browser=await chromium.launch({headless:true,args:["--no-sandbox"]});
const page=await browser.newPage({viewport:{width:1500,height:900},deviceScaleFactor:1});
const runtimeErrors=[];
page.on("pageerror",e=>runtimeErrors.push(String(e.stack||e.message||e)));
page.on("console",msg=>{if(msg.type()==="error")runtimeErrors.push(msg.text());});
function barsFor(resolution){
 const step={"1m":60,"5m":300,"15m":900,"30m":1800,"1H":3600,"4H":14400,"1D":86400}[resolution]||300;
 const now=Math.floor(Date.now()/1000/step)*step;
 return Array.from({length:260},(_,i)=>{
  const x=1.08+i*.00001+Math.sin(i*.2)*.0004,close=x+Math.sin(i*.4)*.00015;
  return {time:now-(259-i)*step,open:x,high:Math.max(x,close)+.00013,
   low:Math.min(x,close)-.00013,close,volume:100+i%23};
 });
}
await page.route("**/api/xmi/live?**",async route=>{
 const u=new URL(route.request().url());
 const resolution=u.searchParams.get("resolution")||"5m";
 const data={ok:true,readOnly:true,market:"forex",provider:"TradeLocker",
  symbol:u.searchParams.get("symbol")||"EURUSD",resolution,
  asOf:new Date().toISOString(),delivery:"polling",volumeBasis:"broker-tick",
  bars:barsFor(resolution)};
 await route.fulfill({status:200,contentType:"application/json",body:JSON.stringify(data)});
});
try{
 const response=await page.goto(root+"/xmi",{waitUntil:"domcontentloaded",timeout:45000});
 assert.equal(response.status(),200,"XMI route must load");
 await page.getByText("CANDLES RECEIVING",{exact:true}).first().waitFor({timeout:30000});
 await page.waitForTimeout(1500); // Check recursive effect updates after first market snapshot.
 assert.equal(await page.getByText("Chart display unavailable").count(),0,
  "All actual-price widgets must remain mounted");
 assert.equal(await page.getByText("Application error:").count(),0);
 assert.ok(await page.locator("canvas").count()>0,"Lightweight Charts must create real canvases");
 const v=await page.evaluate(()=>{
  const body=getComputedStyle(document.body),root=document.querySelector("[data-xmi-root]");
  return {marginTop:body.marginTop,paddingTop:body.paddingTop,maxWidth:body.maxWidth,
   shellWidth:root?.getBoundingClientRect().width,viewport:innerWidth,
   background:body.backgroundColor};
 });
 assert.equal(v.marginTop,"0px","Gateway's root 40px top margin must be removed");
 assert.equal(v.paddingTop,"0px","Gateway's root 20px body padding must be removed");
 assert.equal(v.maxWidth,"none","Gateway 900px width cap must be removed");
 assert.ok(v.shellWidth>=v.viewport*.94,"Chart workstation must use almost full viewport width");
 assert.notEqual(v.background,"rgb(255, 255, 255)","White page background must be removed");
 await page.locator('button[title="Indicators"]').click();
 await page.getByPlaceholder("Search technical or market structure…").waitFor();
 await page.getByPlaceholder("Search technical or market structure…").fill("BOS");
 assert.ok(await page.getByLabel("BOS timeframe").count()===1);
 await page.locator('button[title="Chart Settings"]').click();
 await page.getByText("Chart type",{exact:true}).waitFor();
 await page.getByLabel("Chart type").selectOption("Line");
 await page.waitForTimeout(950);
 assert.equal(await page.getByText("Chart display unavailable").count(),0,
  "Switching to Line must not crash chart");
 await page.getByLabel("Chart type").selectOption("Candlesticks");
 await page.waitForTimeout(950);
 assert.equal(await page.getByText("Chart display unavailable").count(),0,
  "Returning to candles must not crash chart");
 await page.locator('button[title="Focus Mode"]').click();
 assert.equal(await page.getByText("Gateway home").isVisible(),false,"Focus mode hides navigation");
 await page.locator('button[title="Focus Mode"]').click();
 assert.equal(await page.getByText("Gateway home").isVisible(),true,"Focus mode restores navigation");
 await page.waitForTimeout(850);
 assert.deepEqual(runtimeErrors,[],"Client console and page must have no runtime errors");
 console.log("PASS XMI browser: candles mounted, tool settings switched, focus restored, body edge-to-edge");
}finally{await browser.close();}
