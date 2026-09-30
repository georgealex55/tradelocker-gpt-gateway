import { NextResponse } from "next/server";
import { listForexInstruments } from "../../../../lib/forexUniverse";
import {
  scanSoftRegimeShadow,
  SOFT_REGIME_SHADOW_CONFIG
} from "../../../../lib/softRegimeShadow";
import { upcomingUsdChfMacroCalendar } from "../../../../lib/research/upcomingUsdChfMacroCalendar.mjs";
import { killSwitchEnabled } from "../../../../lib/tradeGuard";
import { recordSignalObservation } from "../../../../lib/db";
import {
  captureVirtualSignal,
  reconcileVirtualTrades,
  shadowOutcomeSummary
} from "../../../../lib/shadowVirtualTrades";

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
    (cronSecret && auth === `Bearer ${cronSecret}`) ||
    (approvalKey && approval === approvalKey)
  );
}

export async function GET(request) {
  if (!authorized(request)) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized soft-regime shadow request" },
      { status: 401 }
    );
  }

  try {
    const tradingEnabled =
      String(process.env.TRADING_ENABLED || "false").toLowerCase() === "true";
    const killSwitch = killSwitchEnabled();

    if (tradingEnabled || !killSwitch) {
      return NextResponse.json(
        {
          ok: false,
          mode: "SOFT_H1_PULLBACK_SHADOW",
          readOnlyTrading: true,
          liveExecutionPossible: false,
          error:
            "SOFT_REGIME_SHADOW_REQUIRES_TRADING_DISABLED_AND_KILL_SWITCH_ON",
          safety: { tradingEnabled, killSwitch }
        },
        { status: 409, headers: { "Cache-Control": "no-store" } }
      );
    }

    const asOf = Date.now();
    const universe = await listForexInstruments();
    const instrument = universe.find(
      item => item.symbol === SOFT_REGIME_SHADOW_CONFIG.symbol
    );

    if (!instrument) {
      throw new Error("USDCHF_NOT_FOUND");
    }

    const calendar = upcomingUsdChfMacroCalendar(asOf);
    const result = await scanSoftRegimeShadow({
      instrument,
      asOf,
      scheduledBlackouts: calendar.events
    });

    const virtualReconcile = await reconcileVirtualTrades({
      instrument,
      sizing: result.sizing,
      throughTime: result.latestBar?.time,
      strategy: SOFT_REGIME_SHADOW_CONFIG.name,
      strategyVersion: SOFT_REGIME_SHADOW_CONFIG.version,
      symbol: SOFT_REGIME_SHADOW_CONFIG.symbol
    });

    const saved = await recordSignalObservation({
      signal: result.signal,
      riskEstimate: result.riskEstimate,
      execution: result.execution
    });

    const virtualCapture = await captureVirtualSignal({
      signal: result.signal,
      riskEstimate: result.riskEstimate,
      sizing: result.sizing
    });

    const outcomes = await shadowOutcomeSummary({
      strategy: SOFT_REGIME_SHADOW_CONFIG.name,
      strategyVersion: SOFT_REGIME_SHADOW_CONFIG.version,
      symbol: SOFT_REGIME_SHADOW_CONFIG.symbol
    });

    return NextResponse.json(
      {
        ok: true,
        mode:
          process.env.VERCEL_ENV === "production"
            ? "SOFT_H1_PULLBACK_SHADOW"
            : "SOFT_H1_PULLBACK_SHADOW_PREVIEW",
        readOnlyTrading: true,
        liveExecutionPossible: false,
        generatedAt: Date.now(),
        asOf,
        completedThrough: result.completedThrough,
        strategy: result.strategy,
        version: result.version,
        symbol: SOFT_REGIME_SHADOW_CONFIG.symbol,
        status: result.signal?.status || null,
        action: result.signal?.action || null,
        side: result.signal?.side || null,
        candidateStage: result.signal?.candidateStage || null,
        regime: result.signal?.regime || null,
        softRegimeSetup: result.signal?.softRegimeSetup || null,
        expectedEntryTime: result.signal?.expectedEntryTime || null,
        freshForEntry: result.signal?.freshForEntry ?? null,
        referenceEntry: result.signal?.referenceEntry ?? null,
        stopLoss: result.signal?.stopLoss ?? null,
        takeProfit: result.signal?.takeProfit ?? null,
        targetR: result.signal?.targetR ?? null,
        spreadPips: result.signal?.spreadPips ?? null,
        stopPips: result.signal?.stopPips ?? null,
        spreadAsStopFraction:
          result.signal?.spreadAsStopFraction ?? null,
        blocks: result.signal?.blocks || [],
        riskPolicy: {
          mode: "FIXED_MIN_LOT_WITH_HARD_CEILING",
          researchCapitalUsd:
            SOFT_REGIME_SHADOW_CONFIG.researchCapitalUsd,
          riskCeilingPercent:
            SOFT_REGIME_SHADOW_CONFIG.riskCeilingPercent,
          maxLots: SOFT_REGIME_SHADOW_CONFIG.maxLots,
          riskEstimate: result.riskEstimate
        },
        nextMacroEvent: calendar.nextEvent,
        observationPersisted: Boolean(saved),
        virtualTrade: {
          reconcile: virtualReconcile,
          capture: {
            created: Boolean(virtualCapture?.created),
            reason: virtualCapture?.reason || null,
            id: virtualCapture?.trade?.id || null,
            state: virtualCapture?.trade?.state || null
          },
          summary: outcomes?.summary || {},
          latest: outcomes?.latest || []
        },
        execution: result.execution,
        safety: {
          tradingEnabled,
          killSwitch,
          brokerOrderSubmitted: false
        }
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        mode: "SOFT_H1_PULLBACK_SHADOW",
        readOnlyTrading: true,
        liveExecutionPossible: false,
        error: String(error?.message || error)
      },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}
