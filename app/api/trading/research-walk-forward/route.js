import { NextResponse } from "next/server";
import { killSwitchEnabled } from "../../../../lib/tradeGuard";
import { loadHistoryDataset } from "../../../../lib/research/historyStore";
import { validateDataset, preparePair } from "../../../../lib/research/prepare.mjs";
import { simulate } from "../../../../lib/research/engine.mjs";
import { SYMBOLS, COSTS } from "../../../../lib/research/policies.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const WINDOW_COUNT = 6;

const json = data => NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });

function safety() {
  const tradingEnabled = String(process.env.TRADING_ENABLED || "false").toLowerCase() === "true";
  const killSwitch = killSwitchEnabled();
  if (tradingEnabled || !killSwitch) throw new Error("RESEARCH_REQUIRES_EXECUTION_DISABLED");
  return { tradingEnabled, killSwitch };
}

function compact(sim) {
  const m = sim.metrics;
  return {
    tradeCount: m.tradeCount,
    winRate: m.winRate,
    profitFactor: m.profitFactor,
    expectancyR: m.expectancyR,
    totalR: m.totalR,
    returnPercent: m.returnPercent,
    maxDrawdownPercent: m.maxDrawdownPercent,
    endingBalance: m.endingBalance,
    longestLosingStreak: m.longestLosingStreak,
    filtered: m.skips?.RESEARCH_ENTRY_FILTER || 0,
    spreadBlocked: m.spreadBlocked,
    minLotSkips: m.minLotSkips
  };
}

const filters = [
  { id: "BASELINE", fn: null },
  { id: "HOUR_10_PLUS", fn: ({hour}) => hour >= 10 },
  { id: "ADX_25_30", fn: ({signal}) => {
      const adx = Number(signal?.regime?.checks?.adx);
      return adx >= 25 && adx < 30;
    }
  },
  { id: "HOUR_10_PLUS_AND_ADX_25_30", fn: ({hour,signal}) => {
      const adx = Number(signal?.regime?.checks?.adx);
      return hour >= 10 && adx >= 25 && adx < 30;
    }
  }
];

function summarizeWindows(rows, side) {
  const vals = rows.map(r => r[side]);
  const finitePf = vals.map(v => v.profitFactor).filter(Number.isFinite);
  return {
    windows: vals.length,
    positiveExpectancyWindows: vals.filter(v => v.expectancyR > 0).length,
    pfAboveOneWindows: vals.filter(v => Number(v.profitFactor) > 1).length,
    positiveReturnWindows: vals.filter(v => v.returnPercent > 0).length,
    totalTrades: vals.reduce((n,v) => n + v.tradeCount, 0),
    totalR: vals.reduce((n,v) => n + v.totalR, 0),
    avgExpectancyR: vals.reduce((n,v) => n + v.expectancyR, 0) / vals.length,
    avgReturnPercent: vals.reduce((n,v) => n + v.returnPercent, 0) / vals.length,
    avgProfitFactor: finitePf.length ? finitePf.reduce((n,v) => n + v, 0) / finitePf.length : null,
    worstWindowExpectancyR: Math.min(...vals.map(v => v.expectancyR)),
    bestWindowExpectancyR: Math.max(...vals.map(v => v.expectancyR)),
    maxWindowDrawdownPercent: Math.max(...vals.map(v => v.maxDrawdownPercent))
  };
}

export async function GET() {
  try {
    const safe = safety();
    const dataset = await loadHistoryDataset();
    const prepared = validateDataset(dataset);
    for (const symbol of SYMBOLS) prepared.pairs[symbol] = preparePair(prepared.pairs[symbol]);

    const from = prepared.from;
    const to = prepared.to;
    const span = to - from;
    const windows = Array.from({ length: WINDOW_COUNT }, (_, i) => ({
      index: i + 1,
      from: Math.round(from + span * i / WINDOW_COUNT),
      to: i === WINDOW_COUNT - 1 ? to : Math.round(from + span * (i + 1) / WINDOW_COUNT)
    }));

    const combo = {
      id: "USDCHF_ROLLING_WALK_FORWARD",
      risk: "1.00",
      positions: 1,
      daily: "PORTFOLIO",
      news: "STRICT_BLACKOUT",
      parameters: "SHARED",
      objective: "RETURN"
    };

    const byRule = {};
    for (const f of filters) {
      const rows = windows.map(w => ({
        window: w.index,
        from: new Date(w.from).toISOString(),
        to: new Date(w.to).toISOString(),
        base: compact(simulate({
          prepared, combo, schedule: [], costs: COSTS.BASE,
          from: w.from, to: w.to, symbols: ["USDCHF"], startingBalance: 500, entryFilter: f.fn
        })),
        stress: compact(simulate({
          prepared, combo, schedule: [], costs: COSTS.STRESS,
          from: w.from, to: w.to, symbols: ["USDCHF"], startingBalance: 500, entryFilter: f.fn
        }))
      }));
      byRule[f.id] = {
        windows: rows,
        baseSummary: summarizeWindows(rows, "base"),
        stressSummary: summarizeWindows(rows, "stress")
      };
    }

    return json({
      ok: true,
      readOnlyTrading: true,
      safety: safe,
      inputHash: prepared.inputHash,
      assumptions: {
        purpose: "rolling walk-forward regime consistency",
        symbol: "USDCHF",
        capital: 500,
        riskPercent: 1,
        positions: 1,
        windowCount: WINDOW_COUNT,
        from: new Date(from).toISOString(),
        to: new Date(to).toISOString(),
        baseCosts: COSTS.BASE,
        stressCosts: COSTS.STRESS
      },
      byRule
    });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      readOnlyTrading: true,
      error: String(error?.message || "").startsWith("RESEARCH_") ? error.message : "RESEARCH_WALK_FORWARD_FAILED"
    }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}
