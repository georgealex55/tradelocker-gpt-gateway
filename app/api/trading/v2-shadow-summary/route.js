import { NextResponse } from "next/server";
import { dbQuery, tradeStateDbEnabled } from "../../../../lib/db";
import { shadowOutcomeSummary } from "../../../../lib/shadowVirtualTrades";

export const runtime="nodejs";
export const dynamic="force-dynamic";

export async function GET(){
  try{
    if(!tradeStateDbEnabled()){
      return NextResponse.json({ok:false,error:"TRADE_STATE_DB_DISABLED"},{status:503});
    }

    const summaryRows=await dbQuery(
      `select
         count(*)::int as observations,
         count(distinct candle_time)::int as distinct_candles,
         min(candle_time)::bigint as first_candle,
         max(candle_time)::bigint as last_candle,
         count(*) filter (where status='WATCHING')::int as watching,
         count(*) filter (where status='SETUP_FORMING')::int as setup_forming,
         count(*) filter (where status='SIGNAL_READY')::int as signal_ready,
         count(*) filter (where status='BLOCKED')::int as blocked,
         count(*) filter (where action in ('BUY','SELL'))::int as actionable
       from signal_observations
       where strategy='forex-trend-pullback-v2-shadow'
         and strategy_version='2.0.0-shadow'
         and symbol='USDCHF'`
    );

    const latest=await dbQuery(
      `select candle_time,status,action,side,spread_pips,regime_bias,
              execution_status,execution_reason,blocks_json,checks_json,updated_at
       from signal_observations
       where strategy='forex-trend-pullback-v2-shadow'
         and strategy_version='2.0.0-shadow'
         and symbol='USDCHF'
       order by candle_time desc
       limit 20`
    );

    const s=summaryRows?.[0]||{};
    const observations=Number(s.observations||0);
    const distinctCandles=Number(s.distinct_candles||0);
    const virtual=await shadowOutcomeSummary();
    const v=virtual.summary||{};
    const grossWinR=Number(v.gross_win_r||0);
    const grossLossR=Math.abs(Number(v.gross_loss_r||0));
    const virtualClosed=Number(v.closed||0);
    const virtualTargets=Number(v.targets||0);

    return NextResponse.json({
      ok:true,
      mode:"V2_SHADOW_FORWARD_SUMMARY",
      strategy:"forex-trend-pullback-v2-shadow",
      version:"2.0.0-shadow",
      symbol:"USDCHF",
      observations,
      distinctCandles,
      duplicateRows:Math.max(0,observations-distinctCandles),
      firstCandle:s.first_candle?Number(s.first_candle):null,
      lastCandle:s.last_candle?Number(s.last_candle):null,
      states:{
        WATCHING:Number(s.watching||0),
        SETUP_FORMING:Number(s.setup_forming||0),
        SIGNAL_READY:Number(s.signal_ready||0),
        BLOCKED:Number(s.blocked||0)
      },
      actionable:Number(s.actionable||0),
      virtualTrades:{
        total:Number(v.total||0),
        pending:Number(v.pending||0),
        open:Number(v.open||0),
        closed:virtualClosed,
        skipped:Number(v.skipped||0),
        targets:virtualTargets,
        stops:Number(v.stops||0),
        winRate:virtualClosed>0?virtualTargets/virtualClosed:null,
        totalR:Number(v.total_r||0),
        expectancyR:Number(v.expectancy_r||0),
        profitFactor:grossLossR>0?grossWinR/grossLossR:(grossWinR>0?null:0),
        pnlUsd:Number(v.pnl_usd||0),
        maxMaePips:Number(v.max_mae_pips||0),
        maxMfePips:Number(v.max_mfe_pips||0),
        latest:virtual.latest||[]
      },
      latest
    },{headers:{"Cache-Control":"no-store"}});
  }catch(error){
    return NextResponse.json({ok:false,error:String(error?.message||error)},{status:500,headers:{"Cache-Control":"no-store"}});
  }
}
