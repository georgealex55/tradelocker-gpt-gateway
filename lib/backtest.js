import {
  createIndicatorEngine,
  normalizeCandle
} from "./indicators";
import { createCompletedTimeframeAggregator } from "./timeframes";

const DECISIONS = new Set(["BUY", "SELL", "HOLD"]);

function finiteOrNull(value) {
  if (value == null) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function clampPercent(value, fallback) {
  const number = Number(value ?? fallback);
  if (!Number.isFinite(number) || number <= 0 || number > 100) {
    throw new Error("riskPercent must be > 0 and <= 100");
  }
  return number;
}

function normalizeDecision(raw) {
  if (raw == null) return { action: "HOLD" };

  if (typeof raw === "string") {
    const action = raw.toUpperCase();
    if (!DECISIONS.has(action)) {
      throw new Error(`Unknown strategy action: ${raw}`);
    }
    return { action };
  }

  if (typeof raw !== "object") {
    throw new Error("Strategy decision must be BUY, SELL, HOLD, or an object");
  }

  const action = String(raw.action || raw.decision || "HOLD").toUpperCase();

  if (!DECISIONS.has(action)) {
    throw new Error(`Unknown strategy action: ${action}`);
  }

  return {
    ...raw,
    action
  };
}

function maxDrawdownPercent(equityCurve) {
  let peak = -Infinity;
  let maxDrawdown = 0;

  for (const point of equityCurve) {
    const equity = Number(point.equity);
    if (!Number.isFinite(equity)) continue;

    peak = Math.max(peak, equity);

    if (peak > 0) {
      const drawdown = ((peak - equity) / peak) * 100;
      maxDrawdown = Math.max(maxDrawdown, drawdown);
    }
  }

  return maxDrawdown;
}

function summarizeTrades(trades, startingBalance, endingBalance, equityCurve) {
  const wins = trades.filter(trade => trade.rMultiple > 0);
  const losses = trades.filter(trade => trade.rMultiple < 0);
  const breakeven = trades.filter(trade => trade.rMultiple === 0);

  const totalR = trades.reduce((sum, trade) => sum + trade.rMultiple, 0);
  const grossWinR = wins.reduce((sum, trade) => sum + trade.rMultiple, 0);
  const grossLossR = Math.abs(
    losses.reduce((sum, trade) => sum + trade.rMultiple, 0)
  );

  return {
    trades: trades.length,
    wins: wins.length,
    losses: losses.length,
    breakeven: breakeven.length,
    winRate:
      trades.length > 0 ? (wins.length / trades.length) * 100 : 0,
    totalR,
    averageR:
      trades.length > 0 ? totalR / trades.length : 0,
    averageWinR:
      wins.length > 0 ? grossWinR / wins.length : 0,
    averageLossR:
      losses.length > 0
        ? losses.reduce((sum, trade) => sum + trade.rMultiple, 0) /
          losses.length
        : 0,
    expectancyR:
      trades.length > 0 ? totalR / trades.length : 0,
    profitFactor:
      grossLossR > 0
        ? grossWinR / grossLossR
        : grossWinR > 0
        ? Infinity
        : 0,
    startingBalance,
    endingBalance,
    netPnl: endingBalance - startingBalance,
    returnPercent:
      startingBalance > 0
        ? ((endingBalance - startingBalance) / startingBalance) * 100
        : 0,
    maxDrawdownPercent: maxDrawdownPercent(equityCurve)
  };
}

function costInPrice(options) {
  const pipSize = Number(options.pipSize ?? 0.0001);
  const spreadPips = Math.max(0, Number(options.spreadPips ?? 0));
  const slippagePips = Math.max(0, Number(options.slippagePips ?? 0));

  if (!Number.isFinite(pipSize) || pipSize <= 0) {
    throw new Error("pipSize must be a positive number");
  }

  if (!Number.isFinite(spreadPips) || !Number.isFinite(slippagePips)) {
    throw new Error("spreadPips and slippagePips must be finite numbers");
  }

  return (spreadPips + slippagePips * 2) * pipSize;
}

function floorToStep(value, step) {
  if (!(step > 0)) return value;
  return Math.floor((value + 1e-12) / step) * step;
}

function normalizeSizing(raw) {
  if (!raw) return null;

  const lotSize = Number(raw.lotSize);
  const minLot = Number(raw.minLot);
  const lotStep = Number(raw.lotStep);
  const maxLot = Number(raw.maxLot);
  const maxLots = Number(raw.maxLots ?? raw.maxLot);

  if (!(lotSize > 0)) throw new Error("sizing.lotSize must be positive");
  if (!(minLot > 0)) throw new Error("sizing.minLot must be positive");
  if (!(lotStep > 0)) throw new Error("sizing.lotStep must be positive");
  if (!(maxLot > 0)) throw new Error("sizing.maxLot must be positive");
  if (!(maxLots > 0)) throw new Error("sizing.maxLots must be positive");

  return {
    accountCurrency: String(raw.accountCurrency || "USD").toUpperCase(),
    baseCurrency: String(raw.baseCurrency || "").toUpperCase(),
    quotingCurrency: String(raw.quotingCurrency || "").toUpperCase(),
    lotSize,
    minLot,
    lotStep,
    maxLot,
    maxLots: Math.min(maxLots, maxLot)
  };
}

function accountRiskPerLot({ sizing, entryPrice, stopLoss }) {
  const quoteRisk =
    sizing.lotSize * Math.abs(entryPrice - stopLoss);

  if (sizing.accountCurrency === sizing.quotingCurrency) {
    return quoteRisk;
  }

  if (sizing.accountCurrency === sizing.baseCurrency) {
    return quoteRisk / entryPrice;
  }

  return null;
}

function validateEntryDecision(decision, entryPrice) {
  const stopLoss = finiteOrNull(decision.stopLoss);
  const takeProfit = finiteOrNull(decision.takeProfit);

  if (decision.action === "HOLD") {
    return null;
  }

  if (!(entryPrice > 0)) {
    throw new Error("Entry price must be positive");
  }

  if (!(stopLoss > 0)) {
    throw new Error("Backtest entry requires stopLoss");
  }

  if (!(takeProfit > 0)) {
    throw new Error("Backtest entry requires takeProfit");
  }

  const isBuy = decision.action === "BUY";

  if (isBuy && !(stopLoss < entryPrice && takeProfit > entryPrice)) {
    throw new Error(
      "BUY requires stopLoss below entry and takeProfit above entry"
    );
  }

  if (!isBuy && !(stopLoss > entryPrice && takeProfit < entryPrice)) {
    throw new Error(
      "SELL requires stopLoss above entry and takeProfit below entry"
    );
  }

  return {
    stopLoss,
    takeProfit
  };
}

function createPosition({
  decision,
  entryPrice,
  entryIndex,
  entryCandle,
  equity,
  riskPercent,
  sizing
}) {
  const levels = validateEntryDecision(decision, entryPrice);
  if (!levels) return { position: null, skip: null };

  const initialRiskDistance = Math.abs(entryPrice - levels.stopLoss);

  if (!(initialRiskDistance > 0)) {
    throw new Error("Stop distance must be positive");
  }

  const targetRiskAmount = equity * (riskPercent / 100);

  let lots = null;
  let units = null;
  let riskAmount = targetRiskAmount;
  let actualRiskPercent = riskPercent;

  if (sizing) {
    const riskPerLot = accountRiskPerLot({
      sizing,
      entryPrice,
      stopLoss: levels.stopLoss
    });

    if (!(riskPerLot > 0)) {
      return {
        position: null,
        skip: {
          reason: "UNSUPPORTED_ACCOUNT_CURRENCY_CONVERSION",
          targetRiskAmount,
          accountCurrency: sizing.accountCurrency,
          baseCurrency: sizing.baseCurrency,
          quotingCurrency: sizing.quotingCurrency
        }
      };
    }

    const desiredLots = targetRiskAmount / riskPerLot;
    const cappedLots = Math.min(desiredLots, sizing.maxLots);
    lots = floorToStep(cappedLots, sizing.lotStep);

    if (lots + 1e-12 < sizing.minLot) {
      const minLotRisk = riskPerLot * sizing.minLot;
      return {
        position: null,
        skip: {
          reason: "MIN_LOT_EXCEEDS_RISK_BUDGET",
          targetRiskAmount,
          desiredLots,
          minLot: sizing.minLot,
          minLotRisk,
          minLotRiskPercent:
            equity > 0 ? (minLotRisk / equity) * 100 : null
        }
      };
    }

    lots = Number(lots.toFixed(8));
    units = Math.round(lots * sizing.lotSize);
    riskAmount = riskPerLot * lots;
    actualRiskPercent =
      equity > 0 ? (riskAmount / equity) * 100 : 0;
  }

  return {
    position: {
      side: decision.action,
      entryPrice,
      stopLoss: levels.stopLoss,
      takeProfit: levels.takeProfit,
      initialRiskDistance,
      riskAmount,
      targetRiskAmount,
      riskPercent: actualRiskPercent,
      lots,
      units,
      entryIndex,
      entryTime: entryCandle.time,
      signal: decision
    },
    skip: null
  };
}

function exitTrigger(position, candle, intrabarPolicy) {
  const isBuy = position.side === "BUY";

  const stopHit = isBuy
    ? candle.low <= position.stopLoss
    : candle.high >= position.stopLoss;

  const targetHit = isBuy
    ? candle.high >= position.takeProfit
    : candle.low <= position.takeProfit;

  if (stopHit && targetHit) {
    if (intrabarPolicy === "target-first") {
      return {
        price: position.takeProfit,
        reason: "TAKE_PROFIT"
      };
    }

    return {
      price: position.stopLoss,
      reason: "STOP_LOSS"
    };
  }

  if (stopHit) {
    return {
      price: position.stopLoss,
      reason: "STOP_LOSS"
    };
  }

  if (targetHit) {
    return {
      price: position.takeProfit,
      reason: "TAKE_PROFIT"
    };
  }

  return null;
}

function closePosition({
  position,
  rawExitPrice,
  exitIndex,
  exitCandle,
  reason,
  roundTripCost,
  equity
}) {
  const directionalMove =
    position.side === "BUY"
      ? rawExitPrice - position.entryPrice
      : position.entryPrice - rawExitPrice;

  const netMove = directionalMove - roundTripCost;
  const rMultiple = netMove / position.initialRiskDistance;
  const pnl = position.riskAmount * rMultiple;
  const endingEquity = equity + pnl;

  return {
    trade: {
      side: position.side,
      entryIndex: position.entryIndex,
      exitIndex,
      entryTime: position.entryTime,
      exitTime: exitCandle.time,
      entryPrice: position.entryPrice,
      exitPrice: rawExitPrice,
      stopLoss: position.stopLoss,
      takeProfit: position.takeProfit,
      riskAmount: position.riskAmount,
      targetRiskAmount: position.targetRiskAmount,
      riskPercent: position.riskPercent,
      lots: position.lots,
      units: position.units,
      initialRiskDistance: position.initialRiskDistance,
      rMultiple,
      pnl,
      reason,
      signal: position.signal
    },
    endingEquity
  };
}

export async function runBacktest({
  candles,
  strategy,
  indicatorConfig = {},
  higherTimeframe = null,
  options = {}
}) {
  if (!Array.isArray(candles) || candles.length < 2) {
    throw new Error("Backtest requires at least 2 candles");
  }

  if (typeof strategy !== "function") {
    throw new Error("Backtest requires a strategy function");
  }

  const normalizedCandles = candles
    .map(normalizeCandle)
    .sort((a, b) => Number(a.time) - Number(b.time));

  const indicators = createIndicatorEngine(indicatorConfig);

  const higherAggregator = higherTimeframe?.resolution
    ? createCompletedTimeframeAggregator(higherTimeframe.resolution)
    : null;

  const higherIndicators = higherAggregator
    ? createIndicatorEngine(
        higherTimeframe.indicatorConfig || indicatorConfig
      )
    : null;

  let higherSnapshot = higherIndicators
    ? higherIndicators.snapshot()
    : null;

  let lastCompletedHigherCandle = null;

  const startingBalance = Number(options.startingBalance ?? 10000);

  if (!Number.isFinite(startingBalance) || startingBalance <= 0) {
    throw new Error("startingBalance must be a positive number");
  }

  const riskPercent = clampPercent(options.riskPercent, 1);
  const sizing = normalizeSizing(options.sizing);
  const roundTripCost = costInPrice(options);
  const intrabarPolicy =
    options.intrabarPolicy === "target-first"
      ? "target-first"
      : "stop-first";

  let equity = startingBalance;
  let position = null;
  let pendingDecision = null;
  const trades = [];
  const skippedSignals = [];
  const equityCurve = [
    {
      index: 0,
      time: normalizedCandles[0].time,
      equity
    }
  ];

  for (let index = 0; index < normalizedCandles.length; index += 1) {
    const candle = normalizedCandles[index];

    if (pendingDecision && !position) {
      const opening = createPosition({
        decision: pendingDecision,
        entryPrice: candle.open,
        entryIndex: index,
        entryCandle: candle,
        equity,
        riskPercent,
        sizing
      });

      if (opening.position) {
        position = opening.position;
      } else if (opening.skip) {
        skippedSignals.push({
          index,
          time: candle.time,
          action: pendingDecision.action,
          ...opening.skip
        });
      }

      pendingDecision = null;
    }

    if (position) {
      const triggered = exitTrigger(position, candle, intrabarPolicy);

      if (triggered) {
        const closed = closePosition({
          position,
          rawExitPrice: triggered.price,
          exitIndex: index,
          exitCandle: candle,
          reason: triggered.reason,
          roundTripCost,
          equity
        });

        trades.push(closed.trade);
        equity = closed.endingEquity;
        position = null;
      }
    }

    const indicatorSnapshot = indicators.update(candle);

    if (higherAggregator && higherIndicators) {
      const completedHigherCandle = higherAggregator.add(candle);

      if (completedHigherCandle) {
        lastCompletedHigherCandle = completedHigherCandle;
        higherSnapshot = higherIndicators.update(
          completedHigherCandle
        );
      }
    }

    const rawDecision = await strategy({
      index,
      candle,
      previousCandle:
        index > 0 ? normalizedCandles[index - 1] : null,
      indicators: indicatorSnapshot,
      higherTimeframe: higherAggregator
        ? {
            resolution: higherAggregator.resolution,
            candle: lastCompletedHigherCandle,
            indicators: higherSnapshot
          }
        : null,
      position: position ? { ...position } : null,
      equity,
      sizing,
      skippedSignals: skippedSignals.slice(),
      trades: trades.slice()
    });

    const decision = normalizeDecision(rawDecision);

    if (!position && !pendingDecision && decision.action !== "HOLD") {
      pendingDecision = decision;
    }

    equityCurve.push({
      index,
      time: candle.time,
      equity
    });
  }

  if (position) {
    const finalIndex = normalizedCandles.length - 1;
    const finalCandle = normalizedCandles[finalIndex];

    const closed = closePosition({
      position,
      rawExitPrice: finalCandle.close,
      exitIndex: finalIndex,
      exitCandle: finalCandle,
      reason: "END_OF_DATA",
      roundTripCost,
      equity
    });

    trades.push(closed.trade);
    equity = closed.endingEquity;

    equityCurve.push({
      index: finalIndex,
      time: finalCandle.time,
      equity
    });
  }

  return {
    options: {
      startingBalance,
      riskPercent,
      pipSize: Number(options.pipSize ?? 0.0001),
      spreadPips: Math.max(0, Number(options.spreadPips ?? 0)),
      slippagePips: Math.max(0, Number(options.slippagePips ?? 0)),
      sizing,
      intrabarPolicy,
      entryTiming: "next-open"
    },
    indicatorConfig: indicators.config,
    higherTimeframe: higherAggregator
      ? {
          resolution: higherAggregator.resolution,
          indicatorConfig: higherIndicators.config,
          lastCompletedCandle: lastCompletedHigherCandle,
          finalIndicators: higherSnapshot
        }
      : null,
    metrics: summarizeTrades(
      trades,
      startingBalance,
      equity,
      equityCurve
    ),
    trades,
    skippedSignals,
    equityCurve,
    finalIndicators: indicators.snapshot()
  };
}

export function strategyFromSignals(signals = []) {
  const byIndex = new Map(
    signals.map(signal => [
      Number(signal.index),
      normalizeDecision(signal)
    ])
  );

  return ({ index }) => byIndex.get(index) || { action: "HOLD" };
}
