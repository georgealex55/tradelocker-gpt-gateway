/* Educational closed-candle strategy presets. Never orders, price targets or probabilities. */
export const STRATEGIES=Object.freeze([
 {id:"scalp",name:"Scalp · EMA Momentum",type:"Scalping",timeframe:"1m",indicators:["EMA","RSI","MACD","Volume"],
  rule:"EMA20 vs EMA50 + RSI14 + MACD histogram; verify spread and liquidity separately.",description:"Short intraday trend alignment from closed bars; fast changes and costs can dominate."},
 {id:"day",name:"Day · VWAP Trend",type:"Day trading",timeframe:"15m",indicators:["EMA","VWAP","RSI","Volume"],
  rule:"EMA20 vs EMA50 + session VWAP + RSI14.",description:"Session continuation research; FX VWAP uses tick-volume proxy and is optional."},
 {id:"swing",name:"Swing · EMA Structure",type:"Swing trading",timeframe:"4H",indicators:["EMA","RSI","MACD"],
  rule:"EMA50 vs EMA200 + RSI14 + MACD; confirm higher timeframe context.",description:"Multi-session trend research; gaps, risk, and macro events are not simulated."},
 {id:"eur-london",name:"EUR/USD · Session Momentum Research",type:"Pair-specific scalping",pairs:["EURUSD"],
  timeframe:"5m",indicators:["EMA","RSI","ATR","ADX"],rule:"EMA20/50 + RSI14 + ADX14 + ATR14. Session times not independently verified.",
  description:"EUR/USD trend-strength research; spread, slippage, calendar and profitability not validated."},
 {id:"gbp-breakout",name:"GBP/USD · Donchian Breakout Research",type:"Pair-specific breakout",pairs:["GBPUSD"],
  timeframe:"15m",indicators:["EMA","RSI","ADX","ATR","Donchian"],rule:"Prior-20-bar Donchian boundary and ADX14; no automated scaling.",
  description:"GBP/USD descriptive breakout state; not a verified profitable setup."},
 {id:"jpy-pullback",name:"USD/JPY · Stochastic Pullback Research",type:"Pair-specific scalping",pairs:["USDJPY"],
  timeframe:"5m",indicators:["EMA","RSI","Stochastic","ATR","ADX"],rule:"EMA20/50, Stochastic14/3, ATR14 and ADX14.",
  description:"USD/JPY pullback research; no spread, news, order, stop or profit model."},
 {id:"xmi",name:"XMI · Custom Historical Research",type:"Existing XMI strategy",timeframe:"1H",indicators:["EMA","VWAP","RSI","MACD","Volume"],
  rule:"Reserved for the original XMI hard-confirm conditions; no execution or unvalidated replication.",
  description:"Existing XMI strategy is selectable as a reference but not scored until an independently verified ruleset is integrated.",unscored:true}
]);
const find=(id)=>STRATEGIES.find(x=>x.id===id)||null;
export function strategyById(id){return find(id);}
const at=(series,t)=>Array.isArray(series)?[...series].reverse().find(x=>x.time<=t)?.value:null;
const numeric=n=>typeof n==="number"&&Number.isFinite(n);
function signal(v){return numeric(v)?v>0?1:v<0?-1:0:0;}
function tier(n){return n>0?"bullish":n<0?"bearish":"mixed";}
export function evaluateStrategy(id,stats,quality="CURRENT",edit=null,symbol=null){
 const preset=find(id);if(!preset)throw Error("Unknown research strategy");
 const rsiBull=Number.isInteger(edit?.rsiBull)&&edit.rsiBull>=50&&edit.rsiBull<=75?edit.rsiBull:55;
 const rsiBear=Number.isInteger(edit?.rsiBear)&&edit.rsiBear>=25&&edit.rsiBear<=50?edit.rsiBear:45;
 const needMacd=typeof edit?.requireMacd==="boolean"?edit.requireMacd:id!=="day";
 const needVwap=edit?.requireVwap===true;
 const adxMin=Number.isInteger(edit?.adxMin)&&edit.adxMin>=10&&edit.adxMin<=45?edit.adxMin:20;
 const atrMinPips=typeof edit?.atrMinPips==="number"&&edit.atrMinPips>=0&&edit.atrMinPips<=50?edit.atrMinPips:0;
 const needAdx=edit?.requireAdx===true||Boolean(preset.pairs);
 const needAtr=edit?.requireAtr===true||Boolean(preset.pairs);
 const unavailable={version:1,strategy:id,state:"UNAVAILABLE",zone:4,row:1,col:1,ready:false,
  summary:"Awaiting sufficient verified CLOSED candles; no research stance calculated.",inputs:[]};
 if(preset.unscored)return {...unavailable,state:"NOT_VALIDATED",summary:"Legacy XMI hard-confirm rules are not integrated into this research engine. No signal is inferred."};
 if(preset.pairs&&(!symbol||!preset.pairs.includes(symbol)))
  return {...unavailable,state:"PAIR_NOT_APPLICABLE",summary:"Preset limited to "+preset.pairs.join(", ")+"; select the matching FX pair."};
 // A source may report CURRENT while its observation time is invalid or a
 // previously verified bar is too old. Fail closed, never imply an entry signal.
 if(stats?.dataHealth&&stats.dataHealth.researchReady!==true)
  return {...unavailable,summary:"Candle source integrity check did not pass. Research paused; no directional assessment."};
 if(!stats?.lastClosed||!stats.overlays||!["CURRENT","HISTORICAL"].includes(quality))return {...unavailable,
  summary:quality==="STALE"?"Candle data stale. Engine paused; no entry/exit suggestions.":unavailable.summary};
 const bar=stats.lastClosed,t=bar.time,o=stats.overlays;
 const ema20=at(o.ema20,t),ema50=at(o.ema50,t),ema200=at(o.ema200,t);
 const vwap=at(o.vwap,t),rsi=at(o.rsi,t),macd=at(o.macdHistogram,t);
 const adx=at(o.adx,t),atr=at(o.atr,t),donchianUpper=at(o.donchianUpper,t),
  donchianLower=at(o.donchianLower,t),stochK=at(o.stochK,t),stochD=at(o.stochD,t);
 const pipSize=symbol?.endsWith("JPY")?.01:.0001;
 const atrPips=numeric(atr)?atr/pipSize:null;
 const entries=[
  {name:"EMA20–50 trend",value:numeric(ema20)&&numeric(ema50)?signal(ema20-ema50):null},
  {name:"EMA50–200 trend",value:numeric(ema50)&&numeric(ema200)?signal(ema50-ema200):null},
  {name:"RSI14 momentum",value:numeric(rsi)?rsi>=rsiBull?1:rsi<=rsiBear?-1:0:null},
  {name:"MACD histogram",value:numeric(macd)?signal(macd):null},
  {name:"VWAP location",value:numeric(vwap)?signal(bar.close-vwap):null},
  {name:"ADX 14 strength",value:numeric(adx)?(adx>=adxMin?1:0):null},
  {name:"ATR 14 pips",value:numeric(atrPips)?(atrPips>=atrMinPips?1:0):null},
  {name:"Donchian prior-20 breakout",value:numeric(donchianUpper)&&numeric(donchianLower)?
    bar.close>donchianUpper?1:bar.close<donchianLower?-1:0:null},
  {name:"Stochastic 14/3",value:numeric(stochK)&&numeric(stochD)?signal(stochK-stochD):null}
 ];
 const lookup=Object.fromEntries(entries.map(x=>[x.name,x.value]));
 const required=preset.id==="scalp"?["EMA20–50 trend","RSI14 momentum","MACD histogram"]:
  preset.id==="day"?["EMA20–50 trend","RSI14 momentum"]:
  ["EMA50–200 trend","RSI14 momentum","MACD histogram"];
 const checks=needMacd&&["scalp","day","swing"].includes(id)?required:[...required].filter(k=>k!=="MACD histogram");
 if(needAdx)checks.push("ADX 14 strength");
 if(needAtr)checks.push("ATR 14 pips");
 if(id==="gbp-breakout")checks.push("Donchian prior-20 breakout");
 if(id==="jpy-pullback")checks.push("Stochastic 14/3");
 if(needVwap)checks.push("VWAP location");
 if(checks.some(k=>lookup[k]===null))return {...unavailable,inputs:entries,
  summary:"Insufficient closed-bar indicator history for this preset."};
 const trend=id==="gbp-breakout"?lookup["Donchian prior-20 breakout"]:
  preset.id==="swing"?lookup["EMA50–200 trend"]:lookup["EMA20–50 trend"];
 const momentum=Math.sign(lookup["RSI14 momentum"]+(lookup["MACD histogram"]??0));
 // Nine states: row 0 upper/bullish trend, row 2 lower/bearish trend.
 const row=1-trend,col=momentum+1,zone=row*3+col;
 const aligned=trend!==0&&momentum===trend;
 const contextual=(preset.id==="day"||needVwap)&&numeric(vwap)&&signal(bar.close-vwap)!==trend;
 const strengthWeak=needAdx&&lookup["ADX 14 strength"]!==1;
 const volatilityWeak=needAtr&&lookup["ATR 14 pips"]!==1;
 const stochDivergence=id==="jpy-pullback"&&lookup["Stochastic 14/3"]!==trend;
 const stance=aligned&&!contextual&&!strengthWeak&&!volatilityWeak&&!stochDivergence?
  "aligned":trend===-momentum&&momentum!==0?"conflicted":"mixed";
 const summary=stance==="aligned"?
  "Closed-bar trend and momentum align "+tier(trend)+". Research watch only; assess independent risk controls before any decision.":
  stance==="conflicted"?"Closed-bar trend and momentum disagree. Avoid treating this as confirmed timing.":
  "Evidence is mixed or lacks VWAP confirmation. No entry or exit indication is validated.";
 if(quality==="HISTORICAL"){
  return {version:1,strategy:id,state:"HISTORICAL "+stance.toUpperCase(),
   zone,row,col,ready:true,trend,momentum,
   summary:summary+" Historical import is retrospective research only; never a live entry or exit indication.",
   inputs:entries,barTime:t,lastClose:bar.close,
   disclaimer:"Offline historical indicator alignment, not live quotes, orders or trading advice."};
 }
 return {version:1,strategy:id,state:stance.toUpperCase(),zone,row,col,ready:true,
  trend,momentum,summary,inputs:entries,barTime:t,lastClose:bar.close,
  disclaimer:"Descriptive indicator alignment, not a recommendation, forecast, fill, stop or trade trigger."};
}
export function snapshotSummary(id,model,symbol,resolution){
 const name=find(id)?.name||"No strategy selected";
 return [name+" · "+symbol+" · "+resolution,
  "Research state: "+(model?.state||"NO DATA"),
  model?.summary||"No verified closed bars.",
  model?.barTime?"Last evaluated closed candle: "+new Date(model.barTime*1000).toISOString():"Source time unavailable.",
  "This is a local descriptive research snapshot, not a trading recommendation or execution."].join("\n");
}
