/* Dedicated preview-only read adapter. No orders, account P/L, or trade routes. */
/* Import broker read adapters lazily; pure validation remains testable without credentials. */
import {FX_RESOLUTIONS,parseInstrument,validateResolution,normalizeBars} from "./xmiLiveMath.mjs";
export function previewEnabled(env){
 return env.VERCEL_ENV==="preview"&&
  env.VERCEL_GIT_COMMIT_REF==="feature/xmi-tradingview-workstation-preview"&&
  env.XMI_READONLY_MARKET_DATA_ENABLED==="true";
}
export function validatedRequest(input){
 const instrument=parseInstrument(input.symbol);
 if(instrument.asset!=="forex")throw Error("Equity live feed is not connected yet");
 const resolution=validateResolution(input.resolution||"5m");
 return {instrument,resolution};
}
export function historyPath(instrument,resolution,now=Date.now(),lookback=320){
 const id=Number(instrument.tradableInstrumentId),route=Number(instrument.infoRouteId);
 if(!Number.isSafeInteger(id)||id<=0||!Number.isSafeInteger(route)||route<=0)
  throw Error("Instrument has no verified read-only INFO route");
 if(lookback<200||lookback>400)throw Error("Invalid bounded history request");
 const step=FX_RESOLUTIONS[resolution]*1000;
 const from=Math.floor(now/step)*step-lookback*step;
 return "/trade/history?routeId="+route+"&tradableInstrumentId="+id+
  "&resolution="+encodeURIComponent(resolution)+"&from="+from+"&to="+now;
}
export function extractVerifiedBars(raw,resolution,now=Date.now()){
 const rows=raw?.d?.barDetails??raw?.barDetails;
 if(!Array.isArray(rows))return [];
 const data=rows.map(x=>({time:x.t,open:x.o,high:x.h,low:x.l,close:x.c,volume:x.v??null}));
 // Normalize, sort, dedupe, validate. Reject timestamps in the future and off the selected interval.
 return normalizeBars(data,resolution,now).slice(-400);
}
let catalog=null,loadedAt=0;
async function instruments(){
 if(catalog&&Date.now()-loadedAt<60000)return catalog;
 const {listForexInstruments}=await import("./forexUniverse");
 const list=await listForexInstruments();
 // Store only the read metadata needed to find exact symbol and INFO route.
 catalog=new Map(list.map(x=>[x.symbol,x]));loadedAt=Date.now();
 return catalog;
}
export async function getLiveSnapshot(input,dependencies={}){
 const {instrument,resolution}=validatedRequest(input);
 const fetchCatalog=dependencies.instruments||instruments;
 const fetchHistory=dependencies.history||(async path=>{
  const {tlFetch}=await import("./tradelocker");
  return tlFetch(path);
 });
 const now=dependencies.now||Date.now();
 const catalog=await fetchCatalog();
 const detail=catalog.get(instrument.symbol);
 if(!detail||!detail.infoRouteId||!detail.tradableInstrumentId)
  throw Error("Forex pair unavailable from the connected broker feed");
 const path=historyPath(detail,resolution,now);
 const raw=await fetchHistory(path);
 const bars=extractVerifiedBars(raw,resolution,now);
 return {ok:true,readOnly:true,market:"forex",provider:"TradeLocker",
  symbol:instrument.symbol,label:instrument.label,resolution,
  asOf:new Date(now).toISOString(),sourceClock:"TradeLocker candle timestamps",
  delivery:"polling",intervalSeconds:FX_RESOLUTIONS[resolution],
  volumeBasis:"broker-tick",bars};
}
