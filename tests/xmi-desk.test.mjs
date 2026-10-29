import test from "node:test";
import assert from "node:assert/strict";
import {DEFAULT_CHARTS} from "../lib/xmiWorkspace.mjs";
import {focusedChart,focusAfterLayout,updateSymbols,updateTimeframe,resolveTicker,splitTicker} from "../lib/xmiDeskState.mjs";
const charts=DEFAULT_CHARTS.map(x=>({...x}));
test("One focused chart determines the research ticker",()=>{
 assert.equal(focusedChart(charts,0).symbol,"AMEX:SPY");
 assert.equal(focusedChart(charts,2).symbol,"NASDAQ:AAPL");
 assert.equal(focusedChart(charts,999).symbol,"AMEX:SPY");
 assert.equal(focusedChart(charts,-1).symbol,"AMEX:SPY");
});
test("Loading a ticker changes only the selected chart by default",()=>{
 const next=updateSymbols(charts,1,"nasdaq:tsla");
 assert.deepEqual(next.map(x=>x.symbol),["AMEX:SPY","NASDAQ:TSLA","NASDAQ:AAPL","NASDAQ:NVDA"]);
 assert.equal(focusedChart(next,1).symbol,"NASDAQ:TSLA");
 assert.equal(charts[1].symbol,"NASDAQ:QQQ");
});
test("Link symbols is explicit and affects all charts only when checked",()=>{
 const next=updateSymbols(charts,2,"NYSE:IBM",true);
 assert.ok(next.every(x=>x.symbol==="NYSE:IBM"));
 assert.equal(charts[0].symbol,"AMEX:SPY");
});
test("Switching layout resets offscreen focus and retains visible focus",()=>{
 assert.equal(focusAfterLayout(3,1),0);
 assert.equal(focusAfterLayout(1,2),1);
 assert.equal(focusAfterLayout(3,4),3);
 assert.throws(()=>focusAfterLayout(0,3),/layout/);
});
test("Per-chart timeframe changes are independent",()=>{
 const next=updateTimeframe(charts,2,"5");
 assert.equal(next[2].interval,"5");
 assert.equal(next[0].interval,charts[0].interval);
 assert.throws(()=>updateTimeframe(charts,0,"90"),/Invalid/);
});
test("Ticker input cannot route forex or futures symbols",()=>{
 assert.throws(()=>updateSymbols(charts,0,"OANDA:USDCHF"),/Use AMEX/);
 assert.throws(()=>updateSymbols(charts,0,"CME:ES1!"),/Use AMEX/);
 assert.throws(()=>updateSymbols(charts,55,"NASDAQ:AAPL"),/not found/);
});

test("Plain ticker entry uses chosen stock exchange, full codes still accepted",()=>{
 assert.equal(resolveTicker("spy","AMEX"),"AMEX:SPY");
 assert.equal(resolveTicker("aapl","NASDAQ"),"NASDAQ:AAPL");
 assert.equal(resolveTicker("NYSE:IBM","NASDAQ"),"NYSE:IBM");
 assert.deepEqual(splitTicker("ARCA:XLK"),{exchange:"ARCA",ticker:"XLK"});
 assert.throws(()=>resolveTicker("ES1!","CME"),/exchange/);
 assert.throws(()=>resolveTicker("USDCHF","OANDA"),/exchange/);
 assert.throws(()=>resolveTicker("BO GUS","NYSE"),/Use AMEX/);
});
