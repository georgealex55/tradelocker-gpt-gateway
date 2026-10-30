/* Read-only feed refresh policy and diagnostics. No broker writes or price estimates. */
import {FX_RESOLUTIONS,validateResolution} from "./xmiLiveMath.mjs";
const BASE=Object.freeze({"1m":15000,"5m":25000,"15m":35000,"30m":45000,"1H":60000,"4H":120000,"1D":180000});
const BACKOFF_CAP=300000;
const FAST=Object.freeze({"1m":6000,"5m":8500,"15m":12000,"30m":15000,"1H":20000,"4H":30000,"1D":60000});
export function nextFeedDelay({resolution="5m",now=Date.now(),failures=0,hidden=false,profile="balanced"}={}){
 const tf=validateResolution(resolution),base=profile==="responsive"?FAST[tf]:BASE[tf];
 if(hidden)return Math.max(120000,base);
 const attempts=Number.isInteger(failures)?Math.max(0,Math.min(failures,8)):0;
 if(attempts>0)return Math.min(BACKOFF_CAP,base*(2**attempts));
 const step=FX_RESOLUTIONS[tf]*1000;
 // Check just after a candle boundary when sooner than the normal polling interval.
 // This is a local-clock estimate, not a promise of broker publication.
 const untilNext=step-(Math.floor(now)%step);
 return Math.min(base,Math.max(4000,untilNext+3000));
}
export function feedHealth({phase,quality,lastCheckedAt,lastSuccessAt,lastClosedAt,failures=0,now=Date.now()}={}){
 const checked=Number.isFinite(lastCheckedAt)&&lastCheckedAt>0?lastCheckedAt:null;
 const succeeded=Number.isFinite(lastSuccessAt)&&lastSuccessAt>0?lastSuccessAt:null;
 const closed=Number.isFinite(lastClosedAt)&&lastClosedAt>0?lastClosedAt:null;
 const warning=["stale","error","disabled","locked","empty"].includes(phase)||quality==="STALE"||quality==="INVALID_TIME"||(phase==="loading"&&!!succeeded);
 return Object.freeze({
  state:phase||"loading",
  checkedAt:checked,verifiedAt:succeeded,closedBarAt:closed,
  retries:Math.max(0,Number.isInteger(failures)?failures:0),
  isLive:phase==="ready"&&quality==="CURRENT",
  warning,
  // A retained plotted candle must never be represented as fresh market data.
  label:phase==="loading"&&succeeded?"REFRESHING · LAST VERIFIED":
   phase==="historical"?"IMPORTED · OFFLINE":
   phase==="ready"&&quality==="CURRENT"?"VERIFIED CANDLES":
   phase==="locked"?"FEED LOCKED":phase==="disabled"?"FEED DISABLED":
   phase==="stale"?"STALE VERIFIED DATA":
   phase==="error"?"SOURCE UNAVAILABLE":"NOT LIVE"
 });
}
export function retryableFeedError(code){
 return code!=="FEED_DISABLED"&&code!=="FEED_LOCKED"&&code!=="ORIGIN_DENIED";
}
