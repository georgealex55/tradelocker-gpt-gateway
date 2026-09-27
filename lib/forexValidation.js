import { listForexInstruments } from "./forexUniverse";
import {
  fetchTradeLockerHistory,
  fetchTradeLockerInstrumentSizing
} from "./marketData";
import { runBacktest } from "./backtest";
import { createForexStrategyV1 } from "./forexStrategyV1";
import {
  FOREX_STRATEGY_V1_CONFIG
} from "./forexStrategyV1Config";

export const VALIDATION_PERIODS = Object.freeze({
  development: {
    label: "Development",
    warmupFrom: "2025-12-15T00:00:00.000Z",
    from: "2026-01-01T00:00:00.000Z",
    to: "2026-06-30T23:59:59.999Z"
  },
  outOfSample: {
    label: "Out of sample",
    warmupFrom: "2026-06-15T00:00:00.000Z",
    from: "2026-07-01T00:00:00.000Z",
    to: "2026-09-25T21:00:00.000Z"
  }
});

const COST_ASSUMPTIONS = Object.freeze({
  spreadPips: 2,
  slippagePips: 0.2
});

function periodKey(value) {
  const raw = String(value || "").toLowerCase();
  if (raw === "development" || raw === "dev") return "development";
  if (
    raw === "outofsample" ||
    raw === "out-of-sample" ||
    raw === "oos"
  ) return "outOfSample";
  throw new Error("period must be development/dev or outOfSample/oos");
}

function findInstrument(universe, symbol) {
  const normalized = String(symbol || "").toUpperCase();
  return universe.find(row => row.symbol === normalized) || null;
}

function summarize(result) {
  const metrics = result.metrics || {};
  const skipped = result.skippedSignals || [];

  const sizingSkips = skipped.filter(
    row => row.reason === "MIN_LOT_EXCEEDS_RISK_BUDGET"
  );

  const unsupportedCurrencySkips = skipped.filter(
    row =>
      row.reason === "UNSUPPORTED_ACCOUNT_CURRENCY_CONVERSION"
  );

  return {
    trades: metrics.trades ?? 0,
    wins: metrics.wins ?? 0,
    losses: metrics.losses ?? 0,
    breakeven: metrics.breakeven ?? 0,
    winRate: metrics.winRate ?? 0,
    totalR: metrics.totalR ?? 0,
    averageR: metrics.averageR ?? 0,
    expectancyR: metrics.expectancyR ?? 0,
    profitFactor: metrics.profitFactor ?? 0,
    startingBalance: metrics.startingBalance ?? 0,
    endingBalance: metrics.endingBalance ?? 0,
    netPnl: metrics.netPnl ?? 0,
    returnPercent: metrics.returnPercent ?? 0,
    maxDrawdownPercent: metrics.maxDrawdownPercent ?? 0,
    skippedSignals: skipped.length,
    minLotRiskSkips: sizingSkips.length,
    unsupportedCurrencySkips: unsupportedCurrencySkips.length,
    guardSkips: skipped.filter(row =>
      [
        "MAX_DAILY_TRADES",
        "DAILY_LOSS_LIMIT",
        "WEEKLY_LOSS_LIMIT",
        "CONSECUTIVE_LOSS_LIMIT",
        "POST_TRADE_COOLDOWN"
      ].includes(row.reason)
    ).length
  };
}

export async function runForexValidation({
  symbol,
  period,
  config = FOREX_STRATEGY_V1_CONFIG
}) {
  const key = periodKey(period);
  const window = VALIDATION_PERIODS[key];

  const universe = await listForexInstruments();
  const instrument = findInstrument(universe, symbol);

  if (!instrument) {
    throw new Error(
      `${String(symbol).toUpperCase()} is not available as a FOREX instrument on this TradeLocker account`
    );
  }

  if (!instrument.tradeRouteId) {
    throw new Error(
      `${instrument.symbol} has no TradeLocker TRADE route`
    );
  }

  const sizing = await fetchTradeLockerInstrumentSizing({
    tradableInstrumentId: instrument.tradableInstrumentId,
    tradeRouteId: instrument.tradeRouteId,
    accountCurrency: config.universe.accountCurrency,
    maxLots: config.risk.maxLots
  });

  const marketData = await fetchTradeLockerHistory({
    symbol: instrument.symbol,
    tradableInstrumentId: instrument.tradableInstrumentId,
    infoRouteId: instrument.infoRouteId,
    resolution: config.timeframes.entry,
    from: window.warmupFrom,
    to: window.to,
    maxBars: 40000
  });

  if (marketData.candles.length < 500) {
    throw new Error(
      `Insufficient history returned for ${instrument.symbol}: ${marketData.candles.length} bars`
    );
  }

  const evaluator = createForexStrategyV1({
    symbol: instrument.symbol,
    config
  });

  const periodStart = Date.parse(window.from);

  const result = await runBacktest({
    candles: marketData.candles,
    strategy: context => {
      const decision = evaluator({
        ...context,
        spreadPips: COST_ASSUMPTIONS.spreadPips
      });

      if (Number(context.candle.time) < periodStart) {
        return {
          action: "HOLD",
          warmup: true
        };
      }

      return decision;
    },
    indicatorConfig: config.indicators.entry,
    higherTimeframe: {
      resolution: config.timeframes.regime,
      indicatorConfig: config.indicators.regime
    },
    options: {
      startingBalance: config.capital.startingBalanceUsd,
      riskPercent: config.risk.riskPercentPerTrade,
      spreadPips: COST_ASSUMPTIONS.spreadPips,
      slippagePips: COST_ASSUMPTIONS.slippagePips,
      pipSize: sizing.pipSize,
      intrabarPolicy: config.execution.intrabarPolicy,
      sizing,
      tradeGuards: {
        maxDailyTrades: config.risk.maxDailyTrades,
        maxDailyLossPercent: config.risk.maxDailyLossPercent,
        maxWeeklyLossPercent: config.risk.maxWeeklyLossPercent,
        stopAfterConsecutiveLosses:
          config.risk.stopAfterConsecutiveLosses,
        cooldownBarsAfterTrade:
          config.execution.cooldownBarsAfterTrade
      }
    }
  });

  const inPeriodTrades = result.trades.filter(
    trade => Number(trade.entryTime) >= periodStart
  );

  const warmupTradeCount =
    result.trades.length - inPeriodTrades.length;

  if (warmupTradeCount !== 0) {
    throw new Error(
      `Warm-up isolation failed: ${warmupTradeCount} pre-period trades were created`
    );
  }

  return {
    ok: true,
    symbol: instrument.symbol,
    period: {
      key,
      label: window.label,
      from: window.from,
      to: window.to,
      warmupFrom: window.warmupFrom
    },
    assumptions: {
      startingBalance: config.capital.startingBalanceUsd,
      riskPercent: config.risk.riskPercentPerTrade,
      maxLots: config.risk.maxLots,
      spreadPips: COST_ASSUMPTIONS.spreadPips,
      slippagePips: COST_ASSUMPTIONS.slippagePips,
      targetR: config.setup.targetR,
      entryTimeframe: config.timeframes.entry,
      regimeTimeframe: config.timeframes.regime
    },
    broker: {
      minLot: sizing.minLot,
      lotStep: sizing.lotStep,
      lotSize: sizing.lotSize,
      pipSize: sizing.pipSize,
      baseCurrency: sizing.baseCurrency,
      quotingCurrency: sizing.quotingCurrency
    },
    bars: {
      totalWithWarmup: marketData.returnedBars,
      first:
        marketData.candles.at(0)?.time ?? null,
      last:
        marketData.candles.at(-1)?.time ?? null
    },
    summary: summarize(result),
    trades: result.trades,
    skippedSignals: result.skippedSignals
  };
}

async function runPeriodFromPreparedData({
  instrument,
  sizing,
  candles,
  key,
  config
}) {
  const window = VALIDATION_PERIODS[key];
  const windowStart = Date.parse(window.warmupFrom);
  const windowEnd = Date.parse(window.to);
  const periodStart = Date.parse(window.from);

  const periodCandles = candles.filter(
    candle =>
      Number(candle.time) >= windowStart &&
      Number(candle.time) <= windowEnd
  );

  if (periodCandles.length < 500) {
    throw new Error(
      `Insufficient history returned for ${instrument.symbol} ${window.label}: ${periodCandles.length} bars`
    );
  }

  const evaluator = createForexStrategyV1({
    symbol: instrument.symbol,
    config
  });

  const result = await runBacktest({
    candles: periodCandles,
    strategy: context => {
      const decision = evaluator({
        ...context,
        spreadPips: COST_ASSUMPTIONS.spreadPips
      });

      if (Number(context.candle.time) < periodStart) {
        return {
          action: "HOLD",
          warmup: true
        };
      }

      return decision;
    },
    indicatorConfig: config.indicators.entry,
    higherTimeframe: {
      resolution: config.timeframes.regime,
      indicatorConfig: config.indicators.regime
    },
    options: {
      startingBalance: config.capital.startingBalanceUsd,
      riskPercent: config.risk.riskPercentPerTrade,
      spreadPips: COST_ASSUMPTIONS.spreadPips,
      slippagePips: COST_ASSUMPTIONS.slippagePips,
      pipSize: sizing.pipSize,
      intrabarPolicy: config.execution.intrabarPolicy,
      sizing,
      tradeGuards: {
        maxDailyTrades: config.risk.maxDailyTrades,
        maxDailyLossPercent: config.risk.maxDailyLossPercent,
        maxWeeklyLossPercent: config.risk.maxWeeklyLossPercent,
        stopAfterConsecutiveLosses:
          config.risk.stopAfterConsecutiveLosses,
        cooldownBarsAfterTrade:
          config.execution.cooldownBarsAfterTrade
      }
    }
  });

  const warmupTrades = result.trades.filter(
    trade => Number(trade.entryTime) < periodStart
  );

  if (warmupTrades.length) {
    throw new Error(
      `Warm-up isolation failed: ${warmupTrades.length} pre-period trades were created`
    );
  }

  return {
    ok: true,
    symbol: instrument.symbol,
    period: {
      key,
      label: window.label,
      from: window.from,
      to: window.to,
      warmupFrom: window.warmupFrom
    },
    assumptions: {
      startingBalance: config.capital.startingBalanceUsd,
      riskPercent: config.risk.riskPercentPerTrade,
      maxLots: config.risk.maxLots,
      spreadPips: COST_ASSUMPTIONS.spreadPips,
      slippagePips: COST_ASSUMPTIONS.slippagePips,
      targetR: config.setup.targetR,
      entryTimeframe: config.timeframes.entry,
      regimeTimeframe: config.timeframes.regime
    },
    broker: {
      minLot: sizing.minLot,
      lotStep: sizing.lotStep,
      lotSize: sizing.lotSize,
      pipSize: sizing.pipSize,
      baseCurrency: sizing.baseCurrency,
      quotingCurrency: sizing.quotingCurrency
    },
    bars: {
      totalWithWarmup: periodCandles.length,
      first: periodCandles.at(0)?.time ?? null,
      last: periodCandles.at(-1)?.time ?? null
    },
    summary: summarize(result),
    trades: result.trades,
    skippedSignals: result.skippedSignals
  };
}

export async function runForexValidationPair({
  symbol,
  config = FOREX_STRATEGY_V1_CONFIG,
  universe = null
}) {
  const available = universe || (await listForexInstruments());
  const instrument = findInstrument(available, symbol);

  if (!instrument) {
    throw new Error(
      `${String(symbol).toUpperCase()} is not available as a FOREX instrument on this TradeLocker account`
    );
  }

  if (!instrument.tradeRouteId) {
    throw new Error(
      `${instrument.symbol} has no TradeLocker TRADE route`
    );
  }

  const sizing = await fetchTradeLockerInstrumentSizing({
    tradableInstrumentId: instrument.tradableInstrumentId,
    tradeRouteId: instrument.tradeRouteId,
    accountCurrency: config.universe.accountCurrency,
    maxLots: config.risk.maxLots
  });

  const combined = await fetchTradeLockerHistory({
    symbol: instrument.symbol,
    tradableInstrumentId: instrument.tradableInstrumentId,
    infoRouteId: instrument.infoRouteId,
    resolution: config.timeframes.entry,
    from: VALIDATION_PERIODS.development.warmupFrom,
    to: VALIDATION_PERIODS.outOfSample.to,
    maxBars: 40000
  });

  const development = await runPeriodFromPreparedData({
    instrument,
    sizing,
    candles: combined.candles,
    key: "development",
    config
  });

  const outOfSample = await runPeriodFromPreparedData({
    instrument,
    sizing,
    candles: combined.candles,
    key: "outOfSample",
    config
  });

  return {
    symbol: instrument.symbol,
    barsDownloaded: combined.returnedBars,
    development,
    outOfSample
  };
}

export async function runForexValidationMatrix({
  config = FOREX_STRATEGY_V1_CONFIG
} = {}) {
  const universe = await listForexInstruments();
  const symbols = config.universe.preferredSymbols.filter(symbol =>
    universe.some(row => row.symbol === symbol)
  );

  const rows = [];

  for (const symbol of symbols) {
    try {
      rows.push({
        ok: true,
        ...(await runForexValidationPair({
          symbol,
          config,
          universe
        }))
      });
    } catch (error) {
      rows.push({
        ok: false,
        symbol,
        error: error.message
      });
    }
  }

  return {
    generatedAt: Date.now(),
    strategy: config.name,
    version: config.version,
    periods: VALIDATION_PERIODS,
    assumptions: {
      startingBalance: config.capital.startingBalanceUsd,
      riskPercent: config.risk.riskPercentPerTrade,
      maxLots: config.risk.maxLots,
      spreadPips: COST_ASSUMPTIONS.spreadPips,
      slippagePips: COST_ASSUMPTIONS.slippagePips,
      targetR: config.setup.targetR
    },
    symbols,
    rows
  };
}

