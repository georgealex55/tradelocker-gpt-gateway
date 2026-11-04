/* XMI read-only provider router: Alpaca stocks/crypto, Twelve Data spot FX.
 * No account/trade/order endpoints, price generation, or fallback across vendors.
 * Credentials stay server-side in Vercel secrets; never returned to the browser.
 */
import {FX_RESOLUTIONS,parseInstrument,validateResolution,normalizeBars} from "./xmiLiveMath.mjs";

export const XMI_MULTI_PROVIDER_MODE="alpaca-twelvedata";
const ALPACA_BASE="https://data.alpaca.markets";
const TWELVE_BASE="https://api.twelvedata.com";
const INTERVAL_TD=Object.freeze({"1m":"1min","5m":"5min","15m":"15min","30m":"30min","1H":"1h","4H":"4h","1D":"1day"});
const INTERVAL_ALPACA=Object.freeze({"1m":"1Min","5m":"5Min","15m":"15Min","30m":"30Min","1H":"1Hour","4H":"4Hour","1D":"1Day"});
const cache=new Map(),inflight=new Map();
const errors=Object.freeze({
 401:"UPSTREAM_AUTH_EXPIRED",402:"UPSTREAM_QUOTA",403:"UPSTREAM_ACCESS_DENIED",
 429:"UPSTREAM_RATE_LIMIT"
});
function failure(code){const e=new Error("Market-data source unavailable");e.code=code;return e;}
function assertEnv(env,asset){
 if(asset==="forex"){
  if(typeof env.TWELVEDATA_API_KEY!=="string"||env.TWELVEDATA_API_KEY.length<8)
   throw failure("PROVIDER_NOT_CONFIGURED");
 }else if(typeof env.ALPACA_API_KEY_ID!=="string"||env.ALPACA_API_KEY_ID.length<8||
   typeof env.ALPACA_API_SECRET_KEY!=="string"||env.ALPACA_API_SECRET_KEY.length<8)
  throw failure("PROVIDER_NOT_CONFIGURED");
}
export function providerForInstrument(value){
 const instrument=parseInstrument(value);
 return {instrument,provider:instrument.asset==="forex"?"Twelve Data":"Alpaca"};
}
export function providerConfigured(env,asset){
 try{assertEnv(env,asset);return true;}catch{return false;}
}
function decodeTime(value){
 if(typeof value==="number")return value>1e11?Math.trunc(value/1000):Math.trunc(value);
 if(typeof value!=="string")throw failure("INVALID_PROVIDER_CANDLES");
 const time=/^\d{4}-\d{2}-\d{2}(?: \d{2}:\d{2}:\d{2})?$/.test(value)?
  Date.parse(value.replace(" ","T")+(value.length===10?"T00:00:00":"")+"Z"):Date.parse(value);
 if(!Number.isFinite(time))throw failure("INVALID_PROVIDER_CANDLES");
 return Math.trunc(time/1000);
}
export function parseProviderBars(payload,asset,symbol,resolution,now){
 let source,basis;
 if(asset==="forex"){
  if(payload?.status==="error"||payload?.code&&payload?.status!=="ok"){
   const numeric=Number(payload.code);
   throw failure(errors[numeric]|| (numeric===400?"UPSTREAM_BAD_RESPONSE":"UPSTREAM_UNAVAILABLE"));
  }
  if(payload?.meta?.timezone&&resolution!=="1D"&&
    !["UTC","Etc/UTC"].includes(payload.meta.timezone))
   throw failure("INVALID_PROVIDER_CANDLES");
  source=payload?.values;
  basis="none";
 }else if(asset==="crypto"){
  source=payload?.bars?.[symbol.slice(0,-3)+"/"+symbol.slice(-3)]??payload?.bars?.[symbol];
  basis="exchange-traded";
 }else{
  source=Array.isArray(payload?.bars)?payload.bars:payload?.bars?.[symbol];
  basis="exchange-traded";
 }
 if(!Array.isArray(source)||source.length===0)throw failure("EMPTY_CANDLES");
 if(source.length>1200)throw failure("INVALID_PROVIDER_CANDLES");
 let rows;
 try{
  rows=source.map(b=>({
   // Alpaca daily bars use New York midnight (04:00/05:00 UTC);
   // represent the *session date* at UTC midnight, never fabricate a price.
   time:asset==="equity"&&resolution==="1D"?
    Math.floor(decodeTime(b.datetime??b.t??b.time)/86400)*86400:
    decodeTime(b.datetime??b.t??b.time),open:b.open??b.o,
   high:b.high??b.h,low:b.low??b.l,close:b.close??b.c,
   volume:asset==="forex"?null:(b.v??b.volume??null)
  }));
  if(new Set(rows.map(x=>x.time)).size!==rows.length)
   throw Error("Duplicate provider timestamp");
  const normalized=normalizeBars(rows,resolution,now).slice(-400);
  if(!normalized.length)throw Error("Empty normalized candles");
  return {bars:normalized,volumeBasis:basis};
 }catch{throw failure("INVALID_PROVIDER_CANDLES");}
}
function urlAndHeaders(instrument,resolution,now,env){
 const {asset,symbol}=instrument,step=FX_RESOLUTIONS[resolution];
 if(asset==="forex"){
  const url=new URL("/time_series",TWELVE_BASE);
  for(const [k,v] of Object.entries({symbol:symbol.slice(0,3)+"/"+symbol.slice(3),
   interval:INTERVAL_TD[resolution],outputsize:"400",format:"JSON",
   order:"DESC",timezone:"UTC",apikey:env.TWELVEDATA_API_KEY}))url.searchParams.set(k,v);
  return {url,headers:{accept:"application/json"}};
 }
 const url=new URL(asset==="crypto"?"/v1beta3/crypto/us/bars":"/v2/stocks/"+encodeURIComponent(symbol)+"/bars",ALPACA_BASE);
 const span=Math.max(step*400*(asset==="equity"?6:1.5),step*400);
 for(const [k,v] of Object.entries({
  ...(asset==="crypto"?{symbols:symbol.slice(0,-3)+"/"+symbol.slice(-3)}:{}),
  timeframe:INTERVAL_ALPACA[resolution],start:new Date(now-span*1000).toISOString(),
  end:new Date(now).toISOString(),limit:"1000",sort:"desc",
  ...(asset==="equity"?{feed:env.ALPACA_STOCK_FEED==="sip"?"sip":"iex",adjustment:"raw"}:{})
 }))url.searchParams.set(k,v);
 return {url,headers:{accept:"application/json",
  "APCA-API-KEY-ID":env.ALPACA_API_KEY_ID,"APCA-API-SECRET-KEY":env.ALPACA_API_SECRET_KEY}};
}
async function callVendor({instrument,resolution,now,env,fetchImpl}){
 assertEnv(env,instrument.asset);
 const {url,headers}=urlAndHeaders(instrument,resolution,now,env);
 let res;
 try{res=await fetchImpl(url.toString(),{method:"GET",headers,cache:"no-store",
   signal:AbortSignal.timeout(12500)});}
 catch{throw failure("UPSTREAM_UNAVAILABLE");}
 if(!res.ok)throw failure(errors[res.status]|| (res.status>=500?"UPSTREAM_UNAVAILABLE":"UPSTREAM_BAD_RESPONSE"));
 let json;
 try{json=await res.json();}catch{throw failure("UPSTREAM_BAD_RESPONSE");}
 return parseProviderBars(json,instrument.asset,instrument.symbol,resolution,now);
}
/** Explicitly injected fetch/env for deterministic non-network staging verification. */
export async function getMultiProviderSnapshot(input,{env=process.env,fetchImpl=fetch,now=Date.now(),useCache=true}={}){
 const {instrument,provider}=providerForInstrument(input.symbol);
 const resolution=validateResolution(input.resolution||"5m");
 assertEnv(env,instrument.asset);
 const key=provider+":"+instrument.key+":"+resolution;
 const held=cache.get(key);
 const ttl=Math.max(20000,Math.min(90000,Math.round(FX_RESOLUTIONS[resolution]*1000/3)));
 if(useCache&&held&&now-held.at<ttl)return {...held.snapshot,asOf:new Date(now).toISOString(),
  cacheAgeMs:Math.max(0,now-held.at)};
 if(useCache&&inflight.has(key))return inflight.get(key);
 const task=(async()=>{
  const {bars,volumeBasis}=await callVendor({instrument,resolution,now,env,fetchImpl});
  const snapshot={ok:true,readOnly:true,market:instrument.asset,provider,symbol:instrument.symbol,
   label:instrument.label,resolution,asOf:new Date(now).toISOString(),
   sourceClock:provider+" UTC bar timestamps",delivery:"polling",
   intervalSeconds:FX_RESOLUTIONS[resolution],volumeBasis,bars};
  if(useCache)cache.set(key,{at:now,snapshot});
  return snapshot;
 })();
 if(useCache)inflight.set(key,task);
 try{return await task;}finally{if(inflight.get(key)===task)inflight.delete(key);}
}
