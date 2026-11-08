/**
 * XMI STP AMD offline scenario ledger. Uses the causal detector's next-bar entry.
 * No commission, modeled bid/ask spread + slippage, symbol-specific contract terms.
 * Never counts unfundable hypothetical fills as realized account performance.
 */
import {SYMBOLS,STEP_MS,localTime,checkBars} from "./xmi-amd-retest-core.mjs";

function toUSD(symbol,quoteCash,bidPrice){
  return symbol.startsWith("USD")&&symbol!=="XAUUSD"?quoteCash/bidPrice:quoteCash;
}
function snapped(value,step){
  return Math.floor((value+1e-10)/step)*step;
}
function validInstrument(x){
  for(const k of ["lotSize","minLot","lotStep","symbolLeverage","spreadPrice","slippagePriceEachSide"]){
    if(!Number.isFinite(x?.[k]))throw Error("Missing account-specific or modeled instrument field "+k);
  }
  if(x.lotSize<=0||x.minLot<=0||x.lotStep<=0||x.symbolLeverage<=0||x.spreadPrice<0||x.slippagePriceEachSide<0)
    throw Error("Invalid model contract");
}
function plan(symbol,instrument,bars,signal,equity,sizing,lane){
  const bar=bars[signal.entryIndex],d=signal.direction,S=instrument.spreadPrice,Q=instrument.slippagePriceEachSide;
  const bid=bar.o,entryFill=bid+(d===1?S+Q:-Q);
  const stopBid=signal.sweepExtreme-d*.1*signal.atrAtRetest;
  const stopFill=stopBid+(d===1?-Q:S+Q);
  const perLotRisk=toUSD(symbol,Math.abs(entryFill-stopFill)*instrument.lotSize,bid);
  const perLotMargin=(symbol.startsWith("USD")&&symbol!=="XAUUSD"
    ?instrument.lotSize:instrument.lotSize*(bid+S))/instrument.symbolLeverage;
  if(!(perLotRisk>0&&perLotMargin>0))throw Error("Invalid stop/risk or margin");
  const fixed=sizing==="fixed_0.01";
  if(!fixed&&!/^risk_0\.(0025|005|01)$/.test(sizing))throw Error("Unknown risk sizing option");
  const budget=fixed?null:equity*Number(sizing.slice(5));
  const affordableLots=snapped(Math.max(0,equity*.9)/perLotMargin,instrument.lotStep);
  const riskLots=fixed?.01:snapped(budget/perLotRisk,instrument.lotStep);
  let lots=fixed?.01:Math.min(riskLots,affordableLots);
  let status="funded";
  if(lane==="force_min_if_margin"){
    lots=Math.max(instrument.minLot,lots);
    if(lots>affordableLots+1e-9)status="unfundable_margin";
    else if(budget!==null&&lots*perLotRisk>budget+1e-9)status="funded_overrisk";
    else if(fixed&&instrument.minLot>.01)status="funded_adjusted_minimum";
  }else if(lane==="risk_fit"){
    if(lots<instrument.minLot-1e-9)status="unfundable_size_or_risk";
    if(lots>affordableLots+1e-9)status="unfundable_margin";
  }else if(lane==="shadow_every_signal"){
    lots=Math.max(instrument.minLot,lots);
    status="shadow_only";
  }else throw Error("Unknown no-skip lane");
  const riskExceeded=budget!==null&&lots*perLotRisk>budget+1e-9;
  return {symbol,signal,lots,status,riskExceeded,entryBid:bid,entryFill,stopBid,
    initialRiskUSD:lots*perLotRisk,marginUSD:lots*perLotMargin,affordableLots,
    spread:S,slippage:Q,riskBudgetUSD:budget};
}
function evaluate(bars,instrument,p,exitModel,carry){
  if(!["bracket_2r","structure_opposite_liquidity"].includes(exitModel))throw Error("Unknown exit model");
  if(!["session_flat","overnight_with_swap_sensitivity"].includes(carry))throw Error("Unknown carry policy");
  const i0=p.signal.entryIndex,d=p.signal.direction,dist=Math.abs(p.entryBid-p.stopBid);
  if(!dist||d*(p.entryBid-p.stopBid)<=0)
    return {closed:false,reason:"invalid_stop_at_entry",netUSD:null,grossUSD:null};
  const bracket=p.entryBid+d*2*dist,opposing=d===1?p.signal.rangeHigh:p.signal.rangeLow;
  const targetBid=exitModel==="bracket_2r"?bracket
    :d===1?Math.max(opposing,p.entryBid+dist):Math.min(opposing,p.entryBid-dist);
  let exitIndex=null,exitBid=null,reason="data_end_unresolved";
  for(let i=i0;i<bars.length;i++){
    const b=bars[i];
    if(i>i0&&b.t-bars[i-1].t!==STEP_MS){reason="data_gap_unresolved";break;}
    const badGap=i>i0&&(d===1?b.o<=p.stopBid:b.o>=p.stopBid);
    const goodGap=i>i0&&(d===1?b.o>=targetBid:b.o<=targetBid);
    const stop=d===1?b.l<=p.stopBid:b.h>=p.stopBid;
    const goal=d===1?b.h>=targetBid:b.l<=targetBid;
    if(badGap||stop){reason="stop_first";exitBid=badGap?b.o:p.stopBid;exitIndex=i;break;}
    if(goodGap||goal){reason="target";exitBid=targetBid;exitIndex=i;break;}
    if(carry==="session_flat"){
      const clock=localTime(b.t,"America/New_York");
      if(clock.hour>16||(clock.hour===16&&clock.minute>=35)){
        reason="session_flat";exitBid=b.c;exitIndex=i;break;
      }
    }
    if(exitModel==="structure_opposite_liquidity"){
      const invalid=d===1?b.c<p.signal.rangeLow:b.c>p.signal.rangeHigh;
      if(invalid&&i+1<bars.length&&bars[i+1].t-b.t===STEP_MS){
        reason="next_open_structure_invalidated";exitBid=bars[i+1].o;exitIndex=i+1;break;
      }
    }
  }
  if(exitIndex===null)return {closed:false,reason,netUSD:null,grossUSD:null,
    markedToMarketExcluded:true};
  const exitFill=exitBid+(d===1?-p.slippage:p.spread+p.slippage);
  const gross=toUSD(p.symbol,d*(exitBid-p.entryBid)*instrument.lotSize*p.lots,exitBid);
  const preSwapNet=toUSD(p.symbol,d*(exitFill-p.entryFill)*instrument.lotSize*p.lots,exitBid);
  const days=new Set(bars.slice(i0,exitIndex+1).map(b=>localTime(b.t,"America/New_York").day)).size-1;
  const swapPerLot=d===1?instrument.swapLongUsdPerLotPerNight:instrument.swapShortUsdPerLotPerNight;
  const swapKnown=days===0||Number.isFinite(swapPerLot);
  const swapUSD=swapKnown?days*p.lots*(swapPerLot??0):null;
  return {closed:true,reason,exitIndex,entryFill:p.entryFill,exitFill,
    grossUSD:gross,netUSD:swapKnown?preSwapNet+swapUSD:null,preSwapNetUSD:preSwapNet,
    spreadAndSlippageCostUSD:gross-preSwapNet,swapUSD,swapKnown,overnightDays:days,
    targetBid,stopBid:p.stopBid,initialRiskUSD:p.initialRiskUSD,marginUSD:p.marginUSD};
}
/**
 * Three independent lanes: forced minimum if affordable (possible risk excess),
 * risk-constrained execution, or all-signal shadow-only hypothetical fills.
 * Competing funded signals are explicitly recorded as occupied, not disappeared.
 */
export function replayAMDRetest(raw,signals,instrument,settings){
  const bars=checkBars(raw),symbol=settings.symbol,lane=settings.lane,
    sizing=settings.sizing,exitModel=settings.exitModel,carry=settings.carry;
  if(!SYMBOLS.includes(symbol))throw Error("Unknown symbol");
  validInstrument(instrument);
  let equity=1000,peak=1000,activeUntil=-1,halted=false,unpricedSwap=false;
  const decisions=[];
  for(const s of signals.slice().sort((a,b)=>a.entryIndex-b.entryIndex)){
    if(!Number.isInteger(s.entryIndex)||s.entryIndex<0||s.entryIndex>=bars.length)throw Error("Bad signal index");
    const base={entryIndex:s.entryIndex,signalIndex:s.signalIndex,symbol,lane,sizing,
      exitModel,carry,direction:s.direction,rangeModel:s.rangeModel,entryModel:s.entryModel};
    if(lane!=="shadow_every_signal"&&halted){decisions.push({...base,status:"drawdown_halt"});continue;}
    if(lane!=="shadow_every_signal"&&unpricedSwap){decisions.push({...base,status:"unpriced_swap_halt"});continue;}
    if(lane!=="shadow_every_signal"&&carry==="session_flat"){
      const clock=localTime(bars[s.entryIndex].t,"America/New_York");
      if(clock.hour>16||(clock.hour===16&&clock.minute>=35)){
        decisions.push({...base,status:"session_cutoff_observed"});continue;
      }
    }
    if(lane!=="shadow_every_signal"&&s.entryIndex<=activeUntil){
      decisions.push({...base,status:"occupied_signal_logged"});continue;
    }
    const p=plan(symbol,instrument,bars,s,equity,sizing,lane);
    if(p.status.startsWith("unfundable")){
      decisions.push({...base,status:p.status,riskBudgetUSD:p.riskBudgetUSD,
        minimumRiskUSD:p.initialRiskUSD,minimumMarginUSD:instrument.minLot*p.marginUSD/p.lots,
        shadowOutcome:"not_claimed_as_funded"});
      continue;
    }
    const result=evaluate(bars,instrument,p,exitModel,carry);
    const record={...base,status:p.status,lots:p.lots,initialRiskUSD:p.initialRiskUSD,
      riskBudgetUSD:p.riskBudgetUSD,riskExceeded:p.riskExceeded,marginUSD:p.marginUSD,
      ...result};
    if(lane!=="shadow_every_signal"&&result.closed){
      activeUntil=result.exitIndex;
      if(!result.swapKnown){record.status="unpriced_swap_unresolved";unpricedSwap=true;}
      else{equity+=result.netUSD;peak=Math.max(peak,equity);
        if((peak-equity)/peak>=.1)halted=true;}
    }
    decisions.push({...record,equityAfterUSD:lane==="shadow_every_signal"?null:equity});
  }
  const settled=decisions.filter(x=>x.closed&&x.swapKnown&&x.status!=="shadow_only"&&x.status!=="unpriced_swap_unresolved");
  return {startingCapitalUSD:1000,endingEquityUSD:equity,symbol,lane,sizing,exitModel,carry,
    summary:{signals:signals.length,decisions:decisions.length,settledFunded:settled.length,
      grossFundedUSD:settled.reduce((a,x)=>a+x.grossUSD,0),
      netFundedUSD:settled.reduce((a,x)=>a+x.netUSD,0),
      shadowOnly:decisions.filter(x=>x.status==="shadow_only").length,
      unfundable:decisions.filter(x=>x.status.startsWith("unfundable")).length,
      occupied:decisions.filter(x=>x.status==="occupied_signal_logged").length,
      overrisk:decisions.filter(x=>x.riskExceeded).length,
      unpricedSwap,halted,instrumentSpecVerified:instrument.specStatus==="VERIFIED_ACCOUNT_SPEC",
      historicalBidAskVerified:false,realOrdersSent:0,holdoutRead:false},
    decisions};
}
