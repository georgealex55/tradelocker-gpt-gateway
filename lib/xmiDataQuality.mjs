/* XMI 2C: independent read-only OHLC source and closed-bar diagnostics.
 * No feeds, orders, synthetic production prices or broker credentials.
 */
import {FX_RESOLUTIONS,validateResolution} from "./xmiLiveMath.mjs";

const INDICATOR_KEYS=Object.freeze({
 ema20:"ema20",ema50:"ema50",ema200:"ema200",
 rsi14:"rsi",macd:"macdHistogram",vwap:"vwap",volume:"volume"
});
function latestValueAt(points,at){
 if(!Array.isArray(points))return null;
 for(let i=points.length-1;i>=0;i--){
  const p=points[i];
  if(p?.time<=at&&Number.isFinite(p.value))return p.time===at?p.value:null;
 }
 return null;
}
export function inspectCandleQuality({bars,resolution,asOf,now=Date.now(),
 sourceQuality="UNAVAILABLE",overlays={}}={}){
 const step=FX_RESOLUTIONS[validateResolution(resolution)];
 const received=Number.isFinite(asOf)?asOf:Date.parse(asOf);
 const nowMs=Number(now);
 if(!Number.isFinite(nowMs)||nowMs<=0)throw Error("Invalid inspection clock");
 const rows=Array.isArray(bars)?bars:[];
 const closed=rows.filter(bar=>bar?.closed===true&&Number.isSafeInteger(bar.time)
  &&bar.time>0&&bar.time*1000+step*1000<=nowMs+1000);
 const last=closed.at(-1)||null;
 const sample=closed.slice(-31),lastTime=last?.time??null;
 let gaps=0,missingPeriods=0;
 for(let i=1;i<sample.length;i++){
  const diff=sample[i].time-sample[i-1].time;
  if(diff>step){gaps++;missingPeriods+=Math.max(0,Math.round(diff/step)-1);}
 }
 const indicatorStatus=Object.fromEntries(Object.entries(INDICATOR_KEYS).map(([key,field])=>
  [key,lastTime!==null&&latestValueAt(overlays[field],lastTime)!==null]));
 const sourceClockValid=Number.isFinite(received)&&received>0;
 const futureSourceCheck=sourceClockValid&&received>nowMs+120000;
 // The provider's asOf is a reported observation time, not publication proof.
 const oldSourceCheck=sourceClockValid&&nowMs-received>Math.max(300000,3*step*1000);
 const sourceAvailable=sourceQuality==="CURRENT"||sourceQuality==="HISTORICAL";
 const history=sourceQuality==="HISTORICAL";
 const reasons=[];
 if(!sourceAvailable)reasons.push("SOURCE_NOT_CURRENT");
 if(!sourceClockValid)reasons.push("INVALID_SOURCE_CHECK_TIME");
 if(futureSourceCheck)reasons.push("FUTURE_SOURCE_CHECK_TIME");
 if(!history&&oldSourceCheck)reasons.push("SOURCE_CHECK_TOO_OLD");
 if(!last)reasons.push("NO_VERIFIED_CLOSED_CANDLE");
 if(last&&last.time*1000>nowMs+1000)reasons.push("FUTURE_CLOSED_CANDLE");
 // Gaps can be legitimate market closures, e.g. weekends: surface rather
 // than silently filling or automatically rejecting the entire history.
 if(gaps>0)reasons.push("RECENT_CANDLE_GAPS");
 if(!indicatorStatus.ema200)reasons.push("EMA200_WARMUP");
 if(!indicatorStatus.macd)reasons.push("MACD_WARMUP");
 if(!indicatorStatus.rsi14)reasons.push("RSI_WARMUP");
 if(!indicatorStatus.vwap)reasons.push("VWAP_UNAVAILABLE");
 const blockers=new Set(["SOURCE_NOT_CURRENT","INVALID_SOURCE_CHECK_TIME",
  "FUTURE_SOURCE_CHECK_TIME","SOURCE_CHECK_TOO_OLD",
  "NO_VERIFIED_CLOSED_CANDLE","FUTURE_CLOSED_CANDLE"]);
 const researchReady=!reasons.some(r=>blockers.has(r));
 const label=!researchReady?"SOURCE NOT VERIFIED":
  history?"HISTORICAL RESEARCH · OFFLINE":
  gaps>0?"VERIFIED · GAPS NOTED":"VERIFIED CLOSED BARS";
 return Object.freeze({
  version:1,sourceQuality,sourceAsOf:sourceClockValid?received:null,
  inspectedAt:nowMs,lastClosedTime:lastTime,closedBars:closed.length,
  recentGaps:gaps,missingPeriods,indicatorStatus,
  researchReady,label,reasons:Object.freeze(reasons)
 });
}
