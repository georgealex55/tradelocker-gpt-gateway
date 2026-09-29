import { NextResponse } from "next/server";
import { listForexInstruments } from "../../../../lib/forexUniverse";
import {
  scanStructureA2Shadow,
  STRUCTURE_A2_SHADOW_CONFIG
} from "../../../../lib/structureA2Shadow";
import { upcomingUsdChfMacroCalendar } from "../../../../lib/research/upcomingUsdChfMacroCalendar.mjs";
import { killSwitchEnabled } from "../../../../lib/tradeGuard";
import { recordSignalObservation } from "../../../../lib/db";

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
      { ok: false, error: "Unauthorized Structure A2 shadow-scan request" },
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
          mode: "STRUCTURE_A2_SHADOW",
          readOnlyTrading: true,
          liveExecutionPossible: false,
          error:
            "STRUCTURE_A2_SHADOW_REQUIRES_TRADING_DISABLED_AND_KILL_SWITCH_ON",
          safety: { tradingEnabled, killSwitch }
        },
        { status: 409, headers: { "Cache-Control": "no-store" } }
      );
    }

    const asOf = Date.now();
    const universe = await listForexInstruments();
    const instrument = universe.find(
      item => item.symbol === STRUCTURE_A2_SHADOW_CONFIG.symbol
    );

    if (!instrument) {
      throw new Error("USDCHF_NOT_FOUND");
    }

    const calendar = upcomingUsdChfMacroCalendar(asOf);
    const result = await scanStructureA2Shadow({
      instrument,
      asOf,
      scheduledBlackouts: calendar.events
    });

    const saved = await recordSignalObservation({
      signal: result.signal,
      riskEstimate: result.riskEstimate,
      execution: result.execution
    });

    return NextResponse.json(
      {
        ok: true,
        mode:
          process.env.VERCEL_ENV === "production"
            ? "STRUCTURE_A2_SHADOW"
            : "STRUCTURE_A2_SHADOW_PREVIEW",
        readOnlyTrading: true,
        liveExecutionPossible: false,
        generatedAt: Date.now(),
        asOf,
        completedThrough: result.completedThrough,
        strategy: result.strategy,
        version: result.version,
        symbol: STRUCTURE_A2_SHADOW_CONFIG.symbol,
        status: result.signal?.status || null,
        action: result.signal?.action || null,
        side: result.signal?.side || null,
        candidateStage: result.signal?.candidateStage || null,
        blocks: result.signal?.blocks || [],
        h1Time: result.signal?.h1Time || null,
        expectedEntryTime: result.signal?.expectedEntryTime || null,
        freshForEntry: result.signal?.freshForEntry ?? null,
        structureTrend: result.signal?.structureTrend ?? null,
        latestHigh: result.signal?.latestHigh ?? null,
        latestLow: result.signal?.latestLow ?? null,
        structureEvent: result.signal?.structureEvent ?? null,
        entryChannelHigh: result.signal?.entryChannelHigh ?? null,
        entryChannelLow: result.signal?.entryChannelLow ?? null,
        exitChannelHigh: result.signal?.exitChannelHigh ?? null,
        exitChannelLow: result.signal?.exitChannelLow ?? null,
        displacementBoundary:
          result.signal?.displacementBoundary ?? null,
        breakoutQuality: result.signal?.breakoutQuality ?? null,
        atr: result.signal?.atr ?? null,
        referenceEntry: result.signal?.referenceEntry ?? null,
        stopLoss: result.signal?.stopLoss ?? null,
        stopPips: result.signal?.stopPips ?? null,
        spreadPips: result.quote?.spreadPips ?? null,
        spreadAsStopFraction:
          result.signal?.spreadAsStopFraction ?? null,
        account: result.account,
        riskPolicy: {
          mode: "HARD_CEILING",
          riskCeilingPercent:
            STRUCTURE_A2_SHADOW_CONFIG.riskCeilingPercent,
          maxLots: STRUCTURE_A2_SHADOW_CONFIG.maxLots,
          riskEstimate: result.riskEstimate
        },
        executionCostPolicy: {
          maxSpreadPips:
            STRUCTURE_A2_SHADOW_CONFIG.maxSpreadPips,
          slippagePipsPerSide:
            STRUCTURE_A2_SHADOW_CONFIG.slippagePipsPerSide,
          maxSpreadAsStopFraction:
            STRUCTURE_A2_SHADOW_CONFIG.maxSpreadAsStopFraction
        },
        nextMacroEvent: calendar.nextEvent,
        observationPersisted: Boolean(saved),
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
        mode: "STRUCTURE_A2_SHADOW",
        readOnlyTrading: true,
        liveExecutionPossible: false,
        error: String(error?.message || error)
      },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}
