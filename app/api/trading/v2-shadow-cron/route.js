import { NextResponse } from "next/server";
import { listForexInstruments } from "../../../../lib/forexUniverse";
import { scanForexSignal } from "../../../../lib/forexSignals";
import { FOREX_STRATEGY_V1_CONFIG } from "../../../../lib/forexStrategyV1Config";
import { USDCHF_V2_CANDIDATE as V2 } from "../../../../lib/research/usdchfV2Candidate.mjs";
import { upcomingUsdChfMacroCalendar } from "../../../../lib/research/upcomingUsdChfMacroCalendar.mjs";
import { killSwitchEnabled } from "../../../../lib/tradeGuard";
import { recordSignalObservation } from "../../../../lib/db";
import { captureVirtualSignal, reconcileVirtualTrades } from "../../../../lib/shadowVirtualTrades";

export const runtime="nodejs";
export const dynamic="force-dynamic";
export const maxDuration=120;

const CONFIG={
  ...FOREX_STRATEGY_V1_CONFIG,
  name:"forex-trend-pullback-v2-shadow",
  version:"2.0.0-shadow",
  capital:{...FOREX_STRATEGY_V1_CONFIG.capital,startingBalanceUsd:500},
  universe:{...FOREX_STRATEGY_V1_CONFIG.universe,preferredSymbols:["USDCHF"],maxOpenPositions:1},
  session:{
    ...FOREX_STRATEGY_V1_CONFIG.session,
    entryStartUtcHour:V2.entryHourUtcStart,
    entryEndUtcHour:V2.entryHourUtcEndExclusive
  },
  risk:{...FOREX_STRATEGY_V1_CONFIG.risk,riskPercentPerTrade:1,maxLots:0.01},
  setup:{...FOREX_STRATEGY_V1_CONFIG.setup,targetR:V2.targetR}
};

function authorized(request){
  if(process.env.VERCEL_ENV!=="production") return true;
  const secret=process.env.CRON_SECRET;
  return Boolean(secret && request.headers.get("authorization")===`Bearer ${secret}`);
}

function applyV2Overlay(row){
  const signal=row.signal||{};
  const checks=signal.regime?.checks||{};
  const pip=Number(row.sizing?.pipSize);
  const ema50=Number(checks.ema50),ema200=Number(checks.ema200);
  const gap=Number.isFinite(ema50)&&Number.isFinite(ema200)&&pip>0
    ? Math.abs(ema50-ema200)/pip:null;
  const passed=gap!=null && gap<=V2.maxEma50Ema200GapPips;

  let status=signal.status||"WATCHING";
  let action=signal.action||"HOLD";
  const blocks=[...(signal.blocks||[])];

  if(gap==null){
    status="BLOCKED"; action="HOLD"; blocks.push("V2_EMA_GAP_UNAVAILABLE");
  }else if(!passed){
    status="BLOCKED"; action="HOLD"; blocks.push("V2_EMA_GAP_GT_30_PIPS");
  }

  return {
    signal:{
      ...signal,
      status,
      action,
      blocks,
      checks:{...(signal.checks||{}),v2EmaGapPassed:passed},
      regime:{
        ...(signal.regime||{}),
        checks:{...(signal.regime?.checks||{}),emaGapPips:gap,maxEmaGapPips:V2.maxEma50Ema200GapPips}
      }
    },
    emaGapPips:gap,
    emaGatePassed:passed
  };
}

export async function GET(request){
  if(!authorized(request)){
    return NextResponse.json({ok:false,error:"Unauthorized cron request"},{status:401});
  }

  try{
    const tradingEnabled=String(process.env.TRADING_ENABLED||"false").toLowerCase()==="true";
    const killSwitch=killSwitchEnabled();
    if(tradingEnabled||!killSwitch){
      return NextResponse.json({
        ok:false,readOnlyTrading:true,liveExecutionPossible:false,
        error:"V2_SHADOW_CRON_REQUIRES_TRADING_DISABLED_AND_KILL_SWITCH_ON"
      },{status:409,headers:{"Cache-Control":"no-store"}});
    }

    const asOf=Date.now();
    const universe=await listForexInstruments();
    const instrument=universe.find(x=>x.symbol==="USDCHF");
    if(!instrument) throw new Error("USDCHF_NOT_FOUND");

    const calendar=upcomingUsdChfMacroCalendar(asOf);
    const raw=await scanForexSignal({
      instrument,config:CONFIG,asOf,scheduledBlackouts:calendar.events
    });
    const overlay=applyV2Overlay(raw);

    const saved=await recordSignalObservation({
      signal:overlay.signal,
      riskEstimate:raw.riskEstimate,
      execution:raw.execution
    });

    const virtualReconcile=await reconcileVirtualTrades({
      instrument,
      sizing:raw.sizing,
      throughTime:raw.latestBar?.time
    });

    const virtualCapture=await captureVirtualSignal({
      signal:overlay.signal,
      riskEstimate:raw.riskEstimate,
      sizing:raw.sizing
    });

    return NextResponse.json({
      ok:true,
      mode:process.env.VERCEL_ENV==="production"?"V2_SHADOW_CRON":"V2_SHADOW_CRON_PREVIEW",
      readOnlyTrading:true,
      liveExecutionPossible:false,
      generatedAt:Date.now(),
      asOf,
      completedThrough:raw.completedThrough,
      symbol:"USDCHF",
      status:overlay.signal.status,
      action:overlay.signal.action,
      blocks:overlay.signal.blocks||[],
      spreadPips:raw.quote?.spreadPips??null,
      emaGapPips:overlay.emaGapPips,
      emaGatePassed:overlay.emaGatePassed,
      nextMacroEvent:calendar.nextEvent,
      execution:raw.execution,
      observationPersisted:Boolean(saved),
      virtualTrade:{
        reconcile:virtualReconcile,
        capture:{
          created:Boolean(virtualCapture?.created),
          reason:virtualCapture?.reason||null,
          id:virtualCapture?.trade?.id||null,
          state:virtualCapture?.trade?.state||null
        }
      },
      safety:{tradingEnabled,killSwitch}
    },{headers:{"Cache-Control":"no-store"}});
  }catch(error){
    return NextResponse.json({
      ok:false,readOnlyTrading:true,liveExecutionPossible:false,error:String(error?.message||error)
    },{status:500,headers:{"Cache-Control":"no-store"}});
  }
}
