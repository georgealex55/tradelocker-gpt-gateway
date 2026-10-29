import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {bridgeEnabled,validateBridgeParams,signBridge,authorizeBridge,signatureInput}
 from "../lib/xmiBridgeAuth.mjs";
const secret="dummy-test-key-for-read-only-private-xmi-bridge-2026";
const params={symbol:"EURUSD",resolution:"5m"};
const now=Date.parse("2026-10-28T22:00:00.000Z");
function env(overrides={}){
 return {VERCEL_ENV:"preview",VERCEL_GIT_COMMIT_REF:"feature/xmi-tradingview-workstation-preview",
  XMI_READONLY_MARKET_DATA_ENABLED:"true",XMI_BRIDGE_ENABLED:"true",
  XMI_BRIDGE_SHARED_SECRET:secret,...overrides};
}
function headers(stamp=now,symbol="EURUSD",key=secret){
 const timestamp=String(stamp);
 const signed=signBridge(key,{symbol,resolution:"5m",timestamp});
 return new Headers({"x-xmi-bridge-timestamp":timestamp,"x-xmi-bridge-signature":signed});
}
test("Signed bridge requires both preview feature flags and strong shared key",()=>{
 assert.equal(bridgeEnabled(env()),true);
 for(const changes of [
  {VERCEL_ENV:"production"},{VERCEL_GIT_COMMIT_REF:"main"},
  {XMI_READONLY_MARKET_DATA_ENABLED:"false"},{XMI_BRIDGE_ENABLED:"false"},
  {XMI_BRIDGE_SHARED_SECRET:"short"}
 ])assert.equal(bridgeEnabled(env(changes)),false);
});
test("Only one canonical FX pair and supported timeframe can be signed",()=>{
 assert.deepEqual(validateBridgeParams(params),params);
 assert.deepEqual(validateBridgeParams({symbol:"eurusd",resolution:"1H"}),{symbol:"EURUSD",resolution:"1H"});
 assert.throws(()=>validateBridgeParams({symbol:"SPY",resolution:"5m"}));
 assert.throws(()=>validateBridgeParams({symbol:"EURUSD",resolution:"3m"}));
});
test("HMAC binds method/path/symbol/timeframe/freshness and rejects replay",()=>{
 const a=headers();
 assert.ok(authorizeBridge({secret,headers:a,params,now}));
 assert.equal(authorizeBridge({secret,headers:a,params,now:now+61000}),false);
 assert.equal(authorizeBridge({secret,headers:headers(now-61000),params,now}),false);
 assert.equal(authorizeBridge({secret,headers:a,params:{symbol:"GBPUSD",resolution:"5m"},now}),false);
 assert.equal(authorizeBridge({secret,headers:a,params:{symbol:"EURUSD",resolution:"15m"},now}),false);
 assert.equal(authorizeBridge({secret,headers:a,params,now:now-61000}),false);
 assert.equal(authorizeBridge({secret,headers:headers(now,"EURUSD","another-long-key-for-tests-and-no-production"),params,now}),false);
 const bogus=new Headers({"x-xmi-bridge-timestamp":String(now),
  "x-xmi-bridge-signature":"z".repeat(64)});
 assert.equal(authorizeBridge({secret,headers:bogus,params,now}),false);
 assert.match(signatureInput({...params,timestamp:now}),/GET\n\/api\/xmi\/bridge\nEURUSD\n5m/);
});
test("Bridge route cannot use order methods, leak broker metadata or allow production",()=>{
 const route=readFileSync(new URL("../app/api/xmi/bridge/route.js",import.meta.url),"utf8");
 assert.match(route,/authorizeBridge/);
 assert.match(route,/bridgeEnabled/);
 assert.doesNotMatch(route,/\b(placeOrder|executeTrade|TRADING_ENABLED)\b/);
 assert.match(route,/readOnly:true/);
 assert.match(route,/export async function POST/);
});
