import { NextResponse } from "next/server";
import { killSwitchEnabled } from "../../../../lib/tradeGuard";
import { loadHistoryDataset } from "../../../../lib/research/historyStore";
import { validateDataset, preparePair, fitSchedule } from "../../../../lib/research/prepare.mjs";
import { simulate } from "../../../../lib/research/engine.mjs";
import { SYMBOLS, COSTS } from "../../../../lib/research/policies.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

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
    spreadBlocked: m.spreadBlocked
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
    const schedule = fitSchedule(prepared);
    const from = schedule[0].from;
    const to = prepared.to;

    const combo = {
      id: "USDCHF_FILTER_TEST",
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
        prepared, combo, schedule, costs: COSTS.BASE,
        from, to, symbols: ["USDCHF"], startingBalance: 500, entryFilter: f.fn
      })),
      stress: compact(simulate({
        prepared, combo, schedule, costs: COSTS.STRESS,
        from, to, symbols: ["USDCHF"], startingBalance: 500, entryFilter: f.fn
      }))
    }));

    return json({
      ok: true,
      readOnlyTrading: true,
      safety: safe,
      inputHash: prepared.inputHash,
      assumptions: {
        symbol: "USDCHF",
        capital: 500,
        riskPercent: 1,
        positions: 1,
        validationFrom: new Date(from).toISOString(),
        validationTo: new Date(to).toISOString(),
        baseCosts: COSTS.BASE,
        stressCosts: COSTS.STRESS
      },
      results
    });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      readOnlyTrading: true,
      error: String(error?.message || "").startsWith("RESEARCH_") ? error.message : "RESEARCH_FILTER_TEST_FAILED"
    }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}
