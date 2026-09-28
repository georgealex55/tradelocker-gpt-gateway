import { NextResponse } from "next/server";
import { dbQuery, tradeStateDbEnabled } from "../../../../lib/db";
import { USDCHF_V2_VALIDATION_BASELINE as BASELINE } from "../../../../lib/research/usdchfV2ValidationBaseline.mjs";

export const runtime="nodejs";
export const dynamic="force-dynamic";

function n(v){ const x=Number(v); return Number.isFinite(x)?x:0; }
function nullable(v){ const x=Number(v); return Number.isFinite(x)?x:null; }

function normalizedPath(rows,riskFraction=0.01){
  let equity=BASELINE.capitalUsd;
  let peak=equity;
  let maxDrawdownPercent=0;
  let streak=0;
  let longestLosingStreak=0;

  for(const row of rows){
    const r=Number(row.r_multiple);
    if(!Number.isFinite(r)) continue;
    equity*=Math.max(0,1+r*riskFraction);
    peak=Math.max(peak,equity);
    maxDrawdownPercent=Math.max(
      maxDrawdownPercent,
      peak>0?(peak-equity)/peak*100:0
    );
    streak=r<0?streak+1:0;
    longestLosingStreak=Math.max(longestLosingStreak,streak);
  }
  return {
    endingBalance:equity,
    returnPercent:(equity/BASELINE.capitalUsd-1)*100,
    maxDrawdownPercent,
    longestLosingStreak
  };
}

function sampleStage(closed){
  if(closed<BASELINE.interpretation.minimumClosedTradesForDirectionalRead){
    return {stage:"COLLECTING",statisticalComparisonAllowed:false};
  }
  if(closed<BASELINE.interpretation.interimClosedTrades){
    return {stage:"DIRECTIONAL_READ",statisticalComparisonAllowed:true};
  }
  if(closed<BASELINE.interpretation.comparisonTargetClosedTrades){
    return {stage:"INTERIM",statisticalComparisonAllowed:true};
  }
  return {stage:"COMPARABLE_SAMPLE",statisticalComparisonAllowed:true};
}

export async function GET(){
  try{
    if(!tradeStateDbEnabled()){
      return NextResponse.json({ok:false,error:"TRADE_STATE_DB_DISABLED"},{status:503});
    }

    const obs=await dbQuery(
      `select
        count(*)::int observations,
        count(distinct candle_time)::int distinct_candles,
        count(distinct ((to_timestamp(candle_time/1000.0) at time zone 'UTC')::date))::int observed_utc_days,
        min(candle_time)::bigint first_candle,
        max(candle_time)::bigint last_candle,
        count(*) filter(where status='WATCHING')::int watching,
        count(*) filter(where status='SETUP_FORMING')::int setup_forming,
        count(*) filter(where status='SIGNAL_READY')::int signal_ready,
        count(*) filter(where status='BLOCKED')::int blocked,
        count(*) filter(where action in ('BUY','SELL'))::int actionable,
        count(*) filter(
          where extract(hour from (to_timestamp(candle_time/1000.0) at time zone 'UTC'))>=10
            and extract(hour from (to_timestamp(candle_time/1000.0) at time zone 'UTC'))<16
        )::int session_observations,
        avg(spread_pips)::numeric avg_spread_pips,
        percentile_cont(0.5) within group(order by spread_pips) median_spread_pips,
        percentile_cont(0.95) within group(order by spread_pips) p95_spread_pips,
        max(spread_pips)::numeric max_spread_pips
       from signal_observations
       where strategy='forex-trend-pullback-v2-shadow'
         and strategy_version='2.0.0-shadow'
         and symbol='USDCHF'`
    );

    const blocks=await dbQuery(
      `select block,count(*)::int occurrences
       from signal_observations s
       cross join lateral jsonb_array_elements_text(coalesce(s.blocks_json,'[]'::jsonb)) b(block)
       where s.strategy='forex-trend-pullback-v2-shadow'
         and s.strategy_version='2.0.0-shadow'
         and s.symbol='USDCHF'
       group by block
       order by occurrences desc,block asc`
    );

    const virtualAgg=await dbQuery(
      `select
        count(*)::int total,
        count(*) filter(where state='PENDING_ENTRY')::int pending,
        count(*) filter(where state='OPEN')::int open,
        count(*) filter(where state='CLOSED')::int closed,
        count(*) filter(where state='SKIPPED')::int skipped,
        count(*) filter(where outcome='TARGET')::int targets,
        count(*) filter(where outcome='STOP')::int stops,
        coalesce(sum(r_multiple),0)::numeric total_r,
        coalesce(avg(r_multiple) filter(where state='CLOSED'),0)::numeric expectancy_r,
        coalesce(sum(r_multiple) filter(where r_multiple>0),0)::numeric gross_win_r,
        coalesce(sum(r_multiple) filter(where r_multiple<0),0)::numeric gross_loss_r,
        coalesce(sum(pnl_usd),0)::numeric pnl_usd,
        coalesce(avg(risk_amount_usd) filter(where risk_amount_usd is not null),0)::numeric avg_risk_amount_usd,
        coalesce(avg(mfe_pips) filter(where state='CLOSED'),0)::numeric avg_mfe_pips,
        coalesce(avg(mae_pips) filter(where state='CLOSED'),0)::numeric avg_mae_pips
       from shadow_virtual_trades
       where strategy='forex-trend-pullback-v2-shadow'
         and strategy_version='2.0.0-shadow'
         and symbol='USDCHF'`
    );

    const closedRows=await dbQuery(
      `select signal_time,exit_time,r_multiple,pnl_usd,outcome
       from shadow_virtual_trades
       where strategy='forex-trend-pullback-v2-shadow'
         and strategy_version='2.0.0-shadow'
         and symbol='USDCHF'
         and state='CLOSED'
       order by exit_time asc,signal_time asc`
    );

    const skipped=await dbQuery(
      `select outcome,count(*)::int occurrences
       from shadow_virtual_trades
       where strategy='forex-trend-pullback-v2-shadow'
         and strategy_version='2.0.0-shadow'
         and symbol='USDCHF'
         and state='SKIPPED'
       group by outcome order by occurrences desc,outcome asc`
    );

    const o=obs?.[0]||{};
    const v=virtualAgg?.[0]||{};
    const closed=n(v.closed);
    const targets=n(v.targets);
    const grossWinR=n(v.gross_win_r);
    const grossLossR=Math.abs(n(v.gross_loss_r));
    const winRate=closed>0?targets/closed:null;
    const profitFactor=grossLossR>0?grossWinR/grossLossR:(grossWinR>0?null:0);
    const path=normalizedPath(closedRows);
    const sample=sampleStage(closed);
    const paperPnl=n(v.pnl_usd);
    const paperEndingBalance=BASELINE.capitalUsd+paperPnl;

    const forward={
      observations:n(o.observations),
      distinctCandles:n(o.distinct_candles),
      duplicateRows:Math.max(0,n(o.observations)-n(o.distinct_candles)),
      observedUtcDays:n(o.observed_utc_days),
      firstCandle:o.first_candle?Number(o.first_candle):null,
      lastCandle:o.last_candle?Number(o.last_candle):null,
      sessionObservations:n(o.session_observations),
      states:{
        WATCHING:n(o.watching),
        SETUP_FORMING:n(o.setup_forming),
        SIGNAL_READY:n(o.signal_ready),
        BLOCKED:n(o.blocked)
      },
      spreads:{
        modeledHistoricalSpreadPips:2.0,
        average:nullable(o.avg_spread_pips),
        median:nullable(o.median_spread_pips),
        p95:nullable(o.p95_spread_pips),
        max:nullable(o.max_spread_pips)
      },
      blockReasons:blocks.map(x=>({reason:x.block,occurrences:n(x.occurrences)})),
      virtualTrades:{
        total:n(v.total),pending:n(v.pending),open:n(v.open),closed,skipped:n(v.skipped),
        targets,stops:n(v.stops),winRate,
        profitFactor,totalR:n(v.total_r),expectancyR:n(v.expectancy_r),
        pnlUsd:paperPnl,paperEndingBalance,
        paperReturnPercent:(paperEndingBalance/BASELINE.capitalUsd-1)*100,
        averageRiskAmountUsd:n(v.avg_risk_amount_usd),
        averageMfePips:n(v.avg_mfe_pips),
        averageMaePips:n(v.avg_mae_pips),
        normalizedOnePercentPath:path,
        skippedReasons:skipped.map(x=>({reason:x.outcome,occurrences:n(x.occurrences)}))
      }
    };

    const comparison=closed>0?{
      closedTrades:closed,
      winRateDelta:winRate-BASELINE.base.winRate,
      profitFactorDelta:profitFactor==null?null:profitFactor-BASELINE.base.profitFactor,
      expectancyRDelta:n(v.expectancy_r)-BASELINE.base.expectancyR,
      totalRDelta:n(v.total_r)-BASELINE.base.totalR,
      normalizedMaxDrawdownDelta:path.maxDrawdownPercent-BASELINE.base.maxDrawdownPercent,
      historicalBase:BASELINE.base,
      historicalLockedStress:BASELINE.lockedStress,
      monteCarloContext:BASELINE.monteCarloThreeTradeBlock
    }:{
      closedTrades:0,
      historicalBase:BASELINE.base,
      historicalLockedStress:BASELINE.lockedStress,
      monteCarloContext:BASELINE.monteCarloThreeTradeBlock,
      note:"No closed forward virtual trades yet; performance deltas are intentionally withheld."
    };

    return NextResponse.json({
      ok:true,
      mode:"V2_FORWARD_VS_BACKTEST_VALIDATION",
      strategyFrozen:true,
      strategyChangeAllowed:false,
      baselineFrozenAt:BASELINE.frozenAt,
      sample:{
        ...sample,
        closedTrades:closed,
        directionalReadAt:BASELINE.interpretation.minimumClosedTradesForDirectionalRead,
        interimAt:BASELINE.interpretation.interimClosedTrades,
        comparisonTarget:BASELINE.interpretation.comparisonTargetClosedTrades,
        note:BASELINE.interpretation.note
      },
      forward,
      comparison
    },{headers:{"Cache-Control":"no-store"}});
  }catch(error){
    return NextResponse.json({ok:false,error:String(error?.message||error)},{status:500,headers:{"Cache-Control":"no-store"}});
  }
}
