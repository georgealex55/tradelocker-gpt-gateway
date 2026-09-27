import { NextResponse } from "next/server";
import {
  dbHealth,
  listRecentSignalObservations
} from "../../../../lib/db";
import {
  scanPreferredForexSignals
} from "../../../../lib/forexSignals";

export const dynamic = "force-dynamic";

export async function GET() {
  if (process.env.VERCEL_ENV === "production") {
    return NextResponse.json(
      { ok: false, error: "Preview-only verification endpoint" },
      { status: 404 }
    );
  }

  try {
    const database = await dbHealth();

    if (!database.ok) {
      return NextResponse.json(
        {
          ok: false,
          stage: "database",
          database
        },
        { status: 500 }
      );
    }

    const scan = await scanPreferredForexSignals();
    const rows = await listRecentSignalObservations(5);

    const usdchf = (scan.results || []).find(
      row => row.instrument?.symbol === "USDCHF"
    ) || null;

    return NextResponse.json({
      ok: Boolean(
        database.ok &&
        usdchf?.ok &&
        rows.some(row => row.symbol === "USDCHF")
      ),
      mode: "PREVIEW_READ_ONLY",
      liveExecutionPossible: false,
      database,
      scan: usdchf
        ? {
            ok: usdchf.ok,
            symbol: usdchf.instrument?.symbol || null,
            signalStatus: usdchf.signal?.status || null,
            action: usdchf.signal?.action || null,
            executionStatus: usdchf.execution?.status || null,
            executionReason: usdchf.execution?.reason || null,
            error: usdchf.error || null
          }
        : null,
      persistence: {
        recentCount: rows.length,
        latest: rows[0]
          ? {
              id: rows[0].id,
              strategy: rows[0].strategy,
              strategyVersion: rows[0].strategy_version,
              symbol: rows[0].symbol,
              candleTime: rows[0].candle_time,
              status: rows[0].status,
              action: rows[0].action,
              executionStatus: rows[0].execution_status,
              executionReason: rows[0].execution_reason,
              updatedAt: rows[0].updated_at
            }
          : null
      }
    });
  } catch (error) {
    console.error("[runtime-verify] failed", {
      message: error.message
    });

    return NextResponse.json(
      {
        ok: false,
        stage: "runtime",
        error: error.message
      },
      { status: 500 }
    );
  }
}
