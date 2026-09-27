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
import {
  historicalMacroBlackouts,
  historicalMacroEventCounts
} from "./historicalMacroEvents";

const SYMBOL = "USDCHF";
const WARMUP_FROM = "2023-12-15T00:00:00.000Z";
const PERIOD_FROM = "2024-01-01T00:00:00.000Z";
const PERIOD_TO = "2026-09-25T21:00:00.000Z";
const CAPITAL_PROFILES = Object.freeze([
  {
    id: "150_at_1pct",
    label: "$150 @ 1.00%",
    startingBalance: 150,
    riskPercent: 1
  },
  {
    id: "500_at_0_30pct",
    label: "$500 @ 0.30%",
    startingBalance: 500,
    riskPercent: 0.3
  },
  {
    id: "500_at_1pct",
    label: "$500 @ 1.00%",
    startingBalance: 500,
    riskPercent: 1
  }
]);

const COST_ASSUMPTIONS = Object.freeze({
  spreadPips: 2,
  slippagePips: 0.2
});

function findInstrument(universe) {
  return universe.find(row => row.symbol === SYMBOL) || null;
}

function metricsBySide(trades, side) {
  const rows = trades.filter(trade => trade.side === side);
  const wins = rows.filter(trade => Number(trade.pnl) > 0);
  const losses = rows.filter(trade => Number(trade.pnl) < 0);
  const totalR = rows.reduce(
    (sum, trade) => sum + Number(trade.rMultiple || 0),
    0
  );

  return {
    trades: rows.length,
    wins: wins.length,
    losses: losses.length,
    winRate:
      rows.length > 0 ? (wins.length / rows.length) * 100 : 0,
    totalR,
    expectancyR:
      rows.length > 0 ? totalR / rows.length : 0
  };
}

function groupTrades(trades, keyFn) {
  const map = new Map();

  for (const trade of trades) {
    const key = keyFn(trade);
    const current = map.get(key) || {
      trades: 0,
      wins: 0,
      losses: 0,
      totalR: 0,
      pnl: 0
    };

    current.trades += 1;
    if (Number(trade.pnl) > 0) current.wins += 1;
    if (Number(trade.pnl) < 0) current.losses += 1;
    current.totalR += Number(trade.rMultiple || 0);
    current.pnl += Number(trade.pnl || 0);

    map.set(key, current);
  }

  return [...map.entries()]
    .map(([key, value]) => ({
      key,
      ...value,
      winRate:
        value.trades > 0
          ? (value.wins / value.trades) * 100
          : 0,
      expectancyR:
        value.trades > 0
          ? value.totalR / value.trades
          : 0
    }))
    .sort((a, b) => String(a.key).localeCompare(String(b.key)));
}

function monthKey(trade) {
  return new Date(Number(trade.entryTime))
    .toISOString()
    .slice(0, 7);
}

function hourKey(trade) {
  const date = new Date(Number(trade.entryTime));
  return String(date.getUTCHours()).padStart(2, "0") + ":00";
}

function summarizeSkips(skippedSignals) {
  const counts = {};

  for (const row of skippedSignals) {
    const reason = row.reason || "UNKNOWN";
    counts[reason] = (counts[reason] || 0) + 1;
  }

  return Object.entries(counts)
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count);
}

function stopStats(trades, pipSize) {
  const rows = trades
    .map(trade => {
      const distance = Math.abs(
        Number(trade.entryPrice) - Number(trade.stopLoss)
      );
      return pipSize > 0 ? distance / pipSize : null;
    })
    .filter(Number.isFinite)
    .sort((a, b) => a - b);

  if (!rows.length) {
    return {
      averagePips: 0,
      medianPips: 0,
      minPips: 0,
      maxPips: 0
    };
  }

  const averagePips =
    rows.reduce((sum, value) => sum + value, 0) / rows.length;

  const middle = Math.floor(rows.length / 2);
  const medianPips =
    rows.length % 2
      ? rows[middle]
      : (rows[middle - 1] + rows[middle]) / 2;

  return {
    averagePips,
    medianPips,
    minPips: rows[0],
    maxPips: rows.at(-1)
  };
}

function summarizeResult(result, sizing) {
  const metrics = result.metrics || {};
  const trades = result.trades || [];
  const skipped = result.skippedSignals || [];

  return {
    trades: metrics.trades ?? 0,
    wins: metrics.wins ?? 0,
    losses: metrics.losses ?? 0,
    winRate: metrics.winRate ?? 0,
    profitFactor: metrics.profitFactor ?? 0,
    expectancyR: metrics.expectancyR ?? 0,
    totalR: metrics.totalR ?? 0,
    returnPercent: metrics.returnPercent ?? 0,
    maxDrawdownPercent: metrics.maxDrawdownPercent ?? 0,
    startingBalance: metrics.startingBalance ?? 0,
    endingBalance: metrics.endingBalance ?? 0,
    netPnl: metrics.netPnl ?? 0,
    skippedSignals: skipped.length,
    minLotRiskSkips: skipped.filter(
      row => row.reason === "MIN_LOT_EXCEEDS_RISK_BUDGET"
    ).length,
    guardSkips: skipped.filter(row =>
      [
        "MAX_DAILY_TRADES",
        "DAILY_LOSS_LIMIT",
        "WEEKLY_LOSS_LIMIT",
        "CONSECUTIVE_LOSS_LIMIT",
        "POST_TRADE_COOLDOWN"
      ].includes(row.reason)
    ).length,
    long: metricsBySide(trades, "BUY"),
    short: metricsBySide(trades, "SELL"),
    byMonth: groupTrades(trades, monthKey),
    byHourUtc: groupTrades(trades, hourKey),
    stopDistance: stopStats(trades, sizing.pipSize),
    skipReasons: summarizeSkips(skipped)
  };
}

async function runScenario({
  candles,
  sizing,
  config,
  scheduledBlackouts = [],
  label,
  startingBalance,
  riskPercent
}) {
  const evaluator = createForexStrategyV1({
    symbol: SYMBOL,
    config,
    scheduledBlackouts
  });

  const periodStart = Date.parse(PERIOD_FROM);

  const result = await runBacktest({
    candles,
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
      startingBalance,
      riskPercent,
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

  return {
    label,
    startingBalance,
    riskPercent,
    riskBudgetAtStart:
      startingBalance * (riskPercent / 100),
    scheduledBlackouts: scheduledBlackouts.length,
    summary: summarizeResult(result, sizing),
    trades: result.trades,
    skippedSignals: result.skippedSignals
  };
}

function compareSummaries(baseline, filtered) {
  return {
    tradesRemoved:
      Number(baseline.trades || 0) - Number(filtered.trades || 0),
    totalRChange:
      Number(filtered.totalR || 0) - Number(baseline.totalR || 0),
    expectancyRChange:
      Number(filtered.expectancyR || 0) -
      Number(baseline.expectancyR || 0),
    returnPercentChange:
      Number(filtered.returnPercent || 0) -
      Number(baseline.returnPercent || 0),
    maxDrawdownPercentChange:
      Number(filtered.maxDrawdownPercent || 0) -
      Number(baseline.maxDrawdownPercent || 0),
    endingBalanceChange:
      Number(filtered.endingBalance || 0) -
      Number(baseline.endingBalance || 0)
  };
}

export async function runUsdchfResearch({
  config = FOREX_STRATEGY_V1_CONFIG
} = {}) {
  const universe = await listForexInstruments();
  const instrument = findInstrument(universe);

  if (!instrument) {
    throw new Error(
      "USDCHF is not available as a FOREX instrument on this TradeLocker account"
    );
  }

  if (!instrument.tradeRouteId) {
    throw new Error("USDCHF has no TradeLocker TRADE route");
  }

  const sizing = await fetchTradeLockerInstrumentSizing({
    tradableInstrumentId: instrument.tradableInstrumentId,
    tradeRouteId: instrument.tradeRouteId,
    accountCurrency: config.universe.accountCurrency,
    maxLots: config.risk.maxLots
  });

  const marketData = await fetchTradeLockerHistory({
    symbol: SYMBOL,
    tradableInstrumentId: instrument.tradableInstrumentId,
    infoRouteId: instrument.infoRouteId,
    resolution: config.timeframes.entry,
    from: WARMUP_FROM,
    to: PERIOD_TO,
    maxBars: 100000
  });

  if (marketData.candles.length < 1000) {
    throw new Error(
      `Insufficient USDCHF history returned: ${marketData.candles.length} bars`
    );
  }

  const macroBlackouts = historicalMacroBlackouts();

  const profiles = [];

  for (const profile of CAPITAL_PROFILES) {
    const baseline = await runScenario({
      candles: marketData.candles,
      sizing,
      config,
      scheduledBlackouts: [],
      label: `${profile.label} baseline`,
      startingBalance: profile.startingBalance,
      riskPercent: profile.riskPercent
    });

    const macroFiltered = await runScenario({
      candles: marketData.candles,
      sizing,
      config,
      scheduledBlackouts: macroBlackouts,
      label: `${profile.label} macro filtered`,
      startingBalance: profile.startingBalance,
      riskPercent: profile.riskPercent
    });

    profiles.push({
      ...profile,
      riskBudgetAtStart:
        profile.startingBalance * (profile.riskPercent / 100),
      baseline,
      macroFiltered,
      comparison: compareSummaries(
        baseline.summary,
        macroFiltered.summary
      )
    });
  }

  const configuredProfile =
    profiles.find(profile =>
      profile.startingBalance === config.capital.startingBalanceUsd &&
      Math.abs(
        profile.riskPercent - config.risk.riskPercentPerTrade
      ) < 1e-9
    ) || profiles.at(-1);

  return {
    generatedAt: Date.now(),
    symbol: SYMBOL,
    strategy: config.name,
    version: config.version,
    period: {
      warmupFrom: WARMUP_FROM,
      from: PERIOD_FROM,
      to: PERIOD_TO
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
    macroCalendar: {
      counts: historicalMacroEventCounts(),
      blackoutCount: macroBlackouts.length,
      normalWindow: {
        preMinutes: config.eventRisk.preEventMinutes,
        postMinutes: config.eventRisk.postEventMinutes
      },
      centralBankWindow: {
        preMinutes: config.eventRisk.fomcPreEventMinutes,
        postMinutes: config.eventRisk.fomcPostEventMinutes
      }
    },
    broker: {
      minLot: sizing.minLot,
      maxLot: sizing.maxLot,
      lotStep: sizing.lotStep,
      lotSize: sizing.lotSize,
      pipSize: sizing.pipSize,
      baseCurrency: sizing.baseCurrency,
      quotingCurrency: sizing.quotingCurrency
    },
    barsDownloaded: marketData.returnedBars,
    profiles,
    configuredProfileId: configuredProfile.id,
    baseline: configuredProfile.baseline,
    macroFiltered: configuredProfile.macroFiltered,
    comparison: configuredProfile.comparison
  };
}
