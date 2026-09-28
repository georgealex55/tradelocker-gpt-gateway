import { NextResponse } from "next/server";
import { killSwitchEnabled } from "../../../../lib/tradeGuard";
import { loadHistoryDataset } from "../../../../lib/research/historyStore";
import { validateDataset, preparePair } from "../../../../lib/research/prepare.mjs";
import { simulate } from "../../../../lib/research/engine.mjs";
import { SYMBOLS, COSTS } from "../../../../lib/research/policies.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const HOLDOUT_TO = Date.parse("2025-05-14T10:30:00.000Z");

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
    wins: m.wins,
    losses: m.losses,
    winRate: m.winRate,
    profitFactor: m.profitFactor,
    expectancyR: m.expectancyR,
    totalR: m.totalR,
    returnPercent: m.returnPercent,
    maxDrawdownPercent: m.maxDrawdownPercent,
    endingBalance: m.endingBalance,
    longestLosingStreak: m.longestLosingStreak,
    filtered: m.skips?.RESEARCH_ENTRY_FILTER || 0,
    minLotSkips: m.minLotSkips,
    spreadBlocked: m.spreadBlocked,
    newsBlocked: m.newsBlocked
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

export async function GET() {
  try {
    const safe = safety();
    const dataset = await loadHistoryDataset();
    const prepared = validateDataset(dataset);
    for (const symbol of SYMBOLS) prepared.pairs[symbol] = preparePair(prepared.pairs[symbol]);

    const from = prepared.from;
    const to = Math.min(HOLDOUT_TO, prepared.to);
    if (!(to > from)) throw new Error("RESEARCH_HOLDOUT_WINDOW_INVALID");

    const combo = {
      id: "USDCHF_PRE_DISCOVERY_HOLDOUT",
      risk: "1.00",
      positions: 1,
      daily: "PORTFOLIO",
      news: "STRICT_BLACKOUT",
      parameters: "SHARED",
      objective: "RETURN"
    };

    const results = filters.map(f => ({
      rule: f.id,
      base: compact(simulate({
        prepared, combo, schedule: [], costs: COSTS.BASE,
        from, to, symbols: ["USDCHF"], startingBalance: 500, entryFilter: f.fn
      })),
      stress: compact(simulate({
        prepared, combo, schedule: [], costs: COSTS.STRESS,
        from, to, symbols: ["USDCHF"], startingBalance: 500, entryFilter: f.fn
      }))
    }));

    return json({
      ok: true,
      readOnlyTrading: true,
      safety: safe,
      inputHash: prepared.inputHash,
      assumptions: {
        purpose: "pre-discovery holdout",
        symbol: "USDCHF",
        capital: 500,
        riskPercent: 1,
        positions: 1,
        from: new Date(from).toISOString(),
        to: new Date(to).toISOString(),
        discoveryWindowStarts: "2025-05-14T10:30:00.000Z",
        baseCosts: COSTS.BASE,
        stressCosts: COSTS.STRESS
      },
      results
    });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      readOnlyTrading: true,
      error: String(error?.message || "").startsWith("RESEARCH_") ? error.message : "RESEARCH_HOLDOUT_TEST_FAILED"
    }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}
