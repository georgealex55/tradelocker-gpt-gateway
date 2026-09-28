import { NextResponse } from "next/server";
import { killSwitchEnabled } from "../../../../lib/tradeGuard";
import { loadHistoryDataset } from "../../../../lib/research/historyStore";
import { validateDataset, preparePair, fitSchedule, evaluateCombo } from "../../../../lib/research/prepare.mjs";
import { SYMBOLS, combinations, ENGINE_VERSION } from "../../../../lib/research/policies.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const json = (data, status = 200) =>
  NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });

function safety() {
  const tradingEnabled = String(process.env.TRADING_ENABLED || "false").toLowerCase() === "true";
  const killSwitch = killSwitchEnabled();
  if (tradingEnabled || !killSwitch) throw new Error("RESEARCH_REQUIRES_EXECUTION_DISABLED");
  return { tradingEnabled, killSwitch };
}

export async function GET() {
  let stage = "start";
  try {
    stage = "safety";
    const safe = safety();

    stage = "load";
    const dataset = await loadHistoryDataset();

    stage = "validate";
    const prepared = validateDataset(dataset);

    stage = "prepare";
    for (const symbol of SYMBOLS) {
      prepared.pairs[symbol] = preparePair(prepared.pairs[symbol]);
    }

    stage = "fit";
    const schedule = fitSchedule(prepared);

    stage = "evaluate";
    const results = combinations().slice(0, 12).map(combo => evaluateCombo(prepared, combo, schedule));

    return json({
      ok: true,
      readOnlyTrading: true,
      engineVersion: ENGINE_VERSION,
      safety: safe,
      validation: {
        from: new Date(prepared.from).toISOString(),
        to: new Date(prepared.to).toISOString(),
        coverage: prepared.coverage,
        missingByPair: prepared.missingByPair,
        droppedIncompleteHours: prepared.droppedIncompleteHours,
        inputHash: prepared.inputHash,
        blackoutCount: prepared.blackouts.length
      },
      schedule,
      pilot: {
        completed: results.length,
        results: results.map(r => ({
          combo: r.combo,
          eligible: r.eligible,
          rejectionReasons: r.rejectionReasons,
          score: r.score,
          validation: r.validation?.metrics,
          stress: r.stress?.metrics,
          byPair: r.validation?.byPair
        }))
      }
    });
  } catch (error) {
    const message = String(error?.message || "");
    const safeError =
      message.startsWith("RESEARCH_") ||
      message.startsWith("CALENDAR_") ||
      message.startsWith("COMMON_") ||
      message.startsWith("INCOMPLETE_")
        ? message
        : "RESEARCH_PILOT_FAILED";
    return json({ ok: false, readOnlyTrading: true, stage, error: safeError }, 500);
  }
}
