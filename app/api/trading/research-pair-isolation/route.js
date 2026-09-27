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

const portfolios = [
  { id: "USDCHF", symbols: ["USDCHF"] },
  { id: "GBPUSD", symbols: ["GBPUSD"] },
  { id: "USDCHF_GBPUSD", symbols: ["USDCHF","GBPUSD"] },
  { id: "ALL_3", symbols: ["USDCHF","EURUSD","GBPUSD"] }
];

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
    minLotSkips: m.minLotSkips,
    spreadBlocked: m.spreadBlocked,
    newsBlocked: m.newsBlocked,
    capacityBlocked: m.capacityBlocked,
    longestLosingStreak: m.longestLosingStreak,
    byPair: Object.fromEntries(Object.entries(sim.byPair).map(([symbol,p]) => [symbol, {
      tradeCount: p.tradeCount,
      totalR: p.totalR,
      expectancyR: p.expectancyR,
      endingBalance: p.endingBalance,
      profitFactor: p.profitFactor
    }]))
  };
}

export async function GET() {
  try {
    const safe = safety();
    const dataset = await loadHistoryDataset();
    const prepared = validateDataset(dataset);
    for (const symbol of SYMBOLS) prepared.pairs[symbol] = preparePair(prepared.pairs[symbol]);
    const schedule = fitSchedule(prepared);
    const from = schedule[0].from;
    const to = prepared.to;

    const results = [];
    for (const news of ["STRICT_BLACKOUT","COOLDOWN"]) {
      const combo = {
        id: "ISOLATION",
        risk: "1.00",
        positions: 1,
        daily: "PORTFOLIO",
        news,
        parameters: "SHARED",
        objective: "RETURN"
      };
      for (const portfolio of portfolios) {
        const base = simulate({ prepared, combo, schedule, costs: COSTS.BASE, from, to, symbols: portfolio.symbols });
        const stress = simulate({ prepared, combo, schedule, costs: COSTS.STRESS, from, to, symbols: portfolio.symbols });
        results.push({
          portfolio: portfolio.id,
          symbols: portfolio.symbols,
          news,
          base: compact(base),
          stress: compact(stress)
        });
      }
    }

    return json({
      ok: true,
      readOnlyTrading: true,
      safety: safe,
      assumptions: {
        capital: 200,
        riskPercent: 1,
        positions: 1,
        dailyLimit: "PORTFOLIO",
        parameters: "SHARED_ADX20",
        validationFrom: new Date(from).toISOString(),
        validationTo: new Date(to).toISOString(),
        baseCosts: COSTS.BASE,
        stressCosts: COSTS.STRESS
      },
      inputHash: prepared.inputHash,
      results
    });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      readOnlyTrading: true,
      error: String(error?.message || "").startsWith("RESEARCH_") ? error.message : "RESEARCH_PAIR_ISOLATION_FAILED"
    }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}
