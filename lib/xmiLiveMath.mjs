/* XMI read-only candle and indicator engine. Zero broker execution dependencies. */
import {computeAdvancedIndicators} from "./xmiAdvancedIndicators.mjs";
import {normalizeIndicatorSettings} from "./xmiIndicatorSettings.mjs";
export const FX_RESOLUTIONS=Object.freeze({"1m":60,"5m":300,"15m":900,"30m":1800,"1H":3600,"4H":14400,"1D":86400});
export const FX_DEFAULTS=Object.freeze(["EURUSD","GBPUSD","USDJPY","USDCHF","AUDUSD","USDCAD","EURJPY"]);
export const STOCK_VENUES=Object.freeze(["NASDAQ","NYSE","AMEX","ARCA"]);
export const FIVE_INDICATORS=Object.freeze(["EMA","VWAP","RSI","MACD","Volume"]);
export function parseInstrument(value){
 const raw=String(value??"").trim().toUpperCase();
 if(/^FX:[A-Z]{6}$/.test(raw))return parseInstrument(raw.slice(3));
 if(/^[A-Z]{6}$/.test(raw)&&raw.slice(0,3)!==raw.slice(3))
  return {key:"FX:"+raw,symbol:raw,label:raw.slice(0,3)+"/"+raw.slice(3),asset:"forex",source:"tradelocker"};
 if(/^[A-Z]{3}\/[A-Z]{3}$/.test(raw)&&raw.slice(0,3)!==raw.slice(4))
  return parseInstrument(raw.replace("/",""));
 const [venue,symbol,...rest]=raw.split(":");
 if(!rest.length&&STOCK_VENUES.includes(venue)&&/^[A-Z][A-Z0-9.-]{0,11}$/.test(symbol))
  return {key:raw,symbol,label:symbol,asset:"equity",source:"unconfigured"};
 throw Error("Choose an FX pair (EURUSD) or qualified stock/ETF symbol (NASDAQ:AAPL)");
}
export function validateResolution(value){if(!Object.hasOwn(FX_RESOLUTIONS,value))throw Error("Unsupported forex timeframe");return value;}
export function validateWatchlist(values){
 if(!Array.isArray(values)||values.length>10)throw Error("Watchlist supports up to 10 instruments");
 const rows=values.map(parseInstrument);
 if(new Set(rows.map(x=>x.key)).size!==rows.length)throw Error("Duplicate instrument in watchlist");
 return rows;
}
export function normalizeBars(rows,resolution,asOf=Date.now()){
 const duration=FX_RESOLUTIONS[validateResolution(resolution)];
 if(!Array.isArray(rows)||rows.length>3000)throw Error("Unexpected candle history size");
 const found=new Map();
 for(const input of rows){
  if(!input||typeof input!=="object")throw Error("Invalid candle");
  const ts=Number(input.time);
  const raw=ts>1e11?ts/1000:ts;
  const time=Math.floor(raw);
  const open=Number(input.open),high=Number(input.high),low=Number(input.low),close=Number(input.close);
  const volume=input.volume==null?null:Number(input.volume);
  if(!Number.isSafeInteger(time)||time<=0||time>asOf/1000+duration||
    ![open,high,low,close].every(n=>Number.isFinite(n)&&n>0)||
    high<Math.max(open,close)||low>Math.min(open,close)||low<=0||
    volume!==null&&(!Number.isFinite(volume)||volume<0))throw Error("Malformed OHLC data");
  if(time%duration!==0)throw Error("Unaligned candle timestamp");
  found.set(time,{time,open,high,low,close,volume});
 }
 return [...found.values()].sort((a,b)=>a.time-b.time).map(bar=>({
  ...bar,closed:bar.time+duration<=asOf/1000
 }));
}
function emaSeries(bars,period,accessor){
 const alpha=2/(period+1);let ema=null,count=0,seed=0;
 return bars.map(b=>{
  const v=accessor(b);
  if(!Number.isFinite(v))return null;
  count++;if(count<=period){seed+=v;if(count===period)ema=seed/period;}
  else ema=alpha*v+(1-alpha)*ema;
  return count>=period?ema:null;
 });
}
function rsiSeries(bars,period=14){
 let last=null,avgGain=0,avgLoss=0,count=0;
 return bars.map(b=>{
  const price=b.close;
  if(last===null){last=price;return null;}
  const delta=price-last;last=price;
  const gain=Math.max(0,delta),loss=Math.max(0,-delta);
  count++;
  if(count<=period){avgGain+=gain;avgLoss+=loss;if(count<period)return null;avgGain/=period;avgLoss/=period;}
  else{avgGain=(avgGain*(period-1)+gain)/period;avgLoss=(avgLoss*(period-1)+loss)/period;}
  if(avgLoss===0)return avgGain===0?50:100;
  return 100-100/(1+avgGain/avgLoss);
 });
}
function macdSeries(bars,fastPeriod=12,slowPeriod=26,signalPeriod=9){
 const fast=emaSeries(bars,fastPeriod,b=>b.close),slow=emaSeries(bars,slowPeriod,b=>b.close);
 let values=0,seed=0,signal=null;
 return bars.map((b,i)=>{
  if(fast[i]===null||slow[i]===null)return null;
  const macd=fast[i]-slow[i];values++;
  if(values<=signalPeriod){seed+=macd;if(values===signalPeriod)signal=seed/signalPeriod;}
  else signal=macd*(2/(signalPeriod+1))+signal*(1-2/(signalPeriod+1));
  return values>=signalPeriod?{macd,signal,histogram:macd-signal}:null;
 });
}
function vwapSeries(bars,sessionMode="daily"){
 let session=null,pv=0,v=0;
 return bars.map(bar=>{
  // UTC reset for forex spot tick-volume proxy; explicit data semantics in response.
  const day=Math.floor(bar.time/(sessionMode==="weekly"?604800:86400));
  if(day!==session){session=day;pv=0;v=0;}
  if(bar.volume===null)return null;
  pv+=((bar.high+bar.low+bar.close)/3)*bar.volume;
  v+=bar.volume;
  return v>0?pv/v:null;
 });
}
export function computeFive(rows,resolution,asOf=Date.now(),volumeBasis="broker-tick",parameters={}) {
 const cfg=normalizeIndicatorSettings(parameters);
 const bars=normalizeBars(rows,resolution,asOf);
 const e20=emaSeries(bars,cfg.emaFast,b=>b.close),
  e50=emaSeries(bars,cfg.emaSlow,b=>b.close),e200=emaSeries(bars,cfg.emaLong,b=>b.close);
 const rsi=rsiSeries(bars,cfg.rsiPeriod),
  macd=macdSeries(bars,cfg.macdFast,cfg.macdSlow,cfg.macdSignal),
  vwap=vwapSeries(bars,cfg.vwapSession);
 const advanced=computeAdvancedIndicators(bars,cfg);
 const volumeMA=bars.map((b,i)=>{
  if(i<cfg.volumeAverage-1)return null;
  const vals=bars.slice(i-cfg.volumeAverage+1,i+1).map(b=>b.volume);
  return vals.every(v=>v!==null)?vals.reduce((a,b)=>a+b,0)/cfg.volumeAverage:null;
 });
 const completed=bars.filter(x=>x.closed);
 return {bars,overlays:{
  ema20:series(bars,e20),ema50:series(bars,e50),ema200:series(bars,e200),
  vwap:series(bars,vwap),...advanced,
  rsi:series(bars,rsi),
  macd:series(bars,macd.map(x=>x?.macd??null)),
  macdSignal:series(bars,macd.map(x=>x?.signal??null)),
  macdHistogram:series(bars,macd.map(x=>x?.histogram??null)),
  volume:bars.filter(x=>x.volume!==null).map(x=>({time:x.time,value:x.volume,color:x.close>=x.open?"#279b88":"#d46576"})),
  volumeMA:series(bars,volumeMA)
 },latest:bars.at(-1)||null,lastClosed:completed.at(-1)||null,
  readiness:{
   ema:completed.length>=cfg.emaLong,rsi:completed.length>cfg.rsiPeriod,
    macd:completed.length>=cfg.macdSlow+cfg.macdSignal-1,
   vwap:completed.some(x=>x.volume!==null&&x.volume>0),
   volume:completed.some(x=>x.volume!==null),
   atr:completed.length>cfg.atrPeriod,adx:completed.length>=2*cfg.adxPeriod,
   bollinger:completed.length>=cfg.bbPeriod,donchian:completed.length>cfg.donchianPeriod,
   stochastic:completed.length>=cfg.stochPeriod+cfg.stochSmooth+cfg.stochSignal-2
  },
  indicatorSettings:cfg,volumeBasis,volumeLabel:volumeBasis==="broker-tick"?"Broker tick volume (not consolidated exchange volume)":"Provider volume",
  vwapLabel:volumeBasis==="broker-tick"?"Tick-volume VWAP proxy · UTC "+cfg.vwapSession+" reset":"Session VWAP",
  signal:{state:"NO_ACTIVE_STRATEGY",reason:"No validated user strategy has been activated. Indicator observations are not confirmed trade signals."}
 };
}
function series(bars,values){return bars.flatMap((b,i)=>values[i]===null?[]:[{time:b.time,value:values[i]}]);}
export function quoteState(lastClosed,now=Date.now(),resolution="1m"){
 if(!lastClosed)return "NO_DATA";
 const age=now/1000-lastClosed.time-FX_RESOLUTIONS[validateResolution(resolution)];
 if(age< -5)return "INVALID_TIME";
 if(age>Math.max(180,2*FX_RESOLUTIONS[resolution]))return "STALE";
 return "CURRENT";
}
