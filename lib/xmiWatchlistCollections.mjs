/* XMI Milestone 2B: browser-local named watchlists for research only.
 * Never fetches market data, stores broker credentials, or sends trade orders.
 */
import {parseInstrument,validateWatchlist} from "./xmiLiveMath.mjs";
export const MAX_WATCHLIST_COLLECTIONS=6;
export const DEFAULT_WATCHLIST_ID="main";
const START=["FX:EURUSD","FX:GBPUSD","FX:USDJPY","FX:USDCHF","FX:AUDUSD","NASDAQ:AAPL","AMEX:SPY"];
function listName(name){
 if(typeof name!=="string")throw Error("Watchlist name must be text");
 const trimmed=name.trim().replace(/\s+/g," ");
 if(!trimmed||trimmed.length>32)throw Error("Watchlist name must contain 1–32 characters");
 return trimmed;
}
function listId(id){
 if(typeof id!=="string"||!/^[a-z0-9][a-z0-9-]{0,31}$/.test(id))
  throw Error("Invalid watchlist identifier");
 return id;
}
function symbols(values){
 const rows=validateWatchlist(values);
 if(!rows.length)throw Error("Keep at least one instrument in each watchlist");
 return rows.map(x=>x.key);
}
export function normalizeWatchlistCollections(source,activeId,legacy=START){
 const input=Array.isArray(source)&&source.length?source:
  [{id:DEFAULT_WATCHLIST_ID,name:"Main",symbols:legacy}];
 if(input.length>MAX_WATCHLIST_COLLECTIONS)throw Error("Up to six named watchlists are supported");
 const lists=input.map(row=>{
  if(!row||typeof row!=="object"||Array.isArray(row))throw Error("Invalid watchlist record");
  return {id:listId(row.id),name:listName(row.name),symbols:symbols(row.symbols)};
 });
 if(new Set(lists.map(x=>x.id)).size!==lists.length)throw Error("Duplicate watchlist identifier");
 if(new Set(lists.map(x=>x.name.toLocaleLowerCase("en-US"))).size!==lists.length)
  throw Error("Watchlist names must be unique");
 return {lists,activeId:lists.some(x=>x.id===activeId)?activeId:lists[0].id};
}
export function createWatchlistCollection(state,{id,name,symbol}){
 const current=normalizeWatchlistCollections(state.lists,state.activeId);
 if(current.lists.length>=MAX_WATCHLIST_COLLECTIONS)throw Error("Six watchlists maximum");
 const next={id:listId(id),name:listName(name),symbols:symbols([parseInstrument(symbol).key])};
 return normalizeWatchlistCollections([...current.lists,next],next.id);
}
export function renameWatchlistCollection(state,name){
 const current=normalizeWatchlistCollections(state.lists,state.activeId);
 const normalized=listName(name);
 return normalizeWatchlistCollections(current.lists.map(x=>
  x.id===current.activeId?{...x,name:normalized}:x),current.activeId);
}
export function removeWatchlistCollection(state){
 const current=normalizeWatchlistCollections(state.lists,state.activeId);
 if(current.lists.length<=1)throw Error("Keep at least one watchlist");
 const remaining=current.lists.filter(x=>x.id!==current.activeId);
 return normalizeWatchlistCollections(remaining,remaining[0].id);
}
export function updateActiveWatchlistSymbols(state,values){
 const current=normalizeWatchlistCollections(state.lists,state.activeId);
 const next=symbols(values);
 return normalizeWatchlistCollections(current.lists.map(x=>
  x.id===current.activeId?{...x,symbols:next}:x),current.activeId);
}
