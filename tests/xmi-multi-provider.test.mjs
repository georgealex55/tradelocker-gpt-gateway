import test from "node:test";
import assert from "node:assert/strict";
import {parseInstrument,computeFive,quoteState,SYDNEY_FOREX_4H} from "../lib/xmiLiveMath.mjs";
import {getMultiProviderSnapshot,parseProviderBars,providerForInstrument,
 XMI_MULTI_PROVIDER_MODE,providerConfigured} from "../lib/xmiMultiProvider.mjs";
import {productionFeedConfigured,issueSession,verifySession,passphraselessStagingFeed,passphraselessProductionFeed} from "../lib/xmiProductionFeedAuth.mjs";
import {NextRequest} from "next/server.js";
import {GET as stagingFeedStatus,POST as stagingUnlock} from "../app/api/xmi/feed-session/route.js";
import {GET as stagingCandleRoute} from "../app/api/xmi/live/route.js";
import {createHash} from "node:crypto";
import {inspectCandleQuality} from "../lib/xmiDataQuality.mjs";
import {detectStructure,mapStructureToChart} from "../lib/xmiStructure.mjs";
import {nextFeedDelay} from "../lib/xmiFeedRecovery.mjs";
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
const forexHours=(...dates)=>({status:"ok",meta:{timezone:"UTC"},values:dates.map(datetime=>({
 datetime,open:"1.1000",high:"1.1010",low:"1.0990",close:"1.1005"
}))});
test("Forex 4H candles retain native timestamps and close correctly across Sydney clock changes",()=>{
 const spring=forexHours("2026-10-03 09:00:00","2026-10-03 13:00:00","2026-10-03 16:00:00");
 const at=Date.parse("2026-10-03T16:30:00Z");
 const {bars,volumeBasis,candleSchedule}=parseProviderBars(spring,"forex","EURUSD","4H",at);
 assert.equal(candleSchedule,SYDNEY_FOREX_4H);
 const times=[9,13,16].map(hour=>Date.UTC(2026,9,3,hour)/1000);
 assert.deepEqual(bars.map(bar=>bar.time),times);
 assert.deepEqual(bars.map(bar=>bar.closed),[true,true,false]);
 assert.equal(bars[1].closeTime,times[2]);
 assert.equal(bars[1].close,1.1005);
 const stats=computeFive(bars,"4H",at,volumeBasis,{},candleSchedule);
 assert.equal(quoteState(stats.lastClosed,at,"4H"),"CURRENT");
 assert.equal(inspectCandleQuality({bars:stats.bars,resolution:"4H",asOf:at,now:at,sourceQuality:"CURRENT"}).lastClosedTime,times[1]);
 assert.equal(detectStructure(stats.bars,"4H",at,candleSchedule).completedBars,2);
 assert.equal(mapStructureToChart({time:times[1],confirmedAt:times[2]},stats.bars,"4H").chartTime,times[1]);

 const autumn=forexHours("2026-04-04 12:00:00","2026-04-04 17:00:00");
 const beforeClose=Date.parse("2026-04-04T16:30:00Z");
 assert.equal(parseProviderBars(autumn,"forex","EURUSD","4H",beforeClose).bars[0].closed,false);
 const later=Date.parse("2026-04-04T22:00:00Z");
 const autumnBars=parseProviderBars(autumn,"forex","EURUSD","4H",later).bars;
 assert.equal(autumnBars[0].closeTime-autumnBars[0].time,5*3600);
 assert.equal(inspectCandleQuality({bars:autumnBars,resolution:"4H",asOf:later,now:later,sourceQuality:"CURRENT"}).recentGaps,0);
 assert.throws(()=>parseProviderBars(forexHours("2026-10-02 16:00:00"),"forex","EURUSD","4H",at),{code:"INVALID_PROVIDER_CANDLES"});
});
test("Forex 4H refresh and cache expire at the native candle boundary",async()=>{
 const before=Date.parse("2026-09-29T12:59:00Z"),after=before+65000;
 const request={symbol:"NZDUSD",resolution:"4H"};
 let calls=0;
 const fetchImpl=async(url)=>{
  calls++;
  assert.equal(new URL(url).searchParams.get("interval"),"4h");
  return json(forexHours("2026-09-29 09:00:00"));
 };
 await getMultiProviderSnapshot(request,{env,now:before,fetchImpl});
 await getMultiProviderSnapshot(request,{env,now:before+30000,fetchImpl});
 assert.equal(calls,1);
 assert.equal(nextFeedDelay({resolution:"4H",now:before,provider:"Twelve Data",candleSchedule:SYDNEY_FOREX_4H}),65000);
 await getMultiProviderSnapshot(request,{env,now:after,fetchImpl});
 assert.equal(calls,2);
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
test("Twelve Data request cache is aligned with the >=5m credit-safe buckets",async()=>{
 let calls=0;
 const data={status:"ok",meta:{timezone:"UTC"},values:rows.map(x=>({
  datetime:x.t.replace("T"," ").replace(".000Z",""),
  open:x.o,high:x.h,low:x.l,close:x.c}))};
 const first=now+31*300000;
 const fetchImpl=async()=>{calls++;return json(data)};
 const request={symbol:"USDJPY",resolution:"5m"};
 await getMultiProviderSnapshot(request,{env,now:first,fetchImpl});
 await getMultiProviderSnapshot(request,{env,now:first+200000,fetchImpl});
 assert.equal(calls,1,"Within one 5m bucket do not spend additional FX credit");
 await getMultiProviderSnapshot(request,{env,now:Math.floor(first/300000)*300000+300000+5000,fetchImpl});
 assert.equal(calls,2,"A new candle bucket may request a new vendor snapshot");
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

test("Exact-branch staging loads read-only candles without a feed password or signed cookie",async()=>{
 const values={
  VERCEL_ENV:"preview",VERCEL_GIT_COMMIT_REF:"feature/xmi-alpaca-twelvedata-staging-20261104",
  XMI_STAGING_FEED_ENABLED:"true",XMI_STAGING_NO_PASSPHRASE:"true",
  XMI_DATA_PROVIDER_MODE:"alpaca-twelvedata",
  XMI_READONLY_MARKET_DATA_ENABLED:"true"
 };
 const keys=[...Object.keys(values),"XMI_FEED_PASSWORD_SHA256","XMI_FEED_SESSION_SECRET"];
 const original=Object.fromEntries(keys.map(k=>[k,process.env[k]]));
 try{
  Object.assign(process.env,values);
  delete process.env.XMI_FEED_PASSWORD_SHA256;
  delete process.env.XMI_FEED_SESSION_SECRET;
  assert.equal(passphraselessStagingFeed(process.env),true);
  assert.equal(productionFeedConfigured(process.env),false);
  const origin="https://staging-xmi.example.test";
  const status=await stagingFeedStatus(new NextRequest(origin+"/api/xmi/feed-session"));
  assert.equal(status.status,200);
  const details=await status.json();
  assert.equal(details.automatic,true);
  assert.equal(details.configured,true);
  assert.equal(details.authenticated,true);
  assert.equal(details.requiresPassphrase,false);
  const candle=await stagingCandleRoute(new NextRequest(origin+"/api/xmi/live?symbol=INVALID&resolution=5m"));
  assert.equal(candle.status,400,"Invalid symbol must be rejected after staging access control");
  const locked=await stagingUnlock(new NextRequest(origin+"/api/xmi/feed-session",{method:"POST"}));
  assert.equal(locked.status,405,"Staging must not require or accept a feed passphrase");
  assert.equal(passphraselessStagingFeed({...process.env,VERCEL_GIT_COMMIT_REF:"main"}),false);
  assert.equal(passphraselessStagingFeed({...process.env,VERCEL_ENV:"production"}),false);
  assert.equal(passphraselessStagingFeed({...process.env,XMI_STAGING_NO_PASSPHRASE:"false"}),false);
  assert.equal(passphraselessStagingFeed({...process.env,XMI_READONLY_MARKET_DATA_ENABLED:"false"}),false);
 }finally{
  for(const k of keys){if(original[k]===undefined)delete process.env[k];else process.env[k]=original[k];}
 }
});

test("Production read-only candles are accessible without a passphrase only with exact production flags",async()=>{
 const values={
  VERCEL_ENV:"production",XMI_PRODUCTION_NO_PASSPHRASE:"true",
  XMI_DATA_PROVIDER_MODE:"alpaca-twelvedata",
  XMI_READONLY_MARKET_DATA_ENABLED:"true",
  XMI_STAGING_NO_PASSPHRASE:"false",XMI_STAGING_FEED_ENABLED:"false"
 };
 const keys=[...Object.keys(values),"XMI_FEED_PASSWORD_SHA256","XMI_FEED_SESSION_SECRET"];
 const before=Object.fromEntries(keys.map(key=>[key,process.env[key]]));
 try{
  Object.assign(process.env,values);
  delete process.env.XMI_FEED_PASSWORD_SHA256;
  delete process.env.XMI_FEED_SESSION_SECRET;
  assert.equal(passphraselessProductionFeed(process.env),true);
  assert.equal(passphraselessStagingFeed(process.env),false);
  assert.equal(productionFeedConfigured(process.env),false);
  const origin="https://xmi.example.test";
  const status=await stagingFeedStatus(new NextRequest(origin+"/api/xmi/feed-session"));
  assert.equal(status.status,200);
  const details=await status.json();
  assert.deepEqual({automatic:details.automatic,requiresPassphrase:details.requiresPassphrase,
   authenticated:details.authenticated,scope:details.scope},
   {automatic:true,requiresPassphrase:false,authenticated:true,scope:"candles-only"});
  const allowed=await stagingCandleRoute(new NextRequest(origin+"/api/xmi/live?symbol=NOT_A_SYMBOL"));
  assert.equal(allowed.status,400,"Valid environment reaches input validation without a cookie");
  const external=await stagingCandleRoute(new NextRequest(origin+"/api/xmi/live?symbol=EURUSD",{
   headers:{origin:"https://untrusted.example", "sec-fetch-site":"cross-site"}
  }));
  assert.equal(external.status,403,"Reject browser cross-origin candle requests");
  assert.equal((await stagingUnlock(new NextRequest(origin+"/api/xmi/feed-session",{method:"POST"}))).status,405);
  assert.equal(passphraselessProductionFeed({...process.env,VERCEL_ENV:"preview"}),false);
  assert.equal(passphraselessProductionFeed({...process.env,XMI_DATA_PROVIDER_MODE:"tradelocker"}),false);
  assert.equal(passphraselessProductionFeed({...process.env,XMI_PRODUCTION_NO_PASSPHRASE:"false"}),false);
  assert.equal(passphraselessProductionFeed({...process.env,XMI_READONLY_MARKET_DATA_ENABLED:"false"}),false);
 }finally{
  for(const key of keys){
   if(before[key]===undefined)delete process.env[key];
   else process.env[key]=before[key];
  }
 }
});
