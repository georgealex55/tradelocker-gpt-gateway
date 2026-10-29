import test from "node:test";
import assert from "node:assert/strict";
import {parseInstrument,validateWatchlist,normalizeBars,computeFive,quoteState} from "../lib/xmiLiveMath.mjs";
import {validatedRequest,previewEnabled,historyPath,extractVerifiedBars,getLiveSnapshot} from "../lib/xmiLiveProvider.mjs";
const base=Date.parse("2026-10-28T10:00:00.000Z");
const candles=Array.from({length:260},(_,i)=>({
 time:(base+i*60000)/1000,
 open:1.08+i*0.00002,high:1.0801+i*0.00002,low:1.0799+i*0.00002,close:1.08005+i*0.00002,volume:i+2
}));
const now=base+(260*60000)+20000;
test("forex-first instrument identity accepts plain pairs and canonical keys",()=>{
 assert.deepEqual(parseInstrument("EUR/USD"),parseInstrument("FX:EURUSD"));
 assert.equal(parseInstrument("USDJPY").asset,"forex");
 assert.equal(parseInstrument("NASDAQ:AAPL").asset,"equity");
 for(const input of ["OANDA:USDCHF","FOREX:USDCHF","CME:ES1!","EUR123","javascript:evil"])
  assert.throws(()=>parseInstrument(input));
});
test("Watchlist is bounded to ten deduped mixed assets",()=>{
 assert.equal(validateWatchlist(["EURUSD","NASDAQ:AAPL"]).length,2);
 assert.throws(()=>validateWatchlist(["EURUSD","EUR/USD"]));
 assert.throws(()=>validateWatchlist(Array(11).fill("EURUSD")));
});
test("Candles normalize time, preserve incomplete candles and close at boundary",()=>{
 const two=candles.slice(0,2).reverse();
 const result=normalizeBars(two,"1m",base+90000);
 assert.equal(result.length,2);
 assert.equal(result[0].closed,true);
 assert.equal(result[1].closed,false);
 assert.equal(result[0].time,base/1000);
 assert.deepEqual(normalizeBars([two[0],two[0]],"1m",now).length,1);
});
test("Invalid OHLC, unaligned timestamps and future data are rejected",()=>{
 assert.throws(()=>normalizeBars([{...candles[0],high:0.5}],"1m",now),/Malformed/);
 assert.throws(()=>normalizeBars([{...candles[0],volume:-4}],"1m",now),/Malformed/);
 assert.throws(()=>normalizeBars([{...candles[0],time:candles[0].time+15}],"1m",now),/Unaligned/);
 assert.throws(()=>normalizeBars([{...candles[0],time:(now+600000)/1000}],"1m",now),/Malformed/);
});
test("All five indicator families compute from real warm history, without synthetic confirmation",()=>{
 const result=computeFive(candles,"1m",now);
 assert.equal(result.bars.length,260);
 assert.equal(result.latest.closed,true);
 assert.equal(result.lastClosed.time,candles.at(-1).time);
 assert.ok(result.overlays.ema200.length>0);
 assert.ok(result.overlays.ema20.length>0);
 assert.ok(result.overlays.rsi.length>0);
 assert.ok(result.overlays.macd.length>0);
 assert.ok(result.overlays.macdSignal.length>0);
 assert.ok(result.overlays.macdHistogram.length>0);
 assert.ok(result.overlays.vwap.length>0);
 assert.equal(result.overlays.volume.length,260);
 assert.deepEqual(result.readiness,{ema:true,rsi:true,macd:true,vwap:true,volume:true});
 assert.equal(result.signal.state,"NO_ACTIVE_STRATEGY");
 assert.match(result.vwapLabel,/proxy/);
});
test("No forex volume means VWAP and volume confirmation unavailable",()=>{
 const result=computeFive(candles.map(x=>({...x,volume:null})),"1m",now);
 assert.equal(result.overlays.vwap.length,0);
 assert.equal(result.overlays.volume.length,0);
 assert.equal(result.readiness.vwap,false);
 assert.equal(result.readiness.volume,false);
});
test("Stale candle detection uses source timestamps",()=>{
 const closed=candles[0];
 assert.equal(quoteState(closed,base+2*60000,"1m"),"CURRENT");
 assert.equal(quoteState(closed,base+20*60000,"1m"),"STALE");
});
test("Broker data is explicitly disabled outside exact preview feature branch",()=>{
 const cfg={VERCEL_ENV:"preview",VERCEL_GIT_COMMIT_REF:"feature/xmi-tradingview-workstation-preview",XMI_READONLY_MARKET_DATA_ENABLED:"true"};
 assert.equal(previewEnabled(cfg),true);
 assert.equal(previewEnabled({...cfg,VERCEL_ENV:"production"}),false);
 assert.equal(previewEnabled({...cfg,XMI_READONLY_MARKET_DATA_ENABLED:"false"}),false);
 assert.equal(previewEnabled({...cfg,VERCEL_GIT_COMMIT_REF:"main"}),false);
 assert.equal(previewEnabled({}),false);
});
test("Only read-only forex input and verified INFO route can form bounded history URL",()=>{
 assert.equal(validatedRequest({symbol:"FX:EURUSD",resolution:"5m"}).resolution,"5m");
 assert.throws(()=>validatedRequest({symbol:"NASDAQ:AAPL",resolution:"5m"}),/Equity live feed/);
 const path=historyPath({tradableInstrumentId:7876,infoRouteId:540002},"1m",now);
 assert.match(path,/^\/trade\/history\?/);
 assert.match(path,/routeId=540002/);
 assert.doesNotMatch(path,/order|position|execution|\/trade\/instruments\//i);
 assert.throws(()=>historyPath({tradableInstrumentId:7876,infoRouteId:null},"1m",now));
});
test("Injected broker reader returns sanitized candles, never raw credentials or account data",async()=>{
 const map=new Map([["EURUSD",{symbol:"EURUSD",tradableInstrumentId:7876,infoRouteId:540002}]]);
 const mock=async path=>{
  assert.ok(path.startsWith("/trade/history?"));
  return {s:"ok",d:{barDetails:candles.map(x=>({t:x.time*1000,o:x.open,h:x.high,l:x.low,c:x.close,v:x.volume}))},accountPassword:"SECRET"};
 };
 const value=await getLiveSnapshot({symbol:"EURUSD",resolution:"1m"},{instruments:async()=>map,history:mock,now});
 assert.equal(value.ok,true);
 assert.equal(value.provider,"TradeLocker");
 assert.equal(value.bars.length,260);
 assert.equal(JSON.stringify(value).includes("SECRET"),false);
 assert.equal(value.delivery,"polling");
 assert.equal(value.readOnly,true);
});
