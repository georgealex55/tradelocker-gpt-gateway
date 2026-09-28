import { NextResponse } from "next/server";
import { killSwitchEnabled } from "../../../../lib/tradeGuard";
import { loadHistoryDataset } from "../../../../lib/research/historyStore";
import { validateDataset, preparePair, fitSchedule, evaluateCombo } from "../../../../lib/research/prepare.mjs";
import { SYMBOLS, combinations } from "../../../../lib/research/policies.mjs";

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

function pick(risk, news, parameters, positions = 1) {
  return combinations().find(c =>
    c.risk === risk &&
    c.positions === positions &&
    c.daily === "PORTFOLIO" &&
    c.news === news &&
    c.parameters === parameters &&
    c.objective === "RETURN"
  );
}

export async function GET() {
  try {
    const safe = safety();
    const dataset = await loadHistoryDataset();
    const prepared = validateDataset(dataset);
    for (const symbol of SYMBOLS) prepared.pairs[symbol] = preparePair(prepared.pairs[symbol]);
    const schedule = fitSchedule(prepared);

    const cases = [];
    for (const positions of [1,2]) {
      for (const risk of ["0.75","1.00","ADAPTIVE"]) {
        for (const news of ["STRICT_BLACKOUT","COOLDOWN"]) {
          for (const parameters of ["SHARED","PAIR_SPECIFIC"]) {
            const combo = pick(risk, news, parameters, positions);
            const r = evaluateCombo(prepared, combo, schedule);
            const m = r.validation.metrics;
            const sizingReached = m.tradeCount + (m.minLotSkips || 0) + (m.skips?.PORTFOLIO_RISK_CAP || 0);
            cases.push({
              id: combo.id,
              risk,
              positions,
              news,
              parameters,
              eligible: r.eligible,
              reasons: r.rejectionReasons,
              validation: {
                tradeCount: m.tradeCount,
                winRate: m.winRate,
                profitFactor: m.profitFactor,
                expectancyR: m.expectancyR,
                totalR: m.totalR,
                returnPercent: m.returnPercent,
                maxDrawdownPercent: m.maxDrawdownPercent,
                endingBalance: m.endingBalance,
                minLotSkips: m.minLotSkips,
                portfolioRiskCapSkips: m.skips?.PORTFOLIO_RISK_CAP || 0,
                spreadBlocked: m.spreadBlocked,
                newsBlocked: m.newsBlocked,
                capacityBlocked: m.capacityBlocked,
                sizingReached,
                executableRate: sizingReached ? m.tradeCount / sizingReached : 0
              },
              stress: {
                tradeCount: r.stress.metrics.tradeCount,
                minLotSkips: r.stress.metrics.minLotSkips,
                spreadBlocked: r.stress.metrics.spreadBlocked,
                expectancyR: r.stress.metrics.expectancyR,
                endingBalance: r.stress.metrics.endingBalance
              },
              byPair: Object.fromEntries(Object.entries(r.validation.byPair).map(([symbol,p]) => [symbol, {
                tradeCount: p.tradeCount,
                endingBalance: p.endingBalance,
                expectancyR: p.expectancyR,
                totalR: p.totalR
              }]))
            });
          }
        }
      }
    }

    const adxEvidence = schedule.map((w, index) => ({
      window: index + 1,
      from: new Date(w.from).toISOString(),
      to: new Date(w.to).toISOString(),
      selected: w.selected,
      evidence: Object.fromEntries(SYMBOLS.map(symbol => [symbol, {
        fallback: w.evidence[symbol].fallback,
        candidates: w.evidence[symbol].candidates.map(c => ({
          adx: c.adx,
          trades: c.metrics.tradeCount,
          profitFactor: c.metrics.profitFactor,
          expectancyR: c.metrics.expectancyR,
          score: c.score
        }))
      }]))
    }));

    return json({
      ok: true,
      readOnlyTrading: true,
      safety: safe,
      inputHash: prepared.inputHash,
      validationFrom: new Date(schedule[0].from).toISOString(),
      validationTo: new Date(prepared.to).toISOString(),
      cases,
      adxEvidence
    });
  } catch (error) {
    return NextResponse.json({ ok: false, readOnlyTrading: true, error: String(error?.message || "").startsWith("RESEARCH_") ? error.message : "RESEARCH_RISK_CHECK_FAILED" }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}
