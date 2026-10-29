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
// Simulate a configured credential gate throughout hydration; browser test secrets are fake.
await page.route("**/api/xmi/feed-session",async route=>{
 const method=route.request().method();
 await route.fulfill({status:200,contentType:"application/json",
  body:JSON.stringify(method==="POST"?{ok:true,authenticated:true,scope:"candles-only"}:
   {ok:true,configured:true,authenticated:false,scope:"candles-only"})});
});
await page.route("**/api/xmi/context?**",route=>route.fulfill({
 status:200,contentType:"application/json",
 body:JSON.stringify({ok:true,symbol:"EURUSD",ticker:"FX:EURUSD",
  stories:[{title:"EURUSD market rally after euro data beats estimates",scope:"pair-related",
   source:"Research sample",url:"https://example.com/research-article",publishedAt:new Date().toISOString(),
   observedAt:new Date().toISOString()}],
  coverage:{oldestObserved:new Date().toISOString(),newestObserved:new Date().toISOString(),type:"latest-80-only"}})
}));
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
 await page.getByPlaceholder("Search indicators, patterns or market structure…").waitFor();
 await page.getByPlaceholder("Search indicators, patterns or market structure…").fill("BOS");
 assert.ok(await page.getByLabel("BOS timeframe").count()===1);
 await page.locator('button[title="Chart Settings"]').click();
 await page.getByLabel("Chart type").waitFor({timeout:15000});
 await page.getByLabel("Chart type").selectOption("Line");
 await page.waitForTimeout(950);
 assert.equal(await page.getByText("Chart display unavailable").count(),0,
  "Switching to Line must not crash chart");
 await page.getByLabel("Chart type").selectOption("Candlesticks");
 await page.waitForTimeout(950);
 assert.equal(await page.getByText("Chart display unavailable").count(),0,
  "Returning to candles must not crash chart");
 // XMI 2.0 dynamic layout, automatic indicator presets and research clarity.
 assert.ok(await page.getByRole("timer").count()>0,"Candle-close countdown is visible by default");
 await page.getByText("Candle-close countdown (local clock)").waitFor();
 await page.locator('button[title="Strategy"]').click();
 await page.getByRole("button",{name:/Scalp · EMA Momentum/}).click();
 await page.getByText("CANDLES RECEIVING",{exact:true}).first().waitFor({timeout:30000});
 assert.ok(await page.locator('select[aria-label="Choose live strategy"]').count()>0);
 await page.locator('button[title="Indicators"]').click();
 await page.getByPlaceholder("Search indicators, patterns or market structure…").waitFor();
 assert.ok(await page.getByText("Automatic chart patterns · per-type toggles").count()>0);
 const labels=page.getByText("Market structure ·");
 assert.ok(await labels.count()>0);
 const study=page.locator("details").filter({has:page.getByText(/Strategy engine ·/)}).first();
 assert.ok(await study.count()>0,"Research engine must be collapsible");
 await study.locator("summary").click();
 assert.equal(await study.getAttribute("open"),null,"Research engine collapses");
 await study.locator("summary").click();
 const right=page.getByRole("complementary",{name:"Strategy intelligence"});
 assert.equal(await right.getByText("Signal status",{exact:true}).count(),0);
 assert.equal(await right.getByText("Strategy",{exact:true}).count(),0);
 await page.getByRole("button",{name:"Snapshot",exact:true}).click();
 await page.getByRole("button",{name:"Snapshot screen & summarize"}).waitFor();
 await page.getByRole("button",{name:"News / Research",exact:true}).click();
 await page.getByRole("searchbox",{name:"Search news ticker"}).first().waitFor();
 await page.getByText("Positive language",{exact:true}).first().waitFor({timeout:12000});
 await page.getByRole("button",{name:"Watchlist",exact:true}).click();
 await page.getByRole("button",{name:"Hide top banner"}).click();
 assert.equal(await page.getByText("Gateway home").isVisible(),false);
 await page.getByRole("button",{name:"Show top banner"}).click();
 await page.getByRole("button",{name:"Hide tabs"}).click();
 assert.ok(await page.getByRole("combobox",{name:"Switch XMI workspace"}).isVisible());
 await page.getByRole("combobox",{name:"Switch XMI workspace"}).selectOption("strategy");
 assert.ok(await page.getByText("Strategy presets & 9-cell engine").isVisible(),"The strategy tab remains accessible while tabs are hidden");
 await page.getByRole("button",{name:/Swing · EMA Structure/}).last().click();
 await page.getByRole("spinbutton",{name:"RSI positive threshold"}).fill("62");
 await page.getByRole("combobox",{name:"Edit strategy timeframe"}).selectOption("1D");
 assert.equal(await page.getByRole("combobox",{name:"Edit strategy timeframe"}).inputValue(),"1D");
 await page.getByRole("button",{name:"Hide top banner"}).click();
 assert.equal(await page.getByText("Gateway home").isVisible(),false,"Banner visibility is independent on the strategy tab");
 await page.getByRole("combobox",{name:"Switch XMI workspace"}).selectOption("research");
 assert.ok(await page.getByRole("searchbox",{name:"Search news ticker"}).count()>0,"Ticker search is available with tabs hidden");
 await page.getByRole("combobox",{name:"Switch XMI workspace"}).selectOption("live");
 await page.getByRole("button",{name:"Show top banner"}).click();
 await page.getByRole("button",{name:"Show tabs"}).click();
 await page.locator('button[title="Focus Mode"]').click();
 assert.equal(await page.getByText("Gateway home").isVisible(),false,"Focus mode hides navigation");
 await page.locator('button[title="Focus Mode"]').click();
 assert.equal(await page.getByText("Gateway home").isVisible(),true,"Focus mode restores navigation");
 await page.waitForTimeout(850);
 // Local account replaces Google auth; encrypted vault works without network credentials.
 await page.getByRole("button",{name:"Local login / Settings"}).click();
 await page.getByRole("button",{name:"Create account"}).click();
 await page.getByRole("textbox",{name:"Username"}).fill("smoketest");
 await page.getByLabel("Password",{exact:true}).fill("example-browser-test-password-123");
 await page.getByLabel("Confirm password").fill("example-browser-test-password-123");
 await page.getByRole("button",{name:"Create encrypted account"}).click();
 await page.getByText("Local account created.",{exact:false}).waitFor({timeout:12000});
 await page.getByRole("button",{name:"Save settings"}).click();
 await page.getByText("Encrypted preferences saved on this device.",{exact:false}).waitFor({timeout:12000});
 const account=await page.evaluate(()=>localStorage.getItem("xmi-device-account-v1:smoketest"));
 assert.ok(account&&account.includes("AES-256-GCM"),"Encrypted local backup is stored");
 assert.ok(!account.includes("example-browser-test-password"),"Password is never saved");
 // Production's read-only broker endpoint is intentionally disabled. The chart must
 // diagnose this honestly and accept actual user-supplied historical candles instead.
 const expected503Start=runtimeErrors.length;
 await page.route("**/api/xmi/live?**",route=>route.fulfill({
  status:503,contentType:"application/json",
  body:JSON.stringify({ok:false,code:"FEED_DISABLED",error:"Feed not enabled in production"})
 }));
 await page.getByRole("button",{name:"Refresh EURUSD chart"}).click();
 await page.getByText("FEED DISABLED",{exact:true}).first().waitFor({timeout:15000});
 await page.getByRole("link",{name:"Open offline Historical Chart Studio"}).first().waitFor();
 const live=page.locator('article[aria-label="EURUSD live forex chart"]').first();
 const resolution=await live.locator("select").first().inputValue();
 await live.locator('input[type="file"]').setInputFiles({
  name:"historical.json",mimeType:"application/json",
  buffer:Buffer.from(JSON.stringify({symbol:"EURUSD",resolution,bars:barsFor(resolution)}))
 });
 await page.getByText("IMPORTED HISTORY",{exact:true}).first().waitFor({timeout:15000});
 assert.equal(await live.locator("canvas").count()>0,true,"Imported historical candles must render");
 await page.getByRole("button",{name:"Refresh EURUSD chart"}).click();
 await page.getByText("IMPORTED HISTORY",{exact:true}).first().waitFor();
 await page.getByRole("button",{name:"Clear import"}).click();
 await page.getByText("FEED DISABLED",{exact:true}).first().waitFor({timeout:15000});
 // A device-local account must survive a browser reload without contacting any auth API.
 await page.reload({waitUntil:"domcontentloaded"});
 // Next.js can paint SSR buttons before their client event handlers are hydrated.
 await page.getByText("FEED DISABLED",{exact:true}).first().waitFor({timeout:30000});
 await page.getByRole("button",{name:"Local login / Settings"}).click();
 await page.getByRole("textbox",{name:"Username"}).fill("smoketest");
 await page.getByLabel("Password",{exact:true}).fill("example-browser-test-password-123");
 await page.getByRole("button",{name:"Unlock local account"}).click();
 await page.getByText("Signed in locally.",{exact:false}).waitFor({timeout:15000});
 // Research settings sign-in is separate from the server-verified market-data feed unlock.

 await page.getByRole("button",{name:"Unlock read-only feed",exact:true}).click();
 await page.getByRole("textbox",{name:"Feed access passphrase"}).fill("browser-smoke-fixture-only");
 await page.getByRole("button",{name:"Unlock read-only candles"}).click();
 await page.getByRole("button",{name:/Feed unlocked/}).waitFor({timeout:15000});
 assert.deepEqual(runtimeErrors.slice(0,expected503Start),[],"Normal client operation must have no runtime errors");
 // Our deliberate 503 mock produces browser network-console diagnostics; it must
 // not hide unexpected JavaScript exceptions, hydration faults or other console errors.
 const afterDisabled=runtimeErrors.slice(expected503Start);
 assert.ok(afterDisabled.length>0,"The disabled production route must be exercised");
 assert.ok(afterDisabled.every(message=>/Failed to load resource:.*status of 503/.test(message)),
  "Only deliberately simulated disabled-feed responses may emit browser errors: "+afterDisabled.join(" | "));
 console.log("PASS XMI browser: candles mounted, tool settings switched, focus restored, body edge-to-edge");
}finally{await browser.close();}
