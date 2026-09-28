import { NextResponse } from "next/server";
import { evaluateVirtualTradeCandles } from "../../../../lib/shadowVirtualTrades";

export const runtime="nodejs";
export const dynamic="force-dynamic";

const T=1790550000000;
const baseTrade={
  strategy:"forex-trend-pullback-v2-shadow",
  strategy_version:"2.0.0-shadow",
  symbol:"USDCHF",
  signal_time:T,
  side:"LONG",
  state:"PENDING_ENTRY",
  stop_loss:0.9990,
  target_r:1.8,
  units:1000,
  mfe_pips:0,
  mae_pips:0
};

export async function GET(){
  if(process.env.VERCEL_ENV==="production"){
    return NextResponse.json({ok:false,error:"Preview-only test endpoint"},{status:404});
  }

  const target=evaluateVirtualTradeCandles({
    trade:baseTrade,pipSize:0.0001,
    candles:[{time:T+900000,open:1.0000,high:1.0020,low:0.9995,close:1.0010}]
  });
  const stopFirst=evaluateVirtualTradeCandles({
    trade:baseTrade,pipSize:0.0001,
    candles:[{time:T+900000,open:1.0000,high:1.0020,low:0.9988,close:1.0005}]
  });
  const gap=evaluateVirtualTradeCandles({
    trade:baseTrade,pipSize:0.0001,
    candles:[{time:T+900000,open:0.9985,high:0.9990,low:0.9980,close:0.9987}]
  });
  const missing=evaluateVirtualTradeCandles({
    trade:baseTrade,pipSize:0.0001,
    candles:[{time:T+1800000,open:1.0000,high:1.0010,low:0.9995,close:1.0005}]
  });

  const assertions={
    targetCloses:target.state==="CLOSED"&&target.outcome==="TARGET"&&Math.abs(Number(target.r_multiple)-1.8)<1e-9,
    stopFirstWinsTie:stopFirst.state==="CLOSED"&&stopFirst.outcome==="STOP"&&Number(stopFirst.r_multiple)===-1,
    gapInvalidated:gap.state==="SKIPPED"&&gap.outcome==="ENTRY_GAP_INVALIDATED",
    missingEntrySkipped:missing.state==="SKIPPED"&&missing.outcome==="MISSING_ENTRY_BAR",
    nextOpenUsed:Number(target.entry_price)===1.0000,
    targetRebased:Math.abs(Number(target.take_profit)-1.0018)<1e-9
  };

  return NextResponse.json({
    ok:Object.values(assertions).every(Boolean),
    mode:"V2_SHADOW_OUTCOME_RULES_TEST",
    assertions,
    samples:{target,stopFirst,gap,missing}
  },{headers:{"Cache-Control":"no-store"}});
}
