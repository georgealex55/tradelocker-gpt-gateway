import { NextResponse } from "next/server";
import { killSwitchEnabled } from "../../../../lib/tradeGuard";
import { loadHistoryDataset } from "../../../../lib/research/historyStore";
import { validateDataset, preparePair, fitSchedule } from "../../../../lib/research/prepare.mjs";
import { simulate } from "../../../../lib/research/engine.mjs";
import { SYMBOLS, COSTS } from "../../../../lib/research/policies.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const CAPITALS = [200,250,300,350,400,500];

const json = data => NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });

function safety() {
  const tradingEnabled = String(process.env.TRADING_ENABLED || "false").toLowerCase() === "true";
  const killSwitch = killSwitchEnabled();
  if (tradingEnabled || !killSwitch) throw new Error("RESEARCH_REQUIRES_EXECUTION_DISABLED");
  return { tradingEnabled, killSwitch };
}

function compact(sim) {
  const m = sim.metrics;
  const sizingReached = m.tradeCount + (m.minLotSkips || 0) + (m.skips?.PORTFOLIO_RISK_CAP || 0);
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
    portfolioRiskCapSkips: m.skips?.PORTFOLIO_RISK_CAP || 0,
    sizingReached,
    executableRate: sizingReached ? m.tradeCount / sizingReached : 0
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

    const combo = {
      id: "CAPITAL_THRESHOLD",
      risk: "1.00",
      positions: 1,
      daily: "PORTFOLIO",
      news: "STRICT_BLACKOUT",
      parameters: "SHARED",
      objective: "RETURN"
    };

    const results = CAPITALS.map(capital => {
      const base = simulate({
        prepared, combo, schedule, costs: COSTS.BASE,
        from, to, symbols: ["USDCHF"], startingBalance: capital
      });
      const stress = simulate({
        prepared, combo, schedule, costs: COSTS.STRESS,
        from, to, symbols: ["USDCHF"], startingBalance: capital
      });
      return { capital, base: compact(base), stress: compact(stress) };
    });

    return json({
      ok: true,
      readOnlyTrading: true,
      safety: safe,
      inputHash: prepared.inputHash,
      assumptions: {
        symbol: "USDCHF",
        riskPercent: 1,
        positions: 1,
        dailyLimit: "PORTFOLIO",
        parameters: "SHARED_ADX20",
        news: "STRICT_BLACKOUT",
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
      error: String(error?.message || "").startsWith("RESEARCH_") ? error.message : "RESEARCH_CAPITAL_THRESHOLD_FAILED"
    }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}
