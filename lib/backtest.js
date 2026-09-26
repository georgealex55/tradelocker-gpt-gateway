import {
  createIndicatorEngine,
  normalizeCandle
} from "./indicators";

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
  riskPercent
}) {
  const levels = validateEntryDecision(decision, entryPrice);
  if (!levels) return null;

  const initialRiskDistance = Math.abs(entryPrice - levels.stopLoss);

  if (!(initialRiskDistance > 0)) {
    throw new Error("Stop distance must be positive");
  }

  return {
    side: decision.action,
    entryPrice,
    stopLoss: levels.stopLoss,
    takeProfit: levels.takeProfit,
    initialRiskDistance,
    riskAmount: equity * (riskPercent / 100),
    entryIndex,
    entryTime: entryCandle.time,
    signal: decision
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
  options = {}
}) {
  if (!Array.isArray(candles) || candles.length < 2) {
    throw new Error("Backtest requires at least 2 candles");
  }

  if (typeof strategy !== "function") {
    throw new Error("Backtest requires a strategy function");
  }

  const normalizedCandles = candles.map(normalizeCandle);
  const indicators = createIndicatorEngine(indicatorConfig);

  const startingBalance = Number(options.startingBalance ?? 10000);

  if (!Number.isFinite(startingBalance) || startingBalance <= 0) {
    throw new Error("startingBalance must be a positive number");
  }

  const riskPercent = clampPercent(options.riskPercent, 1);
  const roundTripCost = costInPrice(options);
  const intrabarPolicy =
    options.intrabarPolicy === "target-first"
      ? "target-first"
      : "stop-first";

  let equity = startingBalance;
  let position = null;
  let pendingDecision = null;
  const trades = [];
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
      position = createPosition({
        decision: pendingDecision,
        entryPrice: candle.open,
        entryIndex: index,
        entryCandle: candle,
        equity,
        riskPercent
      });
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

    const rawDecision = await strategy({
      index,
      candle,
      previousCandle:
        index > 0 ? normalizedCandles[index - 1] : null,
      indicators: indicatorSnapshot,
      position: position ? { ...position } : null,
      equity,
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
      intrabarPolicy,
      entryTiming: "next-open"
    },
    indicatorConfig: indicators.config,
    metrics: summarizeTrades(
      trades,
      startingBalance,
      equity,
      equityCurve
    ),
    trades,
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
