import test from "node:test";
import assert from "node:assert/strict";
import {replayHistoricalJson} from "../lib/xmiHistoricalReplay.mjs";
import {saveStrategyVersion,compareSavedStrategyVersions} from "../lib/xmiStrategyResearch.mjs";
import {getLiveSnapshot} from "../lib/xmiLiveProvider.mjs";
const start=Date.parse("2026-11-02T00:00:00Z")/1000;
const candles=(step,count,startAt)=>Array.from({length:count},(_,i)=>{
 const p=1.09+i*.00001+Math.sin(i/7)*.00004;
 return {time:startAt+i*step,open:p-.00002,high:p+.00008,low:p-.00008,close:p,volume:15+i%10};
});
const five=candles(300,110,start),fifteen=candles(900,110,start-73*900);
const source=JSON.stringify({symbol:"EURUSD",resolution:"5m",bars:five});
const confirmationSource=JSON.stringify({symbol:"EURUSD",resolution:"15m",bars:fifteen});
const now=(five.at(-1).time+301)*1000;
test("Historical scalp replay requires independent source-correct 15m confirmation data",()=>{
 assert.throws(()=>replayHistoricalJson(source,{symbol:"EURUSD",resolution:"5m",
  strategyId:"eur-scalp-5m",now}),/15m/);
 const record=replayHistoricalJson(source,{symbol:"EURUSD",resolution:"5m",
  strategyId:"eur-scalp-5m",confirmationSource,now,
  indicatorSettings:{rsiPeriod:8,emaFast:10,emaSlow:30,emaLong:90}});
 assert.equal(record.totalBars,five.length);
 assert.equal(record.confirmationResolution,"15m");
 assert.equal(record.indicatorSettings.rsiPeriod,8);
 assert.ok(record.scored>0,"Genuine 15m imported closes must unlock descriptive research");
 assert.ok(record.observations.some(x=>x.state==="HISTORICAL_OBSERVING"));
 assert.ok(record.observations.every(x=>!/CANDIDATE/.test(x.state)||x.ready));
});
test("Offline comparisons use identical study settings and detect changes in imported confirmation",()=>{
 let versions=saveStrategyVersion([],{strategyId:"eur-scalp-5m",name:"Base",
  edit:{adxMin:25},now:now});
 versions=saveStrategyVersion(versions,{strategyId:"eur-scalp-5m",name:"Stricter",
  edit:{adxMin:30},now:now+1});
 const args={symbol:"EURUSD",resolution:"5m",baseline:versions[0],
  candidate:versions[1],now,confirmationSource,indicatorSettings:{rsiPeriod:9}};
 const a=compareSavedStrategyVersions(source,args);
 const b=compareSavedStrategyVersions(source,{...args,indicatorSettings:{rsiPeriod:12}});
 assert.notEqual(a.datasetLabel,b.datasetLabel,
  "The data comparison label must include exact indicator configuration");
 const edited=JSON.stringify({symbol:"EURUSD",resolution:"15m",bars:fifteen.map((x,i)=>
  i===25?{...x,close:x.close+.00001}:x)});
 const c=compareSavedStrategyVersions(source,{...args,confirmationSource:edited});
 assert.notEqual(a.datasetLabel,c.datasetLabel,"Independent 15m data changes must be visible");
});
test("The read-only provider rejects successful-looking empty candle payloads",async()=>{
 const inputs={symbol:"EURUSD",resolution:"5m"};
 const deps={now, instruments:async()=>new Map([["EURUSD",
  {symbol:"EURUSD",tradableInstrumentId:42,infoRouteId:7}]]),
  history:async()=>({d:{barDetails:[]}})};
 await assert.rejects(getLiveSnapshot(inputs,deps),error=>
  error.code==="EMPTY_CANDLES");
 const snapshot=await getLiveSnapshot(inputs,{...deps,
  history:async()=>({d:{barDetails:five.map(x=>({t:x.time,o:x.open,h:x.high,
   l:x.low,c:x.close,v:x.volume}))}})});
 assert.equal(snapshot.ok,true);
 assert.equal(snapshot.readOnly,true);
 assert.equal(snapshot.bars.length,five.length);
});
