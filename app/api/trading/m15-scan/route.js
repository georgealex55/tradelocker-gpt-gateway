import { NextResponse } from "next/server";
import { scanPreferredForexSignals } from "../../../../lib/forexSignals";

export const dynamic = "force-dynamic";

function productionAuthorized(request) {
  if (process.env.VERCEL_ENV !== "production") {
    return true;
  }

  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");

  return Boolean(
    secret &&
    auth === `Bearer ${secret}`
  );
}

export async function GET(request) {
  if (!productionAuthorized(request)) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized cron request" },
      { status: 401 }
    );
  }

  try {
    const asOf = Date.now();
    const scan = await scanPreferredForexSignals({ asOf });

    const results = (scan.results || []).map(row => ({
      ok: row.ok,
      symbol: row.instrument?.symbol || null,
      completedThrough: row.completedThrough || null,
      latestBarTime: row.latestBar?.time || null,
      status: row.signal?.status || null,
      action: row.signal?.action || null,
      executionStatus: row.execution?.status || null,
      executionReason: row.execution?.reason || null,
      spreadPips: row.quote?.spreadPips ?? null,
      stopPips: row.signal?.stopPips ?? null,
      spreadAsStopFraction:
        row.signal?.spreadAsStopFraction ?? null,
      error: row.error || null
    }));

    return NextResponse.json({
      ok: results.length > 0 && results.every(row => row.ok),
      mode:
        process.env.VERCEL_ENV === "production"
          ? "PRODUCTION_SCAN_ONLY_CRON"
          : "PREVIEW_SCAN_ONLY_TEST",
      liveExecutionPossible: false,
      generatedAt: scan.generatedAt,
      asOf: scan.asOf,
      strategy: scan.strategy,
      version: scan.version,
      results
    });
  } catch (error) {
    console.error("[m15-scan] failed", {
      message: error.message
    });

    return NextResponse.json(
      {
        ok: false,
        liveExecutionPossible: false,
        error: error.message
      },
      { status: 500 }
    );
  }
}
