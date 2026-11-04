import test from "node:test";
import assert from "node:assert/strict";
import {parseInstrument,computeFive} from "../lib/xmiLiveMath.mjs";
import {getMultiProviderSnapshot,parseProviderBars,providerForInstrument,
 XMI_MULTI_PROVIDER_MODE,providerConfigured} from "../lib/xmiMultiProvider.mjs";
import {productionFeedConfigured,issueSession,verifySession} from "../lib/xmiProductionFeedAuth.mjs";
import {createHash} from "node:crypto";
const since=Date.parse("2026-11-03T10:00:00Z");
const base=Math.floor(since/300000)*300000;
const rows=Array.from({length:270},(_,i)=>{
 const p=1.1+i*.00002;return {t:new Date(base+i*300000).toISOString(),
  o:p,h:p+.00012,l:p-.00012,c:p+.00002,v:i+10};
});
const json=(payload,status=200)=>new Response(JSON.stringify(payload),{
 status,headers:{"content-type":"application/json"}
});
const env={ALPACA_API_KEY_ID:"staging-id-example-123",
 ALPACA_API_SECRET_KEY:"staging-secret-example-123",TWELVEDATA_API_KEY:"staging-td-example-123"};
const now=base+271*300000;
test("Canonical FX, Alpaca equity and crypto identities remain distinct and validated",()=>{
 assert.equal(parseInstrument("EUR/USD").asset,"forex");
 assert.equal(parseInstrument("NASDAQ:AAPL").asset,"equity");
 assert.deepEqual(parseInstrument("CRYPTO:BTC/USD"),parseInstrument("CRYPTO:BTCUSD"));
 assert.equal(parseInstrument("CRYPTO:ETHUSD").asset,"crypto");
 assert.equal(parseInstrument("CRYPTO:BTCUSD").symbol,"BTCUSD");
 assert.equal(providerForInstrument("FX:EURUSD").provider,"Twelve Data");
 assert.equal(providerForInstrument("CRYPTO:BTCUSD").provider,"Alpaca");
 for(const value of ["CRYPTO:EURUSD","CRYPTO:XRP/GBP","CRYPTO:BAD/123","FOREX:EURUSD"])
  assert.throws(()=>parseInstrument(value));
 assert.equal(XMI_MULTI_PROVIDER_MODE,"alpaca-twelvedata");
 assert.equal(providerConfigured(env,"forex"),true);
 assert.equal(providerConfigured(env,"equity"),true);
 assert.equal(providerConfigured({},"forex"),false);
});
test("Twelve Data forex 5m candles preserve UTC timestamps, no fictitious volume or secrets",async()=>{
 let count=0;
 const result=await getMultiProviderSnapshot({symbol:"EURUSD",resolution:"5m"},{
  env,now,useCache:false,fetchImpl:async(url,options)=>{
   count++;const u=new URL(url);
   assert.equal(u.hostname,"api.twelvedata.com");
   assert.equal(u.pathname,"/time_series");
   assert.equal(u.searchParams.get("symbol"),"EUR/USD");
   assert.equal(u.searchParams.get("interval"),"5min");
   assert.equal(u.searchParams.get("timezone"),"UTC");
   assert.equal(options.method,"GET");
   return json({status:"ok",meta:{timezone:"UTC"},values:rows.map(x=>({
    datetime:x.t.replace("T"," ").replace(".000Z",""),open:String(x.o),
    high:String(x.h),low:String(x.l),close:String(x.c)}))});
  }
 });
 assert.equal(count,1);assert.equal(result.market,"forex");
 assert.equal(result.provider,"Twelve Data");
 assert.equal(result.bars.length,270);
 assert.equal(result.bars[0].volume,null);
 assert.equal(result.volumeBasis,"none");
 assert.equal(computeFive(result.bars,"5m",now,"none").readiness.vwap,false);
 assert.doesNotMatch(JSON.stringify(result),/staging-td-example/);
});
test("Alpaca stock IEX 5m and crypto BTC/USD canonical OHLC are independently parsed",async()=>{
 const stock=await getMultiProviderSnapshot({symbol:"NASDAQ:AAPL",resolution:"5m"},{
  env,now,useCache:false,fetchImpl:async(url,options)=>{
   const u=new URL(url);assert.equal(u.hostname,"data.alpaca.markets");
   assert.equal(u.pathname,"/v2/stocks/AAPL/bars");
   assert.equal(u.searchParams.get("feed"),"iex");
   assert.equal(options.headers["APCA-API-KEY-ID"],env.ALPACA_API_KEY_ID);
   return json({symbol:"AAPL",bars:rows});
  }
 });
 assert.equal(stock.provider,"Alpaca");assert.equal(stock.market,"equity");assert.equal(stock.bars.length,270);
 assert.equal(stock.volumeBasis,"exchange-traded");
 const crypto=await getMultiProviderSnapshot({symbol:"CRYPTO:BTCUSD",resolution:"5m"},{
  env,now,useCache:false,fetchImpl:async(url,options)=>{
   const u=new URL(url);assert.equal(u.pathname,"/v1beta3/crypto/us/bars");
   assert.equal(u.searchParams.get("symbols"),"BTC/USD");
   assert.equal(options.method,"GET");
   return json({bars:{"BTC/USD":rows.map(x=>({...x,o:x.o*50000,
    h:x.h*50000,l:x.l*50000,c:x.c*50000}))}});
  }
 });
 assert.equal(crypto.market,"crypto");assert.equal(crypto.bars.length,270);
 assert.equal(crypto.bars.at(-1).close>10000,true);
 assert.doesNotMatch(JSON.stringify(crypto),/staging-secret-example/);
});
test("Alpaca equity daily New York session dates remain valid UTC chart buckets",async()=>{
 const dates=["2026-10-30T04:00:00Z","2026-11-02T05:00:00Z","2026-11-03T05:00:00Z"];
 const value=await getMultiProviderSnapshot({symbol:"NASDAQ:AAPL",resolution:"1D"},{
  env,now:Date.parse("2026-11-05T03:00:00Z"),useCache:false,
  fetchImpl:async(url)=>json({bars:dates.map((t,i)=>({
   t,o:100+i,h:101+i,l:99+i,c:100.5+i,v:10000
  }))})
 });
 assert.equal(value.bars.length,3);
 assert.deepEqual(value.bars.map(x=>new Date(x.time*1000).toISOString().slice(0,10)),
  ["2026-10-30","2026-11-02","2026-11-03"]);
 assert.equal(value.market,"equity");
 assert.equal(value.bars[0].closed,true);
});

test("Missing credentials, access denials and provider quotas fail closed with safe reason codes",async()=>{
 await assert.rejects(getMultiProviderSnapshot({symbol:"EURUSD",resolution:"1m"},{env:{},useCache:false}),
  x=>x.code==="PROVIDER_NOT_CONFIGURED");
 await assert.rejects(getMultiProviderSnapshot({symbol:"NASDAQ:AAPL",resolution:"1m"},{
  env,now,useCache:false,fetchImpl:async()=>json({message:"private provider internals"},403)
 }),x=>x.code==="UPSTREAM_ACCESS_DENIED"&&!/private/.test(x.message));
 await assert.rejects(getMultiProviderSnapshot({symbol:"EURUSD",resolution:"1m"},{
  env,now,useCache:false,fetchImpl:async()=>json({status:"error",code:429,message:"rate limit"})
 }),x=>x.code==="UPSTREAM_RATE_LIMIT");
 await assert.rejects(getMultiProviderSnapshot({symbol:"EURUSD",resolution:"5m"},{
  env,now,useCache:false,fetchImpl:async()=>json({status:"ok",values:[]})
 }),x=>x.code==="EMPTY_CANDLES");
 await assert.rejects(getMultiProviderSnapshot({symbol:"CRYPTO:BTCUSD",resolution:"5m"},{
  env,now,useCache:false,fetchImpl:async()=>json({bars:{"BTC/USD":[{...rows[0],t:"invalid-date"}]}})
 }),x=>x.code==="INVALID_PROVIDER_CANDLES");
});
test("Concurrent same-symbol provider polls singleflight to one upstream read",async()=>{
 let calls=0;
 const fx=await Promise.all(Array.from({length:4},()=>getMultiProviderSnapshot(
  {symbol:"GBPUSD",resolution:"5m"},{env,now,
   fetchImpl:async()=>{calls++;await new Promise(r=>setTimeout(r,10));return json({
    status:"ok",meta:{timezone:"UTC"},values:rows.map(x=>({
     datetime:x.t.replace("T"," ").replace(".000Z",""),open:x.o,
     high:x.h,low:x.l,close:x.c}))});}
  })));
 assert.equal(calls,1);assert.equal(fx.length,4);
});
test("A protected staging preview cannot bypass the signed feed session",()=>{
 const auth={VERCEL_ENV:"preview",VERCEL_GIT_COMMIT_REF:"feature/xmi-alpaca-twelvedata-staging-20261104",
  XMI_STAGING_FEED_ENABLED:"true",XMI_DATA_PROVIDER_MODE:"alpaca-twelvedata",
  XMI_READONLY_MARKET_DATA_ENABLED:"true",
  XMI_FEED_PASSWORD_SHA256:createHash("sha256").update("test-only-long-pw").digest("hex"),
  XMI_FEED_SESSION_SECRET:"staging-session-secret-is-long-enough-0123456789"};
 assert.equal(productionFeedConfigured(auth),true);
 assert.equal(productionFeedConfigured({...auth,VERCEL_GIT_COMMIT_REF:"main"}),false);
 assert.equal(productionFeedConfigured({...auth,VERCEL_ENV:"production",
  XMI_DATA_PROVIDER_MODE:"bad"}),true);
 assert.equal(productionFeedConfigured({...auth,XMI_STAGING_FEED_ENABLED:"false"}),false);
 assert.equal(productionFeedConfigured({...auth,XMI_FEED_SESSION_SECRET:undefined}),false);
 const token=issueSession(auth,now);
 assert.equal(verifySession(token,auth,now+500),true);
 assert.equal(verifySession(token,{...auth,VERCEL_GIT_COMMIT_REF:"other"},now+500),false);
});
