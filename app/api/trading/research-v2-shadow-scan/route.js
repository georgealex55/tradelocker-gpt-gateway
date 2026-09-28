import { NextResponse } from "next/server";
import { listForexInstruments } from "../../../../lib/forexUniverse";
import { scanForexSignal } from "../../../../lib/forexSignals";
import { FOREX_STRATEGY_V1_CONFIG } from "../../../../lib/forexStrategyV1Config";
import { USDCHF_V2_CANDIDATE as V2 } from "../../../../lib/research/usdchfV2Candidate.mjs";
import { killSwitchEnabled } from "../../../../lib/tradeGuard";
import { recordSignalObservation } from "../../../../lib/db";
import { upcomingUsdChfMacroCalendar } from "../../../../lib/research/upcomingUsdChfMacroCalendar.mjs";

export const runtime="nodejs";
export const dynamic="force-dynamic";
export const maxDuration=120;

const SHADOW_CONFIG={
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
  risk:{
    ...FOREX_STRATEGY_V1_CONFIG.risk,
    riskPercentPerTrade:1,
    maxLots:0.01
  },
  setup:{
    ...FOREX_STRATEGY_V1_CONFIG.setup,
    targetR:V2.targetR
  }
};

function v2Overlay(row){
  if(!row?.ok) return row;
  const signal=row.signal||{};
  const checks=signal.regime?.checks||{};
  const pip=Number(row.sizing?.pipSize);
  const ema50=Number(checks.ema50), ema200=Number(checks.ema200);
  const emaGapPips=Number.isFinite(ema50)&&Number.isFinite(ema200)&&pip>0
    ? Math.abs(ema50-ema200)/pip
    : null;
  const emaGateReady=emaGapPips!=null;
  const emaGatePassed=emaGateReady && emaGapPips<=V2.maxEma50Ema200GapPips;

  let status=signal.status||"WATCHING";
  let action=signal.action||"HOLD";
  const blocks=[...(signal.blocks||[])];

  if(!emaGateReady){
    status="BLOCKED";
    action="HOLD";
    blocks.push("V2_EMA_GAP_UNAVAILABLE");
  } else if(!emaGatePassed){
    status="BLOCKED";
    action="HOLD";
    blocks.push("V2_EMA_GAP_GT_30_PIPS");
  }

  return {
    ok:true,
    symbol:row.instrument?.symbol||null,
    completedThrough:row.completedThrough||null,
    latestBarTime:row.latestBar?.time||null,
    bars:row.bars||null,
    status,
    action,
    underlyingStatus:signal.status||null,
    underlyingAction:signal.action||null,
    side:signal.side||null,
    blocks,
    checks:signal.checks||{},
    h1:{
      bias:signal.regime?.bias||null,
      adx:checks.adx??null,
      ema50:checks.ema50??null,
      ema200:checks.ema200??null,
      emaGapPips,
      maxEmaGapPips:V2.maxEma50Ema200GapPips,
      emaGatePassed
    },
    spreadPips:row.quote?.spreadPips??null,
    stopPips:signal.stopPips??null,
    spreadAsStopFraction:signal.spreadAsStopFraction??null,
    riskEstimate:row.riskEstimate||null,
    execution:row.execution||null
  };
}

export async function GET(){
  try{
    const tradingEnabled=String(process.env.TRADING_ENABLED||"false").toLowerCase()==="true";
    const killSwitch=killSwitchEnabled();
    if(tradingEnabled||!killSwitch){
      return NextResponse.json({
        ok:false,readOnlyTrading:true,error:"SHADOW_TEST_REQUIRES_TRADING_DISABLED_AND_KILL_SWITCH_ON"
      },{status:409,headers:{"Cache-Control":"no-store"}});
    }

    const universe=await listForexInstruments();
    const instrument=universe.find(x=>x.symbol==="USDCHF");
    if(!instrument) throw new Error("USDCHF_NOT_FOUND");

    const asOf=Date.now();
    const macroCalendar=upcomingUsdChfMacroCalendar(asOf);
    const raw=await scanForexSignal({
      instrument,
      config:SHADOW_CONFIG,
      asOf,
      scheduledBlackouts:macroCalendar.events
    });
    const result=v2Overlay({ok:true,...raw});
    const shadowSignal={
      ...(raw.signal||{}),
      status:result.status,
      action:result.action,
      blocks:result.blocks,
      checks:{
        ...(raw.signal?.checks||{}),
        v2EmaGapPassed:result.h1.emaGatePassed
      },
      regime:{
        ...(raw.signal?.regime||{}),
        checks:{
          ...(raw.signal?.regime?.checks||{}),
          emaGapPips:result.h1.emaGapPips,
          maxEmaGapPips:V2.maxEma50Ema200GapPips
        }
      }
    };
    const saved=await recordSignalObservation({
      signal:shadowSignal,
      riskEstimate:raw.riskEstimate,
      execution:raw.execution
    });

    return NextResponse.json({
      ok:true,
      mode:"V2_SHADOW_FORWARD_READINESS",
      readOnlyTrading:true,
      liveExecutionPossible:false,
      generatedAt:Date.now(),
      asOf,
      safety:{tradingEnabled,killSwitch},
      candidate:{
        symbol:V2.symbol,
        capital:500,
        riskPercent:1,
        maxPositions:1,
        sessionUtc:"10:00-15:59",
        maxEma50Ema200GapPips:30,
        targetR:1.8
      },
      result,
      readiness:{
        marketDataLoaded:Boolean(result.bars>0&&result.latestBarTime),
        quoteLoaded:Number.isFinite(Number(result.spreadPips)),
        h1IndicatorsReady:result.h1.emaGapPips!=null&&Number.isFinite(Number(result.h1.adx)),
        v2GateEvaluated:result.h1.emaGapPips!=null,
        executionBlocked:result.execution?.status==="BLOCKED",
        executionBlockReason:result.execution?.reason||null,
        v2ObservationPersisted:Boolean(saved)
      },
      macroCalendar:{
        reviewedAt:macroCalendar.reviewedAt,
        coverageThrough:macroCalendar.coverageThrough,
        nextEvent:macroCalendar.nextEvent,
        remainingEvents:macroCalendar.events.length
      },
      caveat:"Official USD/CHF high-impact dates are encoded through 2026-12-23 and must be refreshed for reschedules or 2027 dates."
    },{headers:{"Cache-Control":"no-store"}});
  }catch(error){
    return NextResponse.json({
      ok:false,readOnlyTrading:true,liveExecutionPossible:false,error:String(error?.message||error)
    },{status:500,headers:{"Cache-Control":"no-store"}});
  }
}
