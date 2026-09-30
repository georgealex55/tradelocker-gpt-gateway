import fs from "node:fs/promises";
import path from "node:path";
import { StrategyEngine, defaultScalpConfig, groupSummary } from "../lib/scalpStrategyCore.mjs";

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf("--" + name);
  return i < 0 ? fallback : args[i + 1];
};

const gateway = flag("gateway", "https://tradelocker-gpt-gateway.vercel.app");
const requestedFrom = Date.parse(flag("from", "2024-01-01T00:00:00.000Z"));
const requestedTo = Date.parse(flag("to", new Date(Date.now() - 10 * 60_000).toISOString()));
const outputDir = path.resolve(flag("output", "research-output"));
const key = process.env.TRADE_APPROVAL_KEY;
const origin = new URL(gateway);

if (!key) throw new Error("TRADE_APPROVAL_KEY must be available");
if (!Number.isFinite(requestedFrom) || !Number.isFinite(requestedTo) || requestedTo <= requestedFrom) throw new Error("Invalid range");

await fs.mkdir(outputDir, { recursive: true });

async function request(route, body) {
  const response = await fetch(new URL(route, origin), {
    method: body ? "POST" : "GET",
    redirect: "error",
    signal: AbortSignal.timeout(120000),
    headers: {
      "x-trade-approval-key": key,
      ...(process.env.VERCEL_AUTOMATION_BYPASS_SECRET ? {
        "x-vercel-protection-bypass": process.env.VERCEL_AUTOMATION_BYPASS_SECRET
      } : {}),
      ...(body ? { "content-type": "application/json" } : {})
    },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  if (!response.ok) throw new Error("GATEWAY_HTTP_" + response.status);
  const data = await response.json();
  if (data?.ok === false || data?.error) throw new Error("GATEWAY_REQUEST_FAILED");
  return data;
}

async function safetyCheck() {
  const { runtime } = await request("/api/tradelocker/runtime-config");
  if (runtime?.tradingEnabled !== false || runtime?.killSwitch !== true) {
    throw new Error("RESEARCH_REQUIRES_EXECUTION_DISABLED");
  }
  return runtime;
}

async function fetchHistory(symbol) {
  const instruments = (await request("/api/trading/forex-universe")).instruments;
  const instrument = instruments.find(i => i.symbol === symbol);
  if (!instrument?.tradableInstrumentId || !instrument?.infoRouteId) throw new Error("MISSING_INSTRUMENT_" + symbol);

  const warmupFrom = requestedFrom - 31 * 86400000;
  const bars = new Map();
  const chunkMs = 4 * 86400000;

  for (let cursor = warmupFrom; cursor < requestedTo; cursor += chunkMs) {
    const end = Math.min(cursor + chunkMs - 1, requestedTo - 1);
    let chunk;

    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        chunk = (await request("/api/trading/history", {
          symbol,
          tradableInstrumentId: instrument.tradableInstrumentId,
          infoRouteId: instrument.infoRouteId,
          resolution: "5m",
          from: cursor,
          to: end,
          maxBars: 2000
        })).result;
        break;
      } catch (error) {
        const retryable = ["GATEWAY_HTTP_400","GATEWAY_HTTP_429","GATEWAY_HTTP_500","GATEWAY_HTTP_502","GATEWAY_HTTP_503","GATEWAY_HTTP_504"].includes(error.message);
        if (!retryable || attempt === 3) throw error;
        await new Promise(r => setTimeout(r, 1200 * (attempt + 1)));
      }
    }

    if (!chunk || chunk.truncated || chunk.chunks?.some(c => !["ok","no_data","no-data"].includes(c.status))) {
      throw new Error("HISTORY_CHUNK_INCOMPLETE_" + symbol);
    }

    for (const candle of chunk.candles || []) {
      const row = {
        time: Number(candle.time ?? candle.timestamp ?? candle.openTime ?? candle.t),
        open: Number(candle.open),
        high: Number(candle.high),
        low: Number(candle.low),
        close: Number(candle.close)
      };
      if (Number.isFinite(row.time) && [row.open,row.high,row.low,row.close].every(Number.isFinite)) bars.set(row.time, row);
    }

    await new Promise(r => setTimeout(r, 300));
  }

  const candles = [...bars.values()].sort((a,b) => a.time - b.time);
  if (candles.length < 5000) throw new Error("INSUFFICIENT_M5_HISTORY_" + symbol);
  return candles;
}

const configs = [
  defaultScalpConfig({ id:"d1-1.00__fvg010__fixed2__h1-nonOpposite", d1Range:1.00, stopModel:"fvg010", targetModel:"fixed2", h1Mode:"nonOpposite" }),
  defaultScalpConfig({ id:"d1-1.10__fvg010__fixed2__h1-nonOpposite", d1Range:1.10, stopModel:"fvg010", targetModel:"fixed2", h1Mode:"nonOpposite" }),
  defaultScalpConfig({ id:"d1-1.00__fvg005__fixed2__h1-nonOpposite", d1Range:1.00, stopModel:"fvg005", targetModel:"fixed2", h1Mode:"nonOpposite" }),
  defaultScalpConfig({ id:"d1-1.10__fvg005__fixed2__h1-nonOpposite", d1Range:1.10, stopModel:"fvg005", targetModel:"fixed2", h1Mode:"nonOpposite" }),
  defaultScalpConfig({ id:"d1-1.00__fvg010__structure__h1-nonOpposite", d1Range:1.00, stopModel:"fvg010", targetModel:"structure", h1Mode:"nonOpposite" }),
  defaultScalpConfig({ id:"d1-1.00__fvg005__structure__h1-nonOpposite", d1Range:1.00, stopModel:"fvg005", targetModel:"structure", h1Mode:"nonOpposite" })
];

const costScenarios = [
  { id:"zero", spreadPips:0.0, slippagePerSidePips:0.0 },
  { id:"light", spreadPips:0.5, slippagePerSidePips:0.1 },
  { id:"base", spreadPips:1.0, slippagePerSidePips:0.2 },
  { id:"stress", spreadPips:2.0, slippagePerSidePips:0.2 },
  { id:"severe", spreadPips:3.0, slippagePerSidePips:0.3 }
];

const PIP_SIZE = 0.0001;
const MAX_SPREAD_PIPS = 2.0;
const MAX_SPREAD_STOP_FRACTION = 0.15;

function stressTrades(trades, scenario, gated) {
  const stressed = [];

  for (const t of trades) {
    const stopPips = t.risk / PIP_SIZE;
    if (!(stopPips > 0)) continue;

    const spreadFraction = scenario.spreadPips / stopPips;
    const eligible = scenario.spreadPips <= MAX_SPREAD_PIPS && spreadFraction <= MAX_SPREAD_STOP_FRACTION;
    if (gated && !eligible) continue;

    const totalCostPips = scenario.spreadPips + 2 * scenario.slippagePerSidePips;
    const costR = totalCostPips / stopPips;
    stressed.push({
      ...t,
      stopPips,
      spreadFraction,
      costR,
      grossR: t.rResult,
      rResult: t.rResult - costR
    });
  }

  return stressed;
}

function summarizeStress(trades, scenario) {
  const noGate = stressTrades(trades, scenario, false);
  const gated = stressTrades(trades, scenario, true);
  return {
    scenario,
    all: groupSummary(noGate),
    gated: groupSummary(gated),
    gatePassCount: gated.length,
    gatePassRate: noGate.length ? gated.length / noGate.length : null,
    avgCostR: noGate.length ? noGate.reduce((s,t) => s + t.costR, 0) / noGate.length : null,
    medianStopPips: noGate.length
      ? [...noGate].sort((a,b) => a.stopPips - b.stopPips)[Math.floor(noGate.length / 2)].stopPips
      : null
  };
}

async function main() {
  const runtime = await safetyCheck();
  const symbols = ["USDCHF","EURUSD","GBPUSD"];
  const byPair = {};
  const rawTrades = {};
  const aggregateRows = [];

  for (const symbol of symbols) {
    const candles = await fetchHistory(symbol);
    byPair[symbol] = [];
    rawTrades[symbol] = {};

    for (const config of configs) {
      const engine = new StrategyEngine(symbol, requestedFrom, config);
      for (const candle of candles) engine.onBar(candle);
      const result = engine.summary();
      rawTrades[symbol][config.id] = result.trades;

      const scenarios = costScenarios.map(s => summarizeStress(result.trades, s));
      byPair[symbol].push({
        config,
        gross: result.overall,
        scenarios
      });

      for (const sc of scenarios) {
        console.log(
          "2K_PAIR|" + symbol +
          "|ID=" + config.id +
          "|COST=" + sc.scenario.id +
          "|TRADES=" + sc.all.trades +
          "|GATED=" + sc.gated.trades +
          "|GATE_RATE=" + (Number.isFinite(sc.gatePassRate) ? (sc.gatePassRate*100).toFixed(1)+"%" : "NA") +
          "|PF=" + (Number.isFinite(sc.gated.profitFactorR) ? sc.gated.profitFactorR.toFixed(3) : "NA") +
          "|EXP_R=" + (Number.isFinite(sc.gated.expectancyR) ? sc.gated.expectancyR.toFixed(3) : "NA") +
          "|TOTAL_R=" + sc.gated.totalR.toFixed(3)
        );
      }
    }
  }

  for (const config of configs) {
    for (const scenario of costScenarios) {
      const trades = [];
      let grossCount = 0;
      let gateCount = 0;
      for (const symbol of ["USDCHF","EURUSD","GBPUSD"]) {
        const pair = byPair[symbol].find(x => x.config.id === config.id);
        const pairScenario = pair?.scenarios.find(x => x.scenario.id === scenario.id);
        grossCount += pairScenario?.all.trades || 0;
        gateCount += pairScenario?.gated.trades || 0;
        trades.push(...stressTrades(rawTrades[symbol][config.id] || [], scenario, true));
      }

      const summary = groupSummary(trades);
      const row = {
        configId: config.id,
        scenario,
        grossCount,
        gatedCount: gateCount,
        gatePassRate: grossCount ? gateCount / grossCount : null,
        summary
      };
      aggregateRows.push(row);

      console.log(
        "2K_AGG|ID=" + config.id +
        "|COST=" + scenario.id +
        "|GATED=" + summary.trades +
        "|PF=" + (Number.isFinite(summary.profitFactorR) ? summary.profitFactorR.toFixed(3) : "NA") +
        "|EXP_R=" + (Number.isFinite(summary.expectancyR) ? summary.expectancyR.toFixed(3) : "NA") +
        "|TOTAL_R=" + summary.totalR.toFixed(3)
      );
    }
  }

  const out = {
    stage:"2K",
    source:"TradeLocker",
    symbols:["USDCHF","EURUSD","GBPUSD"],
    resolution:"5m",
    requestedFrom,
    requestedTo,
    safety:{ tradingEnabled:runtime.tradingEnabled, killSwitch:runtime.killSwitch },
    costModel:{
      pipSize:PIP_SIZE,
      scenarios:costScenarios,
      maxSpreadPips:MAX_SPREAD_PIPS,
      maxSpreadAsStopFraction:MAX_SPREAD_STOP_FRACTION,
      method:"net R = gross R - (spread + 2*slippagePerSide) / stopPips; gated results block trades when spread > 2 pips or spread/stop > 15%"
    },
    configs,
    byPair,
    aggregate:aggregateRows
  };

  await fs.writeFile(path.join(outputDir,"scalp-2k-cost-stress.json"), JSON.stringify(out,null,2));
  console.log("========== 2K COMPLETE ==========");
}

main().catch(error => {
  console.error(error?.message || "2K failed");
  process.exitCode = 1;
});
