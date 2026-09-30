import { fetchTradeLockerHistory, fetchTradeLockerInstrumentSizing } from "./marketData";
import { normalizeQuote } from "./risk";
import { tlFetch } from "./tradelocker";
import { StrategyEngine, defaultScalpConfig } from "./scalpStrategyCore.mjs";

const M5 = 5 * 60 * 1000;
const MINUTE = 60 * 1000;
const DAY = 24 * 60 * 60 * 1000;

export const SCALP_SHADOW_CONFIG = Object.freeze({
  name: "structure-scalp-shadow",
  version: "2L.0-shadow",
  symbols: ["USDCHF","EURUSD","GBPUSD"],
  strategy: defaultScalpConfig({
    id: "d1-1.00__fvg010__fixed2__h1-nonOpposite",
    d1Range: 1.00,
    stopModel: "fvg010",
    targetModel: "fixed2",
    h1Mode: "nonOpposite"
  }),
  lookbackDays: 60,
  maxSpreadPips: 2.0,
  maxSpreadAsStopFraction: 0.15,
  maxMarketDataAgeMs: 3 * MINUTE,
  slippagePipsPerSide: 0.2
});

function stageName(engine) {
  if (engine.position) return "VIRTUAL_POSITION";
  if (!engine.setupState) return "WATCHING";
  const map = {
    WAIT_CH: "WAITING_CH",
    WAIT_PULLBACK: "WAITING_PULLBACK",
    WAIT_BOS: "WAITING_BOS",
    WAIT_DISP2: "WAITING_D2",
    WAIT_FVG: "WAITING_FVG",
    WAIT_RETEST: "WAITING_FVG_RETEST"
  };
  return map[engine.setupState] || engine.setupState;
}

async function quoteFor(instrument, pipSize) {
  const raw = await tlFetch(
    "/trade/quotes?routeId=" + instrument.infoRouteId +
    "&tradableInstrumentId=" + instrument.tradableInstrumentId
  );
  const q = normalizeQuote(raw);
  return {
    ...q,
    spreadPips:
      q.spread != null && pipSize > 0
        ? q.spread / pipSize
        : null
  };
}

async function marketFreshness(instrument, asOf) {
  try {
    const history = await fetchTradeLockerHistory({
      symbol: instrument.symbol,
      tradableInstrumentId: instrument.tradableInstrumentId,
      infoRouteId: instrument.infoRouteId,
      resolution: "1m",
      from: asOf - 15 * MINUTE,
      to: asOf,
      maxBars: 50
    });
    const latest = history.candles.at(-1)?.time ?? null;
    return {
      latestMarketDataTime: latest,
      marketDataAgeMs: latest == null ? null : Math.max(0, asOf - latest),
      stale:
        latest == null ||
        asOf - latest > SCALP_SHADOW_CONFIG.maxMarketDataAgeMs
    };
  } catch {
    return {
      latestMarketDataTime: null,
      marketDataAgeMs: null,
      stale: true
    };
  }
}

function geometry(engine, atr, pipSize) {
  const p = engine.position;

  if (p) {
    const stopPips = p.risk / pipSize;
    return {
      virtualPosition: true,
      side: p.side,
      entry: p.entry,
      stopLoss: p.stop,
      takeProfit: p.target,
      targetR: p.targetR,
      structureAvailableR: p.structureAvailableR,
      stopPips,
      entryTime: p.entryTime
    };
  }

  if (engine.setupState !== "WAIT_RETEST" || !(engine.fvgMid > 0)) {
    return {
      virtualPosition: false,
      side: engine.setupSide || null,
      entry: null,
      stopLoss: null,
      takeProfit: null,
      targetR: null,
      structureAvailableR: null,
      stopPips: null,
      entryTime: null
    };
  }

  const entry = engine.fvgMid;
  const stopLoss =
    engine.setupSide === "BULL"
      ? engine.fvgLower - 0.10 * atr
      : engine.fvgUpper + 0.10 * atr;

  const risk =
    engine.setupSide === "BULL"
      ? entry - stopLoss
      : stopLoss - entry;

  const structureReward =
    engine.setupSide === "BULL"
      ? engine.postDispExtreme - entry
      : entry - engine.postDispExtreme;

  const structureAvailableR =
    risk > 0 && structureReward > 0
      ? structureReward / risk
      : null;

  const takeProfit =
    risk > 0
      ? engine.setupSide === "BULL"
        ? entry + 2 * risk
        : entry - 2 * risk
      : null;

  return {
    virtualPosition: false,
    side: engine.setupSide || null,
    entry,
    stopLoss,
    takeProfit,
    targetR: 2,
    structureAvailableR,
    stopPips: risk > 0 ? risk / pipSize : null,
    entryTime: null
  };
}

export async function scanScalpShadow({ instrument, asOf = Date.now() } = {}) {
  if (!instrument) throw new Error("instrument is required");

  const completedThrough = Math.floor(asOf / M5) * M5 - 1;
  const sizing = await fetchTradeLockerInstrumentSizing({
    tradableInstrumentId: instrument.tradableInstrumentId,
    tradeRouteId: instrument.tradeRouteId,
    accountCurrency: "USD",
    maxLots: 0.01
  });

  const history = await fetchTradeLockerHistory({
    symbol: instrument.symbol,
    tradableInstrumentId: instrument.tradableInstrumentId,
    infoRouteId: instrument.infoRouteId,
    resolution: "5m",
    from: completedThrough - SCALP_SHADOW_CONFIG.lookbackDays * DAY,
    to: completedThrough,
    maxBars: 50000
  });

  const engine = new StrategyEngine(
    instrument.symbol,
    history.candles[0]?.time ?? completedThrough,
    SCALP_SHADOW_CONFIG.strategy
  );

  for (const candle of history.candles) {
    engine.onBar(candle);
  }

  const [quote, freshness] = await Promise.all([
    quoteFor(instrument, sizing.pipSize),
    marketFreshness(instrument, asOf)
  ]);

  const atr = engine.atr14;
  const g = geometry(engine, atr, sizing.pipSize);
  const spreadAsStopFraction =
    Number.isFinite(quote.spreadPips) &&
    Number.isFinite(g.stopPips) &&
    g.stopPips > 0
      ? quote.spreadPips / g.stopPips
      : null;

  const blocks = [];
  if (freshness.stale) blocks.push("STALE_MARKET_DATA");
  if (
    Number.isFinite(quote.spreadPips) &&
    quote.spreadPips > SCALP_SHADOW_CONFIG.maxSpreadPips
  ) {
    blocks.push("SPREAD_PIPS");
  }
  if (
    Number.isFinite(spreadAsStopFraction) &&
    spreadAsStopFraction > SCALP_SHADOW_CONFIG.maxSpreadAsStopFraction
  ) {
    blocks.push("SPREAD_TO_STOP");
  }
  if (
    Number.isFinite(g.structureAvailableR) &&
    g.structureAvailableR < 2
  ) {
    blocks.push("STRUCTURE_BELOW_2R");
  }

  const stage = stageName(engine);
  const status =
    stage === "VIRTUAL_POSITION"
      ? "ACTIVE_VIRTUAL_TRADE"
      : stage === "WATCHING"
      ? "WATCHING"
      : "SETUP_FORMING";

  const action =
    stage === "VIRTUAL_POSITION"
      ? "MONITOR_VIRTUAL_TRADE"
      : stage === "WAITING_FVG_RETEST"
      ? "WATCH_RETEST"
      : "HOLD";

  const signalTime =
    history.candles.at(-1)?.time ?? completedThrough;
  const latestCompletedBarTime =
    Math.floor(completedThrough / M5) * M5;
  const freshForDryRun =
    g.virtualPosition === true &&
    Number.isFinite(g.entryTime) &&
    g.entryTime >= latestCompletedBarTime;

  const signal = {
    strategy: SCALP_SHADOW_CONFIG.name,
    version: SCALP_SHADOW_CONFIG.version,
    symbol: instrument.symbol,
    time: signalTime,
    status,
    action,
    side: g.side,
    candidateStage: stage,
    referenceEntry: g.entry,
    stopLoss: g.stopLoss,
    takeProfit: g.takeProfit,
    targetR: g.targetR,
    spreadPips: quote.spreadPips,
    regime: { bias: engine.h1Bias },
    checks: {
      readOnly: true,
      brokerOrdersDisabled: true,
      h1Mode: SCALP_SHADOW_CONFIG.strategy.h1Mode,
      stopModel: SCALP_SHADOW_CONFIG.strategy.stopModel,
      targetModel: SCALP_SHADOW_CONFIG.strategy.targetModel,
      maxSpreadPips: SCALP_SHADOW_CONFIG.maxSpreadPips,
      maxSpreadAsStopFraction:
        SCALP_SHADOW_CONFIG.maxSpreadAsStopFraction,
      slippagePipsPerSide:
        SCALP_SHADOW_CONFIG.slippagePipsPerSide,
      marketDataAgeMs: freshness.marketDataAgeMs
    },
    blocks,
    h1Bias: engine.h1Bias,
    structureAvailableR: g.structureAvailableR,
    stopPips: g.stopPips,
    spreadAsStopFraction,
    virtualPosition: g.virtualPosition,
    entryTime: g.entryTime,
    freshForDryRun
  };

  return {
    strategy: SCALP_SHADOW_CONFIG.name,
    version: SCALP_SHADOW_CONFIG.version,
    symbol: instrument.symbol,
    completedThrough,
    historyBars: history.candles.length,
    signal,
    quote,
    freshness,
    sizing,
    execution: {
      status: "SHADOW_ONLY",
      reason: "READ_ONLY_NO_BROKER_ORDER",
      brokerOrderSubmitted: false
    }
  };
}
