import { NextResponse } from "next/server";
import { listRecentSignalObservations } from "../../../../lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const STRATEGY = "structure-a2-displacement-short-shadow";

function sanitize(row) {
  if (!row) return null;

  const signal =
    row.signal_json && typeof row.signal_json === "object"
      ? row.signal_json
      : {};

  return {
    strategy: row.strategy || signal.strategy || STRATEGY,
    version: row.strategy_version || signal.version || null,
    symbol: row.symbol || signal.symbol || "USDCHF",
    candleTime: Number(row.candle_time ?? signal.time ?? 0) || null,
    updatedAt: row.updated_at || null,
    status: row.status || signal.status || "WATCHING",
    action: row.action || signal.action || "HOLD",
    side: row.side || signal.side || null,
    candidateStage: signal.candidateStage || null,
    freshForEntry: signal.freshForEntry ?? null,
    expectedEntryTime: signal.expectedEntryTime ?? null,
    structureTrend: signal.structureTrend || null,
    latestHigh: signal.latestHigh || null,
    latestLow: signal.latestLow || null,
    structureEvent: signal.structureEvent || null,
    referenceEntry:
      row.reference_entry ?? signal.referenceEntry ?? null,
    stopLoss: row.stop_loss ?? signal.stopLoss ?? null,
    stopPips: signal.stopPips ?? null,
    spreadPips: row.spread_pips ?? signal.spreadPips ?? null,
    spreadAsStopFraction: signal.spreadAsStopFraction ?? null,
    atr: signal.atr ?? null,
    entryChannelHigh: signal.entryChannelHigh ?? null,
    entryChannelLow: signal.entryChannelLow ?? null,
    exitChannelHigh: signal.exitChannelHigh ?? null,
    exitChannelLow: signal.exitChannelLow ?? null,
    displacementBoundary: signal.displacementBoundary ?? null,
    breakoutQuality: signal.breakoutQuality ?? null,
    blocks: Array.isArray(signal.blocks) ? signal.blocks : [],
    executionStatus: row.execution_status || null,
    executionReason: row.execution_reason || null
  };
}

export async function GET() {
  try {
    const rows = await listRecentSignalObservations(100);
    const latest = rows.find(
      row => row.strategy === STRATEGY
    );

    return NextResponse.json(
      {
        ok: true,
        readOnly: true,
        strategy: STRATEGY,
        generatedAt: Date.now(),
        signal: sanitize(latest)
      },
      {
        headers: {
          "Cache-Control": "no-store, max-age=0"
        }
      }
    );
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        readOnly: true,
        strategy: STRATEGY,
        error: String(error?.message || error)
      },
      {
        status: 500,
        headers: {
          "Cache-Control": "no-store, max-age=0"
        }
      }
    );
  }
}
