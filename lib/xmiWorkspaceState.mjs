/* XMI Milestone 1A: browser-local, versioned workspace UI state.
 * No account identifiers, brokerage secrets, trade records, or orders.
 */
import {parseInstrument} from "./xmiLiveMath.mjs";
import {normalizeWatchlistCollections} from "./xmiWatchlistCollections.mjs";
export const SHELL_UI_KEY="xmi-workspace-ui-v3";
export const CHART_UI_KEY="xmi-chart-ui-v1";
export const TABS=Object.freeze(["live","research","strategy","journal","admin"]);
export const DEFAULT_SHELL_UI=Object.freeze({
 version:1,tab:"live",showBanner:true,showTabs:true,
 collapsed:Object.freeze({live:false,research:false,strategy:false,journal:false,admin:false}),
 maximized:Object.freeze({live:false,research:false,strategy:false,journal:false,admin:false})
});
export function normalizeShellUI(input,legacy={}){
 const x=input&&typeof input==="object"&&!Array.isArray(input)?input:{};
 const old=legacy&&typeof legacy==="object"?legacy:{};
 return {
  version:1,tab:TABS.includes(x.tab)?x.tab:"live",
  showBanner:typeof x.showBanner==="boolean"?x.showBanner:old.showBanner!==false,
  showTabs:typeof x.showTabs==="boolean"?x.showTabs:old.showTabs!==false,
  collapsed:Object.fromEntries(TABS.map(id=>[id,x.collapsed?.[id]===true])),
  maximized:Object.fromEntries(TABS.map(id=>[id,x.maximized?.[id]===true]))
 };
}
const FALLBACK_SYMBOLS=["FX:EURUSD","FX:GBPUSD","FX:USDJPY","FX:USDCHF"];
const RESOLUTIONS=new Set(["1m","5m","15m","30m","1H","4H","1D"]);
const LEFT=new Set(["watchlist","snapshot","news"]);
function instrument(input,fallback){
 try{return parseInstrument(input).key;}catch{return fallback;}
}
export function normalizeChartUI(input){
 const x=input&&typeof input==="object"&&!Array.isArray(input)?input:{};
 // v1 chart UI contained one watchlist. Newer devices retain multiple named
 // collections while keeping the legacy active-list field for compatibility.
 let collections;
 try{collections=normalizeWatchlistCollections(x.watchlists,x.activeWatchlistId,
   x.watchlist??["FX:EURUSD","FX:GBPUSD","FX:USDJPY","FX:USDCHF","FX:AUDUSD","NASDAQ:AAPL","AMEX:SPY"]);}
 catch{
  try{collections=normalizeWatchlistCollections(null,null,x.watchlist??FALLBACK_SYMBOLS);}
  catch{collections=normalizeWatchlistCollections(null,null,FALLBACK_SYMBOLS);}
 }
 const watchlist=collections.lists.find(x=>x.id===collections.activeId).symbols;
 const chartKeys=FALLBACK_SYMBOLS.map((fallback,index)=>instrument(x.chartKeys?.[index],fallback));
 const resolutions=["5m","15m","1H","1D"].map((defaultResolution,index)=>
  RESOLUTIONS.has(x.resolutions?.[index])?x.resolutions[index]:defaultResolution);
 const layout=[1,2,4].includes(x.layout)?x.layout:1;
 const focus=Number.isInteger(x.focus)&&x.focus>=0&&x.focus<layout?x.focus:0;
 return {
  version:1,watchlist,watchlists:collections.lists,activeWatchlistId:collections.activeId,
  chartKeys,resolutions,layout,focus,
  watchOpen:x.watchOpen!==false,watchVisible:x.watchVisible!==false,
  intelOpen:x.intelOpen!==false,intelVisible:x.intelVisible!==false,
  leftView:LEFT.has(x.leftView)?x.leftView:"watchlist",
  orientation:x.orientation==="horizontal"?"horizontal":"vertical",
  autoPatterns:x.autoPatterns!==false,autoFib:x.autoFib===true,
  maximized:x.maximized===true
 };
}
