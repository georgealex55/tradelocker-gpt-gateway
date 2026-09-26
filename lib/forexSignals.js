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

const DAY_MS = 24 * 60 * 60 * 1000;

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
  lookbackDays = 35
}) {
  const sizing = await fetchTradeLockerInstrumentSizing({
    tradableInstrumentId:
      instrument.tradableInstrumentId,
    tradeRouteId: instrument.tradeRouteId,
    accountCurrency: config.universe.accountCurrency,
    maxLots: config.risk.maxLots
  });

  const now = Date.now();
  const history = await fetchTradeLockerHistory({
    symbol: instrument.symbol,
    tradableInstrumentId:
      instrument.tradableInstrumentId,
    infoRouteId: instrument.infoRouteId,
    resolution: config.timeframes.entry,
    from: now - lookbackDays * DAY_MS,
    to: now,
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
    config
  });

  let latestSignal = null;

  for (const candle of history.candles) {
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
      spreadPips: quote.spreadPips
    });
  }

  const riskEstimate = estimateRisk({
    signal: latestSignal,
    sizing,
    capital: config.capital.startingBalanceUsd,
    riskPercent: config.risk.riskPercentPerTrade
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
    execution: executionStatus(riskEstimate)
  };
}

export async function scanPreferredForexSignals({
  config = FOREX_STRATEGY_V1_CONFIG
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
          config
        }))
      });
    } catch (error) {
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
    preferredSymbols:
      config.universe.preferredSymbols,
    foundSymbols:
      instruments.map(instrument => instrument.symbol),
    results
  };
}
