import test from "node:test";
import assert from "node:assert/strict";
import {DEFAULT_CHARTS,INTERVALS,VENUES,normalizeTicker,validInterval,widgetSettings} from "../lib/xmiWorkspace.mjs";

test("XMI chart defaults are stocks and ETFs, never TradeLocker forex",()=>{
 assert.equal(DEFAULT_CHARTS.length,4);
 for(const chart of DEFAULT_CHARTS){
  assert.equal(normalizeTicker(chart.symbol),chart.symbol);
  assert.equal(validInterval(chart.interval),true);
 }
 assert.ok(VENUES.includes("NASDAQ"));
});
test("Equity ticker format prevents direct FOREX/futures venues and untrusted config",()=>{
 assert.equal(normalizeTicker(" nasdaq:aapl "),"NASDAQ:AAPL");
 for(const symbol of ["USDCHF","FX:USDCHF","OANDA:USDCHF","CME:ES1!","BINANCE:BTCUSDT",
  "https://example.com","NASDAQ:AAPL/../../x","NASDAQ:AA\nPL","NYSE:","NYSE:SP Y"]){
  assert.throws(()=>normalizeTicker(symbol));
 }
});
test("Chart intervals have explicit supported bounds",()=>{
 for(const interval of ["1","2","3","5","10","15","30","60","240","D"])
  assert.equal(validInterval(interval),true);
 assert.equal(validInterval("W"),false);
 assert.equal(validInterval("45"),false);
});
test("Hosted TradingView widget cannot submit orders and has no gateway secrets",()=>{
 const params=widgetSettings({symbol:"NASDAQ:NVDA",interval:"15"});
 assert.equal(params.symbol,"NASDAQ:NVDA");
 assert.equal(params.interval,"15");
 assert.equal(params.allow_symbol_change,false);
 assert.equal(params.enable_publishing,false);
 for(const key of Object.keys(params))
  assert.doesNotMatch(key,/broker|order|execution|tradelocker|credential|api_key/i);
 assert.equal(JSON.stringify(params).includes("APCA-API-SECRET"),false);
});
test("Invalid timeframe falls back to 5-minute chart",()=>{
 assert.equal(widgetSettings({symbol:"NYSE:IBM",interval:"999"}).interval,"5");
 assert.throws(()=>widgetSettings({symbol:"FOREX:USDCHF"}));
});
