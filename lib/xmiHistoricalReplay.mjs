/* XMI 2D: deterministic offline closed-candle replay.
 * No market fetches, random prices, profitability claims, or order execution.
 */
import {FX_RESOLUTIONS,validateResolution,normalizeBars,computeFive} from "./xmiLiveMath.mjs";
import {parseHistoricalFile} from "./xmiHistoricalFile.mjs";
import {inspectCandleQuality} from "./xmiDataQuality.mjs";
import {evaluateStrategy,strategyById} from "./xmiStrategyPresets.mjs";
import {normalizeStrategyEdit} from "./xmiStrategyEdits.mjs";
import {normalizeIndicatorSettings} from "./xmiIndicatorSettings.mjs";
import {SCALP_PRESET_ID,evaluateScalpResearch} from "./xmiScalpResearch.mjs";

export const REPLAY_VERSION=1;
const LIMIT=400;
const sampleState=state=>state==="HISTORICAL ALIGNED"?"aligned":
 state==="HISTORICAL CONFLICTED"?"conflicted":
 state==="HISTORICAL MIXED"?"mixed":"notReady";
// Weekend UTC is only a heuristic. Friday/Sunday market open, holidays,
// daylight saving and venue schedules are never inferred as authoritative.
export function classifyHistoricalGaps(bars,resolution,{asset="forex"}={}){
 const step=FX_RESOLUTIONS[validateResolution(resolution)];
 if(!Array.isArray(bars))throw Error("Historical gap input must be an array");
 if(!["forex","equity"].includes(asset))throw Error("Unsupported replay asset class");
 const spans=[];let missing=0,weekendEstimate=0,unclassified=0;
 for(let i=1;i<bars.length;i++){
  const before=bars[i-1]?.time,after=bars[i]?.time;
  if(!Number.isSafeInteger(before)||!Number.isSafeInteger(after)||after<=before||
   (after-before)%step!==0)throw Error("Historical gap timestamps must be ordered and aligned");
  const count=(after-before)/step-1;
  if(count===0)continue;
  // The import is bounded to 400 actual bars, but the wall-clock gap may be
  // arbitrarily long. Do not loop through large missing spans.
  let weekend=0;
  if(asset==="forex"){
   const inspect=Math.min(count,10000);
   for(let n=1;n<=inspect;n++){
    const day=new Date((before+n*step)*1000).getUTCDay();
    if(day===0||day===6)weekend++;
   }
  }
  const uncertain=count-(asset==="forex"?weekend:0);
  missing+=count;weekendEstimate+=weekend;unclassified+=uncertain;
  spans.push({from:before,to:after,missing:count,
   weekendUtcEstimate:weekend,unclassified:uncertain,
   truncatedInspection:count>10000});
 }
 return {version:1,asset,spans,missing,weekendUtcEstimate:weekendEstimate,unclassified,
  calendar:"UTC weekend heuristic only; venue closures, holidays and DST unverified"};
}

export function replayHistoricalResearch({bars,resolution,strategyId="day",edit={},
 asset="forex",volumeBasis="broker-tick",symbol=null,indicatorSettings={},confirmationBars=null}={}){
 const seconds=FX_RESOLUTIONS[validateResolution(resolution)];
 if(!Array.isArray(bars)||bars.length<2||bars.length>LIMIT)
  throw Error("Replay requires 2–400 actual historical candles");
 if(!strategyById(strategyId))throw Error("Unknown historical strategy");
 if(!["forex","equity"].includes(asset))throw Error("Unsupported replay asset class");
 // Normalize once at the last input candle's close, then exclude every future
 // candle from each evaluation prefix. No present-day clock or live feed used.
 const latestTime=Math.max(...bars.map(b=>Number(b?.time)>1e11?Number(b.time)/1000:Number(b?.time)));
 if(!Number.isSafeInteger(latestTime))throw Error("Invalid replay timestamp");
 const end=(latestTime+seconds)*1000;
 const normalized=normalizeBars(bars,resolution,end);
 if(normalized.length!==bars.length)throw Error("Duplicate candle timestamps are not permitted in replay");
 const cfg=normalizeStrategyEdit(strategyId,edit);
 const studies=normalizeIndicatorSettings(indicatorSettings);
 if(strategyId===SCALP_PRESET_ID&&(symbol!=="EURUSD"||resolution!=="5m"))
  throw Error("EUR/USD scalp replay requires EURUSD 5m candles");
 let confirmedHigher=null;
 if(strategyId===SCALP_PRESET_ID){
  if(!Array.isArray(confirmationBars)||confirmationBars.length<55||confirmationBars.length>400)
   throw Error("EUR/USD scalp replay requires 55–400 independent 15m OHLC candles");
  const latest=Math.max(...confirmationBars.map(b=>Number(b?.time)>1e11?Number(b.time)/1000:Number(b?.time)));
  confirmedHigher=normalizeBars(confirmationBars,"15m",(latest+900)*1000);
  if(confirmedHigher.length!==confirmationBars.length)
   throw Error("15m confirmation data contains duplicate or invalid candles");
 }
 const counts={aligned:0,conflicted:0,mixed:0,notReady:0};
 const observations=[];
 for(let index=0;index<normalized.length;index++){
  const prefix=normalized.slice(0,index+1);
  const at=(prefix.at(-1).time+seconds)*1000;
  const stats=computeFive(prefix,resolution,at,volumeBasis,studies);
  const dataHealth=inspectCandleQuality({bars:stats.bars,overlays:stats.overlays,
   resolution,asOf:at,now:at,sourceQuality:"HISTORICAL"});
  stats.dataHealth=dataHealth;
  let model=evaluateStrategy(strategyId,stats,"HISTORICAL",cfg,symbol);
  let category=sampleState(model.state),state=model.state;
  if(strategyId===SCALP_PRESET_ID){
   const higherPrefix=confirmedHigher.filter(b=>b.time+900<=prefix.at(-1).time+seconds);
   const higher=higherPrefix.length>=2?
    computeFive(higherPrefix,"15m",(higherPrefix.at(-1).time+900)*1000,volumeBasis,studies):null;
   const research=evaluateScalpResearch(stats,higher,cfg);
   const latest=research.markers?.at(-1);
   const onBar=latest?.time===prefix.at(-1).time;
   state=!research.ready?"HISTORICAL_AWAITING_15M":
    onBar?"HISTORICAL_"+latest.kind+"_CANDIDATE":"HISTORICAL_OBSERVING";
   category=!research.ready?"notReady":onBar?(latest.kind==="ENTRY"?"aligned":"conflicted"):"mixed";
   model={...model,ready:research.ready,zone:null};
  }
  counts[category]++;
  observations.push({time:prefix.at(-1).time,close:prefix.at(-1).close,
   state,category,ready:model.ready===true,zone:model.ready?model.zone:null,
   indicatorReadiness:dataHealth.indicatorStatus});
 }
 const gaps=classifyHistoricalGaps(normalized,resolution,{asset});
 return {
  version:REPLAY_VERSION,mode:"OFFLINE_HISTORICAL_RESEARCH",strategyId,
  resolution,asset,parameters:{rsiBull:cfg.rsiBull,rsiBear:cfg.rsiBear,
   requireMacd:cfg.requireMacd,requireVwap:cfg.requireVwap,
   requireAdx:cfg.requireAdx,requireAtr:cfg.requireAtr,adxMin:cfg.adxMin,atrMinPips:cfg.atrMinPips,
   stopAtr:cfg.stopAtr,rewardRisk:cfg.rewardRisk,maxHoldBars:cfg.maxHoldBars},
  indicatorSettings:studies,confirmationResolution:strategyId===SCALP_PRESET_ID?"15m":null,
  firstCandle:normalized[0].time,lastCandle:normalized.at(-1).time,
  totalBars:normalized.length,scored:normalized.length-counts.notReady,
  counts,gaps,observations,
  interpretation:"Closed-candle descriptive replay only. Research candidate markers are not fills or execution; no P&L or predictive validation."
 };
}

export function replayHistoricalJson(source,{symbol,resolution,strategyId="day",
 edit={},now=Date.now(),indicatorSettings={},confirmationSource=null}={}){
 const parsed=parseHistoricalFile(source,{symbol,resolution,now});
 const asset=/^[A-Z]{6}$/.test(symbol)?"forex":"equity";
 // Import parsing flags a still-forming last candle against the local inspection
 // clock. It must never enter a historical prefix as though already closed.
 const closed=parsed.bars.filter(bar=>bar.closed);
 if(closed.length<2)throw Error("Need at least two fully closed historical candles");
 const confirmationBars=strategyId===SCALP_PRESET_ID?
  parseHistoricalFile(confirmationSource,{symbol,resolution:"15m",now}).bars.filter(b=>b.closed):null;
 const output=replayHistoricalResearch({bars:closed,resolution,strategyId,edit,asset,symbol,
  indicatorSettings,confirmationBars,
  volumeBasis:asset==="forex"?"broker-tick":"provider"});
 return {...output,excludedFormingBars:parsed.bars.length-closed.length};
}
