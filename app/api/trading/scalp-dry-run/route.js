import { NextResponse } from "next/server";
import { listForexInstruments } from "../../../../lib/forexUniverse";
import { scanScalpShadow, SCALP_SHADOW_CONFIG } from "../../../../lib/scalpShadow.mjs";
import { buildRiskPreview } from "../../../../lib/risk";
import { assertExpectedAccount, killSwitchEnabled, makeStrategyId } from "../../../../lib/tradeGuard";
import { TRADE_STATES, createTradeRun, transitionTradeState, updateTradeFromPreview, publicTradeView } from "../../../../lib/tradeState";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

function authorized(request) {
  if (process.env.VERCEL_ENV !== "production") return true;
  const cronSecret = process.env.CRON_SECRET;
  const approvalKey = process.env.TRADE_APPROVAL_KEY;
  const auth = request.headers.get("authorization");
  const approval = request.headers.get("x-trade-approval-key");
  return Boolean(
    (cronSecret && auth === "Bearer " + cronSecret) ||
    (approvalKey && approval === approvalKey)
  );
}

function safetyState() {
  return {
    tradingEnabled: String(process.env.TRADING_ENABLED || "false").toLowerCase() === "true",
    killSwitch: killSwitchEnabled()
  };
}

export async function GET(request) {
  if (!authorized(request)) {
    return NextResponse.json({ ok:false, error:"Unauthorized scalp dry-run request" }, { status:401 });
  }

  const safety = safetyState();
  if (safety.tradingEnabled || !safety.killSwitch) {
    return NextResponse.json({
      ok:false,
      mode:"SCALP_2M_DRY_RUN",
      liveExecutionPossible:false,
      error:"2M_REQUIRES_TRADING_DISABLED_AND_KILL_SWITCH_ON",
      safety:{ ...safety, brokerOrderSubmitted:false }
    }, { status:409, headers:{ "Cache-Control":"no-store" } });
  }

  try {
    const { searchParams } = new URL(request.url);
    const symbol = String(searchParams.get("symbol") || "USDCHF").toUpperCase();

    if (!SCALP_SHADOW_CONFIG.symbols.includes(symbol)) {
      return NextResponse.json({
        ok:false, mode:"SCALP_2M_DRY_RUN", liveExecutionPossible:false,
        error:"UNSUPPORTED_SYMBOL", supportedSymbols:SCALP_SHADOW_CONFIG.symbols
      }, { status:400, headers:{ "Cache-Control":"no-store" } });
    }

    const universe = await listForexInstruments();
    const instrument = universe.find(item => item.symbol === symbol);
    if (!instrument) {
      return NextResponse.json({
        ok:false, mode:"SCALP_2M_DRY_RUN", liveExecutionPossible:false,
        error:"INSTRUMENT_NOT_FOUND", symbol
      }, { status:404, headers:{ "Cache-Control":"no-store" } });
    }

    const asOf = Date.now();
    const shadow = await scanScalpShadow({ instrument, asOf });
    const signal = shadow.signal;

    if (!signal?.freshForDryRun) {
      return NextResponse.json({
        ok:true, mode:"SCALP_2M_DRY_RUN", status:"NO_FRESH_ENTRY",
        dryRun:true, liveExecutionPossible:false, symbol, signal,
        execution:{ attempted:false, brokerOrderSubmitted:false, reason:"NO_FRESH_COMPLETED_M5_ENTRY" },
        safety:{ ...safety, brokerOrderSubmitted:false }
      }, { headers:{ "Cache-Control":"no-store" } });
    }

    if (signal.blocks?.length) {
      return NextResponse.json({
        ok:true, mode:"SCALP_2M_DRY_RUN", status:"BLOCKED",
        dryRun:true, liveExecutionPossible:false, symbol, signal,
        execution:{ attempted:false, brokerOrderSubmitted:false, reason:"SHADOW_EXECUTION_GATES_BLOCKED", blocks:signal.blocks },
        safety:{ ...safety, brokerOrderSubmitted:false }
      }, { headers:{ "Cache-Control":"no-store" } });
    }

    if (!Number.isFinite(signal.stopLoss) || !Number.isFinite(signal.takeProfit) || !["BULL","BEAR"].includes(signal.side)) {
      return NextResponse.json({
        ok:false, mode:"SCALP_2M_DRY_RUN", status:"INVALID_SIGNAL",
        dryRun:true, liveExecutionPossible:false, symbol, signal,
        safety:{ ...safety, brokerOrderSubmitted:false }
      }, { status:422, headers:{ "Cache-Control":"no-store" } });
    }

    const account = await assertExpectedAccount();
    const side = signal.side === "BULL" ? "buy" : "sell";
    const entryTime = Number(signal.entryTime);
    const idempotencyKey = "scalp-2m-" + symbol + "-" + entryTime;
    const strategyId = makeStrategyId(idempotencyKey);

    const requestInput = {
      symbol, side, type:"market", lots:0.01, qty:1000,
      tradeRouteId:instrument.tradeRouteId,
      infoRouteId:instrument.infoRouteId,
      tradableInstrumentId:instrument.tradableInstrumentId,
      stopLoss:signal.stopLoss,
      takeProfit:signal.takeProfit,
      source:"scalp-2m",
      dryRun:true,
      dryRunMode:"SCALP_2M",
      strategyId,
      referenceEntry:signal.referenceEntry,
      signalEntryTime:entryTime
    };

    const tracking = await createTradeRun({
      idempotencyKey, strategyId, source:"scalp-2m",
      input:requestInput, account, dryRun:true
    });

    let trade = tracking.trade;

    if (tracking.enabled && !tracking.created) {
      return NextResponse.json({
        ok:true, mode:"SCALP_2M_DRY_RUN", status:"IDEMPOTENT_REPLAY",
        dryRun:true, liveExecutionPossible:false, symbol, signal,
        trade:publicTradeView(trade),
        execution:{ attempted:false, brokerOrderSubmitted:false, reason:"ENTRY_ALREADY_DRY_RUN" },
        safety:{ ...safety, brokerOrderSubmitted:false }
      }, { headers:{ "Cache-Control":"no-store" } });
    }

    if (trade) {
      trade = await transitionTradeState(trade.id, TRADE_STATES.SIGNAL_VALIDATED, {
        eventType:"SCALP_SIGNAL_VALIDATED",
        payload:{
          symbol, signalEntryTime:entryTime, h1Bias:signal.h1Bias,
          spreadPips:signal.spreadPips,
          spreadAsStopFraction:signal.spreadAsStopFraction,
          shadowBlocks:signal.blocks || []
        }
      });
    }

    const preview = await buildRiskPreview({ ...requestInput, strategyId });

    if (trade) {
      trade = await updateTradeFromPreview(trade.id, preview, account);
    }

    if (!preview.ok) {
      if (trade) {
        trade = await transitionTradeState(trade.id, TRADE_STATES.RISK_REJECTED, {
          eventType:"SCALP_DRY_RUN_RISK_REJECTED",
          payload:{ failedChecks: preview.checks?.filter(check => !check.ok) || [] }
        });
      }
      return NextResponse.json({
        ok:true, mode:"SCALP_2M_DRY_RUN", status:"RISK_REJECTED",
        dryRun:true, liveExecutionPossible:false, symbol, signal, preview,
        trade:publicTradeView(trade),
        execution:{ attempted:true, brokerOrderSubmitted:false, reason:"RISK_ENGINE_REJECTED_DRY_RUN" },
        safety:{ ...safety, brokerOrderSubmitted:false }
      }, { headers:{ "Cache-Control":"no-store" } });
    }

    if (trade) {
      trade = await transitionTradeState(trade.id, TRADE_STATES.RISK_APPROVED, {
        eventType:"SCALP_DRY_RUN_RISK_APPROVED",
        payload:{
          riskPercent:preview.sizing?.estimatedRiskPercent ?? null,
          riskAmount:preview.sizing?.estimatedRiskAmount ?? null,
          riskReward:preview.sizing?.riskReward ?? null
        }
      });

      trade = await transitionTradeState(trade.id, TRADE_STATES.DRY_RUN_COMPLETE, {
        eventType:"SCALP_DRY_RUN_COMPLETE",
        payload:{
          brokerOrderSubmitted:false,
          order:preview.order,
          signalReferenceEntry:signal.referenceEntry,
          actualPreviewEntry:preview.sizing?.entryPrice ?? null
        }
      });
    }

    return NextResponse.json({
      ok:true, mode:"SCALP_2M_DRY_RUN", status:"DRY_RUN_COMPLETE",
      dryRun:true, liveExecutionPossible:false, symbol, signal, preview,
      trade:publicTradeView(trade),
      execution:{ attempted:true, brokerOrderSubmitted:false, reason:"DRY_RUN_ONLY_NO_BROKER_POST" },
      safety:{ ...safety, brokerOrderSubmitted:false }
    }, { headers:{ "Cache-Control":"no-store" } });
  } catch (error) {
    return NextResponse.json({
      ok:false, mode:"SCALP_2M_DRY_RUN", dryRun:true, liveExecutionPossible:false,
      error:String(error?.message || error),
      safety:{ ...safety, brokerOrderSubmitted:false }
    }, { status:500, headers:{ "Cache-Control":"no-store" } });
  }
}
