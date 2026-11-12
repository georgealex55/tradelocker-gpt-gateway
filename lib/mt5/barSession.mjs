/* MT5 offline M1/M5 session audit: no terminal, trading or network access. */
const STEP=Object.freeze({"1m":60000,"5m":300000});
function fail(code){const error=new Error(code);error.code=code;throw error;}
function utcTime(value){
 if(typeof value!=="string"||!/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})\.\d{3}Z$/.test(value))fail("MT5_SESSION_EXPLICIT_UTC_REQUIRED");
 const ms=Date.parse(value);
 if(!Number.isFinite(ms)||new Date(ms).toISOString()!==value)fail("MT5_SESSION_INVALID_UTC");
 return ms;
}
export function auditMt5MinuteBars(rows,{resolution,window,asOf,point=null}={}){
 const step=STEP[resolution];if(!step)fail("MT5_SESSION_UNSUPPORTED_RESOLUTION");
 if(!Array.isArray(rows)||rows.length<2||rows.length>400)fail("MT5_SESSION_ROW_COUNT");
 const from=utcTime(window?.from),to=utcTime(window?.to);
 if(from>=to)fail("MT5_SESSION_INVALID_WINDOW");
 if(!Number.isSafeInteger(asOf)||asOf<to)fail("MT5_SESSION_INVALID_ASOF");
 if(point!==null&&(!Number.isFinite(point)||point<=0))fail("MT5_SESSION_INVALID_POINT");
 const gaps=[];let previous=null,missingBars=0,spreadsObserved=0;
 for(const row of rows){
  const ms=utcTime(row?.time);
  if(ms<from||ms>=to||ms%step!==0)fail("MT5_SESSION_OUTSIDE_OR_UNALIGNED");
  if(ms+step>asOf)fail("MT5_SESSION_INCOMPLETE_BAR");
  if(previous!==null){
   if(ms<=previous)fail("MT5_SESSION_DUPLICATE_OR_UNORDERED");
   const missing=(ms-previous)/step-1;
   if(!Number.isSafeInteger(missing))fail("MT5_SESSION_UNALIGNED_GAP");
   if(missing){missingBars+=missing;gaps.push({from:new Date(previous+step).toISOString(),to:new Date(ms).toISOString(),missing,classification:"UNVERIFIED_SESSION_GAP"});}
  }
  previous=ms;
  if(row.spread!==undefined&&row.spread!==null){
   if(!Number.isSafeInteger(row.spread)||row.spread<0)fail("MT5_SESSION_INVALID_SPREAD_POINTS");
   spreadsObserved++;
  }
 }
 return Object.freeze({resolution,sourceClock:"UTC",timezoneAssumption:"UTC_ONLY_NO_BROKER_SESSION_INFERENCE",bars:rows.length,missingBars,gaps,spreadPointsObserved:spreadsObserved,spreadPriceConversion:point===null?"UNAVAILABLE_NO_VERIFIED_SYMBOL_POINT":"AVAILABLE_WITH_SUPPLIED_POINT",point,closedOnly:true});
}
export function spreadPointsToPrice(points,point){
 if(!Number.isSafeInteger(points)||points<0||!Number.isFinite(point)||point<=0)fail("MT5_SESSION_INVALID_SPREAD_CONVERSION");
 return points*point;
}
