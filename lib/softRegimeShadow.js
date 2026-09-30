import { scanForexSignal } from "./forexSignals";
import { FOREX_STRATEGY_V1_CONFIG } from "./forexStrategyV1Config";

const M15 = 15 * 60 * 1000;

function finite(value) {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export const SOFT_REGIME_SHADOW_CONFIG = Object.freeze({
  name: "soft-h1-pullback-shadow",
  version: "1.0.0-shadow",
  symbol: "USDCHF",
  researchCapitalUsd: 500,
  maxLots: 0.01,
  riskCeilingPercent: 20,
  maxSpreadPips: 3,
  maxSpreadAsStopFraction: 0.2,
  slippagePipsPerSide: 0.2,
  targetR: 1.8,
  pullbackLookbackBars: 6,
  rsiMidline: 50
});

const SCAN_CONFIG = Object.freeze({
  ...FOREX_STRATEGY_V1_CONFIG,
  name: SOFT_REGIME_SHADOW_CONFIG.name,
  version: SOFT_REGIME_SHADOW_CONFIG.version,
  capital: {
    ...FOREX_STRATEGY_V1_CONFIG.capital,
    startingBalanceUsd: SOFT_REGIME_SHADOW_CONFIG.researchCapitalUsd
  },
  universe: {
    ...FOREX_STRATEGY_V1_CONFIG.universe,
    preferredSymbols: [SOFT_REGIME_SHADOW_CONFIG.symbol],
    maxOpenPositions: 1
  },
  session: {
    ...FOREX_STRATEGY_V1_CONFIG.session,
    entryStartUtcHour: 0,
    entryEndUtcHour: 24,
    avoidWeekendEntries: true
  },
  risk: {
    ...FOREX_STRATEGY_V1_CONFIG.risk,
    riskPercentPerTrade: SOFT_REGIME_SHADOW_CONFIG.riskCeilingPercent,
    maxLots: SOFT_REGIME_SHADOW_CONFIG.maxLots
  },
  setup: {
    ...FOREX_STRATEGY_V1_CONFIG.setup,
    softPullbackLookbackBars:
      SOFT_REGIME_SHADOW_CONFIG.pullbackLookbackBars,
    softRsiMidline:
      SOFT_REGIME_SHADOW_CONFIG.rsiMidline,
    targetR: SOFT_REGIME_SHADOW_CONFIG.targetR
  }
});

function fixedResearchRisk({
  entry,
  stop,
  sizing,
  spreadPips
}) {
  if (!(entry > 0) || !(stop > 0)) return null;

  const lots = Math.min(
    Number(sizing?.minLot),
    SOFT_REGIME_SHADOW_CONFIG.maxLots
  );
  const lotSize = Number(sizing?.lotSize);
  const pipSize = Number(sizing?.pipSize);

  if (!(lots > 0) || !(lotSize > 0) || !(pipSize > 0)) return null;

  const units = lots * lotSize;
  const stopDistance = Math.abs(entry - stop);
  const costPips =
    Math.max(0, Number(spreadPips) || 0) +
    2 * SOFT_REGIME_SHADOW_CONFIG.slippagePipsPerSide;
  const costPrice = costPips * pipSize;
  const quoteRisk = units * (stopDistance + costPrice);

  let minLotRisk = null;

  if (sizing.accountCurrency === sizing.quotingCurrency) {
    minLotRisk = quoteRisk;
  } else if (sizing.accountCurrency === sizing.baseCurrency) {
    minLotRisk = quoteRisk / entry;
  }

  if (minLotRisk == null) return null;

  const capital = SOFT_REGIME_SHADOW_CONFIG.researchCapitalUsd;
  const minLotRiskPercent = (minLotRisk / capital) * 100;
  const riskBudget =
    capital *
    (SOFT_REGIME_SHADOW_CONFIG.riskCeilingPercent / 100);

  return {
    capital,
    riskPercent: minLotRiskPercent,
    riskCeilingPercent:
      SOFT_REGIME_SHADOW_CONFIG.riskCeilingPercent,
    riskBudget,
    minLot: lots,
    units,
    modeledCostPips: costPips,
    minLotRisk,
    minLotRiskPercent,
    tradeableWithinBudget:
      minLotRisk <= riskBudget + 1e-9
  };
}

export async function scanSoftRegimeShadow({
  instrument,
  asOf = Date.now(),
  scheduledBlackouts = []
} = {}) {
  if (!instrument) throw new Error("instrument is required");

  if (
    String(instrument.symbol || "").toUpperCase() !==
    SOFT_REGIME_SHADOW_CONFIG.symbol
  ) {
    throw new Error("SOFT_REGIME_SHADOW_USDCHF_ONLY");
  }

  const raw = await scanForexSignal({
    instrument,
    config: SCAN_CONFIG,
    asOf,
    scheduledBlackouts,
    persistObservation: false
  });

  const base = raw.signal || {};
  const regime = base.regime || {};
  const soft = base.softRegimeSetup || {};
  const signalTime = Number(base.time);
  const expectedEntryTime =
    Number.isFinite(signalTime) ? signalTime + M15 : null;
  const currentM15Open =
    Math.floor(Number(asOf) / M15) * M15;
  const freshForEntry =
    expectedEntryTime != null &&
    currentM15Open === expectedEntryTime;

  const blocks = [...new Set(base.blocks || [])];
  const side =
    soft.eligible && ["LONG", "SHORT"].includes(soft.direction)
      ? soft.direction
      : null;

  const referenceEntry = finite(base.referenceEntry);
  const stopLoss = finite(soft.stopLoss);
  const takeProfit = finite(soft.takeProfit);
  const pipSize = finite(raw.sizing?.pipSize);
  const spreadPips = finite(raw.quote?.spreadPips);

  let stopPips = null;
  let spreadAsStopFraction = null;
  let riskEstimate = null;

  if (soft.ready) {
    if (!freshForEntry) blocks.push("STALE_ENTRY_WINDOW");

    if (
      Number.isFinite(spreadPips) &&
      spreadPips > SOFT_REGIME_SHADOW_CONFIG.maxSpreadPips
    ) {
      blocks.push("SPREAD_ABSOLUTE_SOFT_REGIME");
    }

    if (
      referenceEntry > 0 &&
      stopLoss > 0 &&
      pipSize > 0
    ) {
      stopPips = Math.abs(referenceEntry - stopLoss) / pipSize;

      if (Number.isFinite(spreadPips) && stopPips > 0) {
        spreadAsStopFraction = spreadPips / stopPips;

        if (
          spreadAsStopFraction >
          SOFT_REGIME_SHADOW_CONFIG.maxSpreadAsStopFraction
        ) {
          blocks.push("SPREAD_TO_STOP");
        }
      }

      riskEstimate = fixedResearchRisk({
        entry: referenceEntry,
        stop: stopLoss,
        sizing: raw.sizing,
        spreadPips
      });

      if (
        riskEstimate &&
        riskEstimate.tradeableWithinBudget === false
      ) {
        blocks.push("MIN_LOT_EXCEEDS_20_PERCENT_RESEARCH_CEILING");
      }
    } else {
      blocks.push("INVALID_SHADOW_STOP");
    }
  }

  const uniqueBlocks = [...new Set(blocks)];

  let status = "WATCHING";

  if (uniqueBlocks.length) {
    status = "BLOCKED";
  } else if (soft.ready && side) {
    status = "SIGNAL_READY";
  } else if (soft.eligible && soft.countertrendPullback) {
    status = "SETUP_FORMING";
  }

  const action =
    status === "SIGNAL_READY"
      ? side === "LONG"
        ? "BUY"
        : "SELL"
      : "HOLD";

  const signal = {
    strategy: SOFT_REGIME_SHADOW_CONFIG.name,
    version: SOFT_REGIME_SHADOW_CONFIG.version,
    symbol: instrument.symbol,
    time: signalTime,
    timeframe: "15m",
    regimeTimeframe: "1H",
    status,
    action,
    side,
    referenceEntry,
    stopLoss,
    takeProfit,
    targetR: SOFT_REGIME_SHADOW_CONFIG.targetR,
    expectedEntryTime,
    freshForEntry,
    spreadPips,
    stopPips,
    spreadAsStopFraction,
    regime,
    softRegimeSetup: soft,
    candidateStage: soft.stage || "NOT_SOFT_REGIME",
    indicators: base.indicators || null,
    blocks: uniqueBlocks,
    checks: {
      readOnly: true,
      shadowOnly: true,
      researchCapitalUsd:
        SOFT_REGIME_SHADOW_CONFIG.researchCapitalUsd,
      riskCeilingPercent:
        SOFT_REGIME_SHADOW_CONFIG.riskCeilingPercent,
      maxLots: SOFT_REGIME_SHADOW_CONFIG.maxLots,
      maxSpreadPips:
        SOFT_REGIME_SHADOW_CONFIG.maxSpreadPips,
      maxSpreadAsStopFraction:
        SOFT_REGIME_SHADOW_CONFIG.maxSpreadAsStopFraction,
      pullbackLookbackBars:
        SOFT_REGIME_SHADOW_CONFIG.pullbackLookbackBars,
      rsiMidline:
        SOFT_REGIME_SHADOW_CONFIG.rsiMidline
    }
  };

  return {
    strategy: SOFT_REGIME_SHADOW_CONFIG.name,
    version: SOFT_REGIME_SHADOW_CONFIG.version,
    completedThrough: raw.completedThrough,
    latestBar: raw.latestBar,
    instrument: raw.instrument,
    sizing: raw.sizing,
    quote: raw.quote,
    signal,
    riskEstimate,
    execution: {
      status: "SHADOW_ONLY",
      reason: "READ_ONLY_SHADOW"
    }
  };
}
