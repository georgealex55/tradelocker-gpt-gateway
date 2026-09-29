import { NextResponse } from "next/server";
import { listForexInstruments } from "../../../../lib/forexUniverse";
import { scanPriceBreakoutShadow } from "../../../../lib/priceBreakoutShadow";
import { upcomingUsdChfMacroCalendar } from "../../../../lib/research/upcomingUsdChfMacroCalendar.mjs";
import { killSwitchEnabled } from "../../../../lib/tradeGuard";
import { recordSignalObservation } from "../../../../lib/db";
import { effectiveMaxRiskPercent } from "../../../../lib/liveRiskPolicy";

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
      { ok: false, error: "Unauthorized shadow-scan request" },
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
          mode: "PRICE_BREAKOUT_V1_SHADOW",
          readOnlyTrading: true,
          liveExecutionPossible: false,
          error:
            "BREAKOUT_SHADOW_REQUIRES_TRADING_DISABLED_AND_KILL_SWITCH_ON",
          safety: { tradingEnabled, killSwitch }
        },
        { status: 409, headers: { "Cache-Control": "no-store" } }
      );
    }

    const asOf = Date.now();
    const universe = await listForexInstruments();
    const instrument = universe.find(x => x.symbol === "USDCHF");

    if (!instrument) {
      throw new Error("USDCHF_NOT_FOUND");
    }

    const calendar = upcomingUsdChfMacroCalendar(asOf);
    const result = await scanPriceBreakoutShadow({
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
            ? "PRICE_BREAKOUT_V1_SHADOW"
            : "PRICE_BREAKOUT_V1_SHADOW_PREVIEW",
        readOnlyTrading: true,
        liveExecutionPossible: false,
        generatedAt: Date.now(),
        asOf,
        completedThrough: result.completedThrough,
        strategy: result.strategy,
        version: result.version,
        symbol: "USDCHF",
        status: result.signal?.status || null,
        action: result.signal?.action || null,
        side: result.signal?.side || null,
        blocks: result.signal?.blocks || [],
        h1Time: result.signal?.h1Time || null,
        expectedEntryTime: result.signal?.expectedEntryTime || null,
        freshForEntry: result.signal?.freshForEntry ?? null,
        entryChannelHigh: result.signal?.entryChannelHigh ?? null,
        entryChannelLow: result.signal?.entryChannelLow ?? null,
        exitChannelHigh: result.signal?.exitChannelHigh ?? null,
        exitChannelLow: result.signal?.exitChannelLow ?? null,
        atr: result.signal?.atr ?? null,
        referenceEntry: result.signal?.referenceEntry ?? null,
        stopLoss: result.signal?.stopLoss ?? null,
        stopPips: result.signal?.stopPips ?? null,
        spreadPips: result.quote?.spreadPips ?? null,
        spreadAsStopFraction:
          result.signal?.spreadAsStopFraction ?? null,
        account: result.account,
        riskPolicy: {
          maxRiskPercent: effectiveMaxRiskPercent(),
          maxLots: 0.01,
          riskEstimate: result.riskEstimate
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
        mode: "PRICE_BREAKOUT_V1_SHADOW",
        readOnlyTrading: true,
        liveExecutionPossible: false,
        error: String(error?.message || error)
      },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}
