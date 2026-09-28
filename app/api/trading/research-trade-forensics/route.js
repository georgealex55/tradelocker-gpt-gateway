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

function stats(rows) {
  const wins = rows.filter(r => r.rMultiple > 0);
  const losses = rows.filter(r => r.rMultiple < 0);
  const grossWin = wins.reduce((n,r) => n + r.rMultiple, 0);
  const grossLoss = -losses.reduce((n,r) => n + r.rMultiple, 0);
  const totalR = rows.reduce((n,r) => n + r.rMultiple, 0);
  return {
    trades: rows.length,
    wins: wins.length,
    losses: losses.length,
    winRate: rows.length ? wins.length / rows.length * 100 : 0,
    profitFactorR: grossLoss > 0 ? grossWin / grossLoss : null,
    expectancyR: rows.length ? totalR / rows.length : 0,
    totalR,
    averageStopPips: rows.length ? rows.reduce((n,r) => n + r.stopPips, 0) / rows.length : null
  };
}

function bucket(rows, keyFn) {
  const groups = {};
  for (const row of rows) {
    const key = keyFn(row);
    (groups[key] ||= []).push(row);
  }
  return Object.fromEntries(Object.entries(groups).sort(([a],[b]) => a.localeCompare(b)).map(([k,v]) => [k, stats(v)]));
}

function enrich(sim, prepared, costs) {
  return sim.trades.map(t => {
    const signal = prepared.pairs[t.symbol].tapes[t.selectedAdx]?.[t.signalTime] || {};
    const regime = signal.regime?.checks || {};
    const indicators = signal.indicators || {};
    return {
      ...t,
      entryHourUtc: new Date(t.entryTime).getUTCHours(),
      h1Adx: Number(regime.adx),
      h1Pdi: Number(regime.pdi),
      h1Mdi: Number(regime.mdi),
      h1DiGap: Math.abs(Number(regime.pdi) - Number(regime.mdi)),
      h1EmaGapPips: Number.isFinite(Number(regime.ema50)) && Number.isFinite(Number(regime.ema200))
        ? Math.abs(Number(regime.ema50) - Number(regime.ema200)) / prepared.pairs[t.symbol].metadata.pipSize
        : null,
      m15Rsi: Number(indicators.rsi),
      m15AtrPips: Number.isFinite(Number(indicators.atr))
        ? Number(indicators.atr) / prepared.pairs[t.symbol].metadata.pipSize
        : null,
      spreadToStop: costs.spreadPips / t.stopPips
    };
  });
}

function result(sim, prepared, costs) {
  const rows = enrich(sim, prepared, costs);
  const stopBucket = x => x < 10 ? "<10" : x < 12 ? "10-12" : x < 15 ? "12-15" : "15+";
  const adxBucket = x => x < 25 ? "20-25" : x < 30 ? "25-30" : "30+";
  const diBucket = x => x < 10 ? "<10" : x < 20 ? "10-20" : "20+";
  const spreadBucket = x => x <= 0.10 ? "<=10%" : x <= 0.15 ? "10-15%" : "15-20%";
  const rsiBucket = x => x < 45 ? "<45" : x < 55 ? "45-55" : "55+";
  const emaGapBucket = x => x < 10 ? "<10p" : x < 25 ? "10-25p" : x < 50 ? "25-50p" : "50p+";

  return {
    overall: stats(rows),
    bySide: bucket(rows, r => r.side),
    byEntryHourUtc: bucket(rows, r => String(r.entryHourUtc).padStart(2,"0")),
    byStopPips: bucket(rows, r => stopBucket(r.stopPips)),
    byH1Adx: bucket(rows, r => adxBucket(r.h1Adx)),
    byH1DiGap: bucket(rows, r => diBucket(r.h1DiGap)),
    byH1EmaGap: bucket(rows, r => emaGapBucket(r.h1EmaGapPips)),
    bySpreadToStop: bucket(rows, r => spreadBucket(r.spreadToStop)),
    byM15Rsi: bucket(rows, r => rsiBucket(r.m15Rsi)),
    exits: bucket(rows, r => r.reason),
    trades: rows.map(r => ({
      entryTime: new Date(r.entryTime).toISOString(),
      side: r.side,
      exitReason: r.reason,
      rMultiple: r.rMultiple,
      stopPips: r.stopPips,
      entryHourUtc: r.entryHourUtc,
      h1Adx: r.h1Adx,
      h1DiGap: r.h1DiGap,
      h1EmaGapPips: r.h1EmaGapPips,
      m15Rsi: r.m15Rsi,
      m15AtrPips: r.m15AtrPips,
      spreadToStopPercent: r.spreadToStop * 100
    }))
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
      id: "USDCHF_FORENSICS",
      risk: "1.00",
      positions: 1,
      daily: "PORTFOLIO",
      news: "STRICT_BLACKOUT",
      parameters: "SHARED",
      objective: "RETURN"
    };

    const base = simulate({
      prepared, combo, schedule, costs: COSTS.BASE,
      from, to, symbols: ["USDCHF"], startingBalance: 500
    });
    const stress = simulate({
      prepared, combo, schedule, costs: COSTS.STRESS,
      from, to, symbols: ["USDCHF"], startingBalance: 500
    });

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
        adxPolicy: "SHARED_ADX20",
        validationFrom: new Date(from).toISOString(),
        validationTo: new Date(to).toISOString(),
        baseCosts: COSTS.BASE,
        stressCosts: COSTS.STRESS
      },
      base: result(base, prepared, COSTS.BASE),
      stress: result(stress, prepared, COSTS.STRESS)
    });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      readOnlyTrading: true,
      error: String(error?.message || "").startsWith("RESEARCH_") ? error.message : "RESEARCH_TRADE_FORENSICS_FAILED"
    }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}
