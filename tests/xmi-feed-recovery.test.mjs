import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {nextFeedDelay,feedHealth,retryableFeedError} from "../lib/xmiFeedRecovery.mjs";
test("Adaptive polling respects candle resolution and close-boundary estimates",()=>{
 const now=Date.parse("2026-10-29T12:04:55.000Z");
 const close=nextFeedDelay({resolution:"5m",now});
 assert.equal(close,8000);
 assert.equal(nextFeedDelay({resolution:"5m",now:now+5000}),25000);
 assert.equal(nextFeedDelay({resolution:"1m",now:now+5000}),15000);
 assert.equal(nextFeedDelay({resolution:"1H",now:now+5000}),60000);
 assert.equal(nextFeedDelay({resolution:"4H",now:now+5000}),120000);
});
test("Hidden tabs reduce broker polling and failures apply bounded exponential backoff",()=>{
 const now=Date.parse("2026-10-29T12:01:00.000Z");
 assert.equal(nextFeedDelay({resolution:"1m",now,hidden:true}),120000);
 assert.equal(nextFeedDelay({resolution:"5m",now,hidden:true}),120000);
 assert.equal(nextFeedDelay({resolution:"4H",now,hidden:true}),120000);
 assert.equal(nextFeedDelay({resolution:"1D",now,hidden:true}),180000);
 assert.equal(nextFeedDelay({resolution:"5m",now,failures:1}),50000);
 assert.equal(nextFeedDelay({resolution:"5m",now,failures:2}),100000);
 assert.equal(nextFeedDelay({resolution:"5m",now,failures:9}),300000);
 assert.throws(()=>nextFeedDelay({resolution:"invalid"}),/Unsupported/);
});
test("Feed diagnostics never classify unavailable, historical or stale candles as live",()=>{
 const t=Date.now();
 const good=feedHealth({phase:"ready",quality:"CURRENT",lastCheckedAt:t,
  lastSuccessAt:t,lastClosedAt:t-60000});
 assert.equal(good.isLive,true);assert.equal(good.warning,false);
 for(const [phase,quality] of [
  ["historical","HISTORICAL"],["stale","STALE"],["error","UNAVAILABLE"],
  ["disabled","UNAVAILABLE"],["locked","UNAVAILABLE"],["empty","NO_DATA"]
 ]){
  const actual=feedHealth({phase,quality,lastCheckedAt:t,lastSuccessAt:t-60000,failures:2});
  assert.equal(actual.isLive,false,phase);
  if(phase!=="historical")assert.equal(actual.warning,true,phase);
  assert.equal(actual.retries,2);
 }
 assert.equal(feedHealth({phase:"ready",quality:"INVALID_TIME"}).warning,true);
});
test("Unauthorized/disabled/origin-denied feed errors never trigger automatic retries",()=>{
 for(const code of ["FEED_DISABLED","FEED_LOCKED","ORIGIN_DENIED"])
  assert.equal(retryableFeedError(code),false);
 for(const code of ["SOURCE_UNAVAILABLE",undefined])
  assert.equal(retryableFeedError(code),true);
});
test("Chart invalidates old analysis on failures and displays last verified timestamps",()=>{
 const code=readFileSync(new URL("../app/xmi/XMILiveChart.jsx",import.meta.url),"utf8");
 assert.match(code,/stats:null,last:prev.last,quality:"UNAVAILABLE"/);
 assert.match(code,/if\(!retained\)for\(const key of Object\.keys\(all\)\)all\[key\]\?\.setData\(\[\]\)/);
 assert.match(code,/health\.warning\?<div className=\{styles\.feedOverlayWarning\}/);
 assert.match(code,/document\.addEventListener\("visibilitychange",onVisible\)/);
 assert.match(code,/clearTimeout\(requestTimeout\)/);
 assert.match(code,/new DOMException\("Read-only candle request exceeded 15 seconds","TimeoutError"\)/);
 assert.doesNotMatch(code,/placeOrder|submitOrder|executeOrder/);
});
