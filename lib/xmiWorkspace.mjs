/* Public TradingView workspace settings. This module has no broker execution access. */
export const DEFAULT_CHARTS=Object.freeze([
  {symbol:"AMEX:SPY",interval:"5"},
  {symbol:"NASDAQ:QQQ",interval:"15"},
  {symbol:"NASDAQ:AAPL",interval:"60"},
  {symbol:"NASDAQ:NVDA",interval:"D"}
]);
export const INTERVALS=Object.freeze([
 ["1","1m"],["2","2m"],["3","3m"],["5","5m"],["10","10m"],
 ["15","15m"],["30","30m"],["60","1h"],["240","4h"],["D","1D"]
]);
export const VENUES=Object.freeze(["AMEX","ARCA","NASDAQ","NYSE"]);
export function normalizeTicker(raw){
 const value=String(raw??"").trim().toUpperCase();
 // Require an equity venue to avoid routing TradeLocker forex/futures into XMI.
 const parts=value.split(":");
 if(parts.length!==2 || !VENUES.includes(parts[0]) ||
   !/^[A-Z][A-Z0-9.-]{0,11}$/.test(parts[1]))
   throw Error("Use AMEX, ARCA, NASDAQ or NYSE followed by a stock/ETF ticker, e.g. NASDAQ:AAPL.");
 return value;
}
export function validInterval(interval){
 return INTERVALS.some(([id])=>id===interval);
}
export function widgetSettings(spec){
 const symbol=normalizeTicker(spec?.symbol);
 const interval=validInterval(spec?.interval)?spec.interval:"5";
 return Object.freeze({
   autosize:true,symbol,interval,timezone:"America/New_York",
   theme:"dark",style:"1",locale:"en",toolbar_bg:"#0b1526",
   enable_publishing:false,allow_symbol_change:false,hide_side_toolbar:false,
   hide_top_toolbar:false,withdateranges:true,hide_legend:false,
   save_image:true,calendar:false,details:true,hotlist:false,
   studies:["Volume@tv-basicstudies"],
   support_host:"https://www.tradingview.com"
 });
}
