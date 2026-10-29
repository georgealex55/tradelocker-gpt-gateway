import test from "node:test";
import assert from "node:assert/strict";
import {normalizeChartUI} from "../lib/xmiWorkspaceState.mjs";
import {MAX_WATCHLIST_COLLECTIONS,normalizeWatchlistCollections,createWatchlistCollection,
 renameWatchlistCollection,removeWatchlistCollection,updateActiveWatchlistSymbols}
 from "../lib/xmiWatchlistCollections.mjs";

test("Migrates existing single-list chart UI without losing its qualified instruments",()=>{
 const ui=normalizeChartUI({watchlist:["EURUSD","NASDAQ:AAPL","AMEX:SPY"],layout:2,focus:1});
 assert.equal(ui.activeWatchlistId,"main");
 assert.deepEqual(ui.watchlists,[{id:"main",name:"Main",symbols:["FX:EURUSD","NASDAQ:AAPL","AMEX:SPY"]}]);
 assert.deepEqual(ui.watchlist,ui.watchlists[0].symbols);
 assert.equal(ui.layout,2);
 assert.equal(ui.focus,1);
});
test("Named watchlists are isolated and preserve research-only equity identifiers",()=>{
 const start=normalizeWatchlistCollections(null,null,["FX:EURUSD","NASDAQ:AAPL"]);
 const added=createWatchlistCollection(start,{id:"list-b",name:"  Growth   ETFs ",symbol:"AMEX:SPY"});
 assert.equal(added.activeId,"list-b");
 assert.equal(added.lists[1].name,"Growth ETFs");
 const changed=updateActiveWatchlistSymbols(added,["AMEX:SPY","NASDAQ:NVDA"]);
 const renamed=renameWatchlistCollection(changed,"Tech Research");
 assert.deepEqual(renamed.lists[0].symbols,["FX:EURUSD","NASDAQ:AAPL"]);
 assert.deepEqual(renamed.lists[1].symbols,["AMEX:SPY","NASDAQ:NVDA"]);
 const ui=normalizeChartUI({watchlists:renamed.lists,activeWatchlistId:renamed.activeId});
 assert.deepEqual(ui.watchlist,["AMEX:SPY","NASDAQ:NVDA"]);
 assert.equal(ui.watchlists[1].name,"Tech Research");
 assert.deepEqual(removeWatchlistCollection(renamed).lists,start.lists);
});
test("Malformed or duplicate named collections cannot poison normalized chart storage",()=>{
 const main=normalizeWatchlistCollections(null,null,["FX:EURUSD"]);
 for(const [id,name,symbol] of [
  ["main","New","EURUSD"],["other","main","EURUSD"],
  ["uppercase","   ","EURUSD"],["../../secret","Bad","EURUSD"],
  ["other","Valid","CME:ES1!"]
 ])assert.throws(()=>createWatchlistCollection(main,{id,name,symbol}));
 assert.throws(()=>updateActiveWatchlistSymbols(main,[]),/at least one/);
 assert.throws(()=>updateActiveWatchlistSymbols(main,["EURUSD","FX:EURUSD"]),/Duplicate/);
 const invalid={watchlists:[{id:"x",name:"Bad",symbols:["CME:ES1!"]}],activeWatchlistId:"x",
  watchlist:["FX:GBPUSD"]};
 const safe=normalizeChartUI(invalid);
 assert.equal(safe.activeWatchlistId,"main");
 assert.deepEqual(safe.watchlist,["FX:GBPUSD"]);
});
test("Collection limits and active selection are bounded",()=>{
 let state=normalizeWatchlistCollections(null,null,["FX:EURUSD"]);
 for(let i=1;i<MAX_WATCHLIST_COLLECTIONS;i++)
  state=createWatchlistCollection(state,{id:"list-"+i,name:"List "+i,symbol:"EURUSD"});
 assert.equal(state.lists.length,6);
 assert.throws(()=>createWatchlistCollection(state,{id:"too-many",name:"Too many",symbol:"EURUSD"}),/maximum/);
 const restored=normalizeWatchlistCollections(state.lists,"missing");
 assert.equal(restored.activeId,"main");
 assert.throws(()=>normalizeWatchlistCollections([{id:"x",name:"One",symbols:[]}] ),/at least one/);
 assert.throws(()=>normalizeWatchlistCollections([{id:"x",name:"One",symbols:["FX:EURUSD"]},
  {id:"y",name:"one",symbols:["FX:GBPUSD"]}]),/unique/);
});
