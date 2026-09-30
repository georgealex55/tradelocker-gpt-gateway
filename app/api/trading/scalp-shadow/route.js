import { NextResponse } from "next/server";
import { listForexInstruments } from "../../../../lib/forexUniverse";
import {
  scanScalpShadow,
  SCALP_SHADOW_CONFIG
} from "../../../../lib/scalpShadow.mjs";
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
    (cronSecret && auth === "Bearer " + cronSecret) ||
    (approvalKey && approval === approvalKey)
  );
}

export async function GET(request) {
  if (!authorized(request)) {
    return NextResponse.json(
      { ok:false, error:"Unauthorized scalp shadow request" },
      { status:401 }
    );
  }

  try {
    const tradingEnabled =
      String(process.env.TRADING_ENABLED || "false").toLowerCase() === "true";
    const killSwitch = killSwitchEnabled();

    if (tradingEnabled || !killSwitch) {
      return NextResponse.json(
        {
          ok:false,
          mode:"SCALP_SHADOW",
          readOnlyTrading:true,
          liveExecutionPossible:false,
          error:"SCALP_SHADOW_REQUIRES_TRADING_DISABLED_AND_KILL_SWITCH_ON",
          safety:{ tradingEnabled, killSwitch }
        },
        { status:409, headers:{ "Cache-Control":"no-store" } }
      );
    }

    const asOf = Date.now();
    const universe = await listForexInstruments();
    const results = [];

    for (const symbol of SCALP_SHADOW_CONFIG.symbols) {
      const instrument = universe.find(item => item.symbol === symbol);
      if (!instrument) {
        results.push({
          symbol,
          ok:false,
          error:"INSTRUMENT_NOT_FOUND"
        });
        continue;
      }

      try {
        const result = await scanScalpShadow({ instrument, asOf });

        let saved = null;
        try {
          saved = await recordSignalObservation({
            signal: result.signal,
            riskEstimate:null,
            execution:result.execution
          });
        } catch (persistError) {
          console.warn("[scalp-shadow] observation persistence failed", {
            symbol,
            error:String(persistError?.message || persistError)
          });
        }

        results.push({
          ok:true,
          ...result,
          observationPersisted:Boolean(saved)
        });
      } catch (error) {
        results.push({
          symbol,
          ok:false,
          error:String(error?.message || error)
        });
      }
    }

    return NextResponse.json(
      {
        ok:results.some(r => r.ok),
        mode:
          process.env.VERCEL_ENV === "production"
            ? "SCALP_SHADOW"
            : "SCALP_SHADOW_PREVIEW",
        readOnlyTrading:true,
        liveExecutionPossible:false,
        generatedAt:Date.now(),
        asOf,
        strategy:SCALP_SHADOW_CONFIG.name,
        version:SCALP_SHADOW_CONFIG.version,
        config:SCALP_SHADOW_CONFIG.strategy,
        symbols:SCALP_SHADOW_CONFIG.symbols,
        executionCostPolicy:{
          maxSpreadPips:SCALP_SHADOW_CONFIG.maxSpreadPips,
          maxSpreadAsStopFraction:
            SCALP_SHADOW_CONFIG.maxSpreadAsStopFraction,
          slippagePipsPerSide:
            SCALP_SHADOW_CONFIG.slippagePipsPerSide
        },
        results,
        safety:{
          tradingEnabled,
          killSwitch,
          brokerOrderSubmitted:false
        }
      },
      { headers:{ "Cache-Control":"no-store" } }
    );
  } catch (error) {
    return NextResponse.json(
      {
        ok:false,
        mode:"SCALP_SHADOW",
        readOnlyTrading:true,
        liveExecutionPossible:false,
        error:String(error?.message || error)
      },
      { status:500, headers:{ "Cache-Control":"no-store" } }
    );
  }
}
