import { createIndicatorEngine } from "./indicators";
import {
  fetchTradeLockerHistory,
  fetchTradeLockerInstrumentSizing
} from "./marketData";
import { listForexInstruments } from "./forexUniverse";
import {
  createCompletedTimeframeAggregator
} from "./timeframes";
import { createForexStrategyV1 } from "./forexStrategyV1";
import {
  FOREX_STRATEGY_V1_CONFIG
} from "./forexStrategyV1Config";
import { normalizeQuote } from "./risk";
import { tlFetch } from "./tradelocker";
import { killSwitchEnabled } from "./tradeGuard";
import { recordSignalObservation } from "./db";

const DAY_MS = 24 * 60 * 60 * 1000;

const RESOLUTION_MS = Object.freeze({
  "1m": 60 * 1000,
  "5m": 5 * 60 * 1000,
  "15m": 15 * 60 * 1000,
  "30m": 30 * 60 * 1000,
  "1H": 60 * 60 * 1000,
  "4H": 4 * 60 * 60 * 1000,
  "1D": 24 * 60 * 60 * 1000
});

function completedEntryCutoff(asOf, resolution) {
  const now = Number(asOf);
  const step = RESOLUTION_MS[resolution];

  if (!Number.isFinite(now) || !(step > 0)) {
    throw new Error("Unable to calculate completed entry-candle cutoff");
  }

  const currentBoundary = Math.floor(now / step) * step;
  return currentBoundary - 1;
}

function preferred(instruments, config) {
  const bySymbol = new Map(
    instruments.map(instrument => [
      instrument.symbol,
      instrument
    ])
  );

  return config.universe.preferredSymbols
    .map(symbol => bySymbol.get(symbol))
    .filter(Boolean);
}

function estimateRisk({ signal, sizing, capital, riskPercent }) {
  if (
    !signal ||
    signal.status !== "SIGNAL_READY" ||
    !(Number(signal.referenceEntry) > 0) ||
    !(Number(signal.stopLoss) > 0)
  ) {
    return null;
  }

  const entry = Number(signal.referenceEntry);
  const stop = Number(signal.stopLoss);
  const distance = Math.abs(entry - stop);
  const lots = Number(sizing.minLot);
  const units = lots * Number(sizing.lotSize);
  const quoteRisk = units * distance;

  let minLotRisk = null;

  if (sizing.accountCurrency === sizing.quotingCurrency) {
    minLotRisk = quoteRisk;
  } else if (sizing.accountCurrency === sizing.baseCurrency) {
    minLotRisk = quoteRisk / entry;
  }

  const riskBudget =
    Number(capital) * (Number(riskPercent) / 100);

  return {
    capital: Number(capital),
    riskPercent: Number(riskPercent),
    riskBudget,
    minLot: lots,
    units,
    minLotRisk,
    minLotRiskPercent:
      minLotRisk != null && Number(capital) > 0
        ? (minLotRisk / Number(capital)) * 100
        : null,
    tradeableWithinBudget:
      minLotRisk != null
        ? minLotRisk <= riskBudget + 1e-9
        : false
  };
}

function executionStatus(riskEstimate) {
  if (killSwitchEnabled()) {
    return {
      status: "BLOCKED",
      reason: "KILL_SWITCH"
    };
  }

  if (String(process.env.TRADING_ENABLED).toLowerCase() !== "true") {
    return {
      status: "DRY_RUN",
      reason: "TRADING_DISABLED"
    };
  }

  if (
    riskEstimate &&
    riskEstimate.tradeableWithinBudget === false
  ) {
    return {
      status: "BLOCKED",
      reason: "MIN_LOT_EXCEEDS_RISK_BUDGET"
    };
  }

  return {
    status: "ARMED",
    reason: null
  };
}

async function quoteFor(instrument, pipSize) {
  const raw = await tlFetch(
    `/trade/quotes?routeId=${instrument.infoRouteId}` +
    `&tradableInstrumentId=${instrument.tradableInstrumentId}`
  );

  const quote = normalizeQuote(raw);
  const spreadPips =
    quote.spread != null && pipSize > 0
      ? quote.spread / pipSize
      : null;

  return {
    ...quote,
    spreadPips
  };
}

export async function scanForexSignal({
  instrument,
  config = FOREX_STRATEGY_V1_CONFIG,
  lookbackDays = 35,
  asOf = Date.now(),
  scheduledBlackouts = []
}) {
  const sizing = await fetchTradeLockerInstrumentSizing({
    tradableInstrumentId:
      instrument.tradableInstrumentId,
    tradeRouteId: instrument.tradeRouteId,
    accountCurrency: config.universe.accountCurrency,
    maxLots: config.risk.maxLots
  });

  const historyTo = completedEntryCutoff(
    asOf,
    config.timeframes.entry
  );

  const history = await fetchTradeLockerHistory({
    symbol: instrument.symbol,
    tradableInstrumentId:
      instrument.tradableInstrumentId,
    infoRouteId: instrument.infoRouteId,
    resolution: config.timeframes.entry,
    from: historyTo - lookbackDays * DAY_MS,
    to: historyTo,
    maxBars: 10000
  });

  const quote = await quoteFor(instrument, sizing.pipSize);

  const entryIndicators = createIndicatorEngine(
    config.indicators.entry
  );

  const htfAggregator =
    createCompletedTimeframeAggregator(
      config.timeframes.regime
    );

  const regimeIndicators = createIndicatorEngine(
    config.indicators.regime
  );

  let regimeSnapshot = regimeIndicators.snapshot();
  let lastCompletedRegimeCandle = null;

  const evaluate = createForexStrategyV1({
    symbol: instrument.symbol,
    config,
    scheduledBlackouts
  });

  let latestSignal = null;
  const finalIndex = history.candles.length - 1;

  for (let index = 0; index < history.candles.length; index += 1) {
    const candle = history.candles[index];
    const entrySnapshot = entryIndicators.update(candle);

    const completed = htfAggregator.add(candle);
    if (completed) {
      lastCompletedRegimeCandle = completed;
      regimeSnapshot = regimeIndicators.update(completed);
    }

    latestSignal = evaluate({
      candle,
      indicators: entrySnapshot,
      higherTimeframe: {
        resolution: config.timeframes.regime,
        candle: lastCompletedRegimeCandle,
        indicators: regimeSnapshot
      },
      // Historical replay must not inherit the current live spread. Only the
      // newest candle receives the live quote so shock/cooldown state is not
      // contaminated by today's spread across prior bars.
      spreadPips:
        index === finalIndex ? quote.spreadPips : null
    });
  }

  if (
    latestSignal?.status === "SIGNAL_READY" &&
    Number.isFinite(Number(quote.spreadPips)) &&
    Number(sizing.pipSize) > 0 &&
    Number(latestSignal.referenceEntry) > 0 &&
    Number(latestSignal.stopLoss) > 0
  ) {
    const stopPips =
      Math.abs(
        Number(latestSignal.referenceEntry) -
        Number(latestSignal.stopLoss)
      ) / Number(sizing.pipSize);

    const spreadAsStopFraction =
      stopPips > 0
        ? Number(quote.spreadPips) / stopPips
        : null;

    latestSignal = {
      ...latestSignal,
      stopPips,
      spreadAsStopFraction
    };

    if (
      spreadAsStopFraction != null &&
      spreadAsStopFraction >
        Number(config.execution.maxSpreadAsStopFraction)
    ) {
      latestSignal = {
        ...latestSignal,
        status: "BLOCKED",
        action: "HOLD",
        blocks: [
          ...(latestSignal.blocks || []),
          "SPREAD_TO_STOP"
        ]
      };
    }
  }

  const riskEstimate = estimateRisk({
    signal: latestSignal,
    sizing,
    capital: config.capital.startingBalanceUsd,
    riskPercent: config.risk.riskPercentPerTrade
  });

  const execution = executionStatus(riskEstimate);

  await recordSignalObservation({
    signal: latestSignal,
    riskEstimate,
    execution
  });

  return {
    instrument,
    sizing,
    quote,
    bars: history.returnedBars,
    latestBar:
      history.candles.at(-1) || null,
    signal: latestSignal,
    riskEstimate,
    execution,
    asOf: Number(asOf),
    completedThrough: historyTo
  };
}

export async function scanPreferredForexSignals({
  config = FOREX_STRATEGY_V1_CONFIG,
  asOf = Date.now()
} = {}) {
  const universe = await listForexInstruments();
  const instruments = preferred(universe, config);

  const results = [];

  for (const instrument of instruments) {
    try {
      results.push({
        ok: true,
        ...(await scanForexSignal({
          instrument,
          config,
          asOf
        }))
      });
    } catch (error) {
      console.error("[forex-scan] scan failed", {
        symbol: instrument?.symbol || null,
        message: error.message
      });

      results.push({
        ok: false,
        instrument,
        error: error.message
      });
    }
  }

  return {
    strategy: config.name,
    version: config.version,
    generatedAt: Date.now(),
    asOf: Number(asOf),
    preferredSymbols:
      config.universe.preferredSymbols,
    foundSymbols:
      instruments.map(instrument => instrument.symbol),
    results
  };
}
