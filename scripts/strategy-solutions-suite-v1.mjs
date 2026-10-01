// Offline five-part strategy research suite. No broker, DB, credentials, or order-client imports.
import fs from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import { validateDataset } from "../lib/research/prepare.mjs";
import { summarize } from "../lib/research/engine.mjs";
import { SYMBOLS, M15, COSTS, newsBlocked } from "../lib/research/policies.mjs";

const H1 = 60 * 60 * 1000;
const STARTING_BALANCE = 500;
const HARD_RISK_CEILING_PERCENT = 20;
const FIXED_LOTS = 0.01;
const VALIDATED_INPUT_HASH =
  "61e9d2fae987acf428cb8034e04514d7f84ad01e9e1a2f03d606de09ea740c14";

const CONFIG = Object.freeze({
  id: "strategy-solutions-suite-v1",
  entryChannelBars: 20,
  exitChannelBars: 10,
  atrBars: 14,
  atrStopMultiple: 2,
  rewardRiskTarget: 1.8,
  fixedLots: FIXED_LOTS,
  hardRiskCeilingPercent: HARD_RISK_CEILING_PERCENT,
  maxPositions: 1,
  maxEntriesPerUtcDay: 2,
  entryHourUtcStart: 7,
  entryHourUtcEndExclusive: 16,
  newsPolicy: "STRICT_BLACKOUT"
});

const QUALITY = Object.freeze({
  BASE: Object.freeze({ id: "BASE", close: 0.75, body: 0.50, displacement: 0.10 }),
  D15: Object.freeze({ id: "D15", close: 0.75, body: 0.50, displacement: 0.15 }),
  D20: Object.freeze({ id: "D20", close: 0.75, body: 0.50, displacement: 0.20 }),
  STRONG_CANDLE: Object.freeze({ id: "STRONG_CANDLE", close: 0.80, body: 0.60, displacement: 0.10 }),
  STRONG_ALL: Object.freeze({ id: "STRONG_ALL", close: 0.80, body: 0.60, displacement: 0.15 })
});

const QUALITY_LIST = Object.values(QUALITY);

const COST_GRID = Object.freeze({
  OPTIMISTIC: Object.freeze({ spreadPips: 1.0, slippagePips: 0.1 }),
  BASE: COSTS.BASE,
  MID: Object.freeze({ spreadPips: 2.25, slippagePips: 0.3 }),
  STRESS: COSTS.STRESS,
  HEAVY: Object.freeze({ spreadPips: 3.0, slippagePips: 0.5 })
});

const source = process.argv[2] || "research-output";
const out = process.argv[3] || "research-output/strategy-solutions-suite-v1";

const dataset = JSON.parse(
  await fs.readFile(path.join(source, "dataset.rechecked.json"), "utf8")
);
const prepared = validateDataset(dataset);
assert.equal(prepared.inputHash, VALIDATED_INPUT_HASH, "FROZEN_DATASET_HASH_MISMATCH");

const validationFrom =
  Math.ceil((prepared.from + (prepared.to - prepared.from) / 2) / M15) * M15;
assert.equal(
  validationFrom,
  Date.parse("2025-05-14T10:30:00.000Z"),
  "VALIDATION_BOUNDARY_DRIFT"
);

const validationWidth = (prepared.to - validationFrom) / 3;
const validationWindows = Array.from({ length: 3 }, (_, i) => ({
  from: Math.ceil((validationFrom + i * validationWidth) / M15) * M15,
  to:
    i === 2
      ? prepared.to
      : Math.ceil((validationFrom + (i + 1) * validationWidth) / M15) * M15
}));

const sum = (rows, fn) => rows.reduce((n, row) => n + fn(row), 0);
const max = values => Math.max(...values);
const min = values => Math.min(...values);
const mean = values =>
  values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
const dayKey = time => new Date(time).toISOString().slice(0, 10);
const weekKey = time => {
  const d = new Date(time);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return dayKey(+d);
};
const candidateKey = candidate => `${candidate.symbol}:${candidate.signalTime}`;

function completedH1(candles) {
  const bars = [];
  let bucket = [];
  let bucketHour = null;

  const flush = () => {
    if (!bucket.length) return;
    assert.equal(bucket.length, 4, "INCOMPLETE_H1_BUCKET");
    bars.push({
      time: bucketHour,
      lastM15Time: bucket.at(-1).time,
      open: bucket[0].open,
      high: max(bucket.map(c => c.high)),
      low: min(bucket.map(c => c.low)),
      close: bucket.at(-1).close
    });
    bucket = [];
  };

  for (const candle of candles) {
    const hour = Math.floor(candle.time / H1) * H1;
    if (bucketHour != null && hour !== bucketHour) flush();
    if (!bucket.length) bucketHour = hour;
    bucket.push(candle);
  }
  flush();
  return bars;
}

function buildPairResearch(symbol, pair) {
  const bars = completedH1(pair.candles);
  const indexByH1Time = new Map(bars.map((bar, index) => [bar.time, index]));
  const trueRanges = [];
  const candidates = {};
  const channelExits = {};

  for (let i = 0; i < bars.length; i++) {
    const bar = bars[i];
    const priorClose = i ? bars[i - 1].close : bar.close;
    trueRanges.push(
      Math.max(
        bar.high - bar.low,
        Math.abs(bar.high - priorClose),
        Math.abs(bar.low - priorClose)
      )
    );

    if (i >= CONFIG.exitChannelBars) {
      const priorExit = bars.slice(i - CONFIG.exitChannelBars, i);
      const exitHigh = max(priorExit.map(x => x.high));
      channelExits[bar.lastM15Time] = {
        exitShort: bar.close > exitHigh,
        h1Time: bar.time,
        close: bar.close,
        exitHigh
      };
    }

    if (i < Math.max(CONFIG.entryChannelBars, CONFIG.atrBars - 1)) continue;

    const atr =
      sum(trueRanges.slice(i - CONFIG.atrBars + 1, i + 1), x => x) /
      CONFIG.atrBars;
    if (!(atr > 0)) continue;

    const prior = bars.slice(i - CONFIG.entryChannelBars, i);
    const entryLow = min(prior.map(x => x.low));

    // This suite is intentionally SELL-only.
    if (!(bar.close < entryLow)) continue;

    const range = bar.high - bar.low;
    if (!(range > 0)) continue;

    const closeLocation = (bar.high - bar.close) / range;
    const bodyFraction = Math.abs(bar.close - bar.open) / range;
    const displacementATR = (entryLow - bar.close) / atr;

    candidates[bar.lastM15Time] = {
      symbol,
      side: "SELL",
      signalTime: bar.lastM15Time,
      h1Time: bar.time,
      atr,
      trigger: entryLow,
      closeLocation,
      bodyFraction,
      displacementATR,
      h1Open: bar.open,
      h1High: bar.high,
      h1Low: bar.low,
      h1Close: bar.close
    };
  }

  return { bars, indexByH1Time, candidates, channelExits };
}

const researchPairs = Object.fromEntries(
  SYMBOLS.map(symbol => [symbol, buildPairResearch(symbol, prepared.pairs[symbol])])
);

function passesQuality(candidate, q) {
  return (
    candidate.closeLocation >= q.close &&
    candidate.bodyFraction >= q.body &&
    candidate.displacementATR >= q.displacement
  );
}

function usdBreadth(candidate) {
  const votes = {};
  for (const symbol of SYMBOLS) {
    const rp = researchPairs[symbol];
    const index = rp.indexByH1Time.get(candidate.h1Time);
    if (index == null || index < 4) {
      votes[symbol] = null;
      continue;
    }
    const current = rp.bars[index];
    const prior = rp.bars[index - 4];
    votes[symbol] =
      symbol === "USDCHF"
        ? current.close > prior.close
        : current.close < prior.close;
  }

  const strongCount = Object.values(votes).filter(v => v === true).length;
  const otherStrongCount = Object.entries(votes).filter(
    ([symbol, vote]) => symbol !== candidate.symbol && vote === true
  ).length;

  return { votes, strongCount, otherStrongCount };
}

function conversionAt(symbol, price) {
  const m = prepared.pairs[symbol].metadata;
  if (m.quotingCurrency === "USD") return 1;
  if (m.baseCurrency === "USD") return 1 / price;
  return NaN;
}

function fixedLotSizing({ symbol, entry, stop, equity, costPrice }) {
  const m = prepared.pairs[symbol].metadata;

  if (
    FIXED_LOTS + 1e-12 < m.minLot ||
    FIXED_LOTS > m.maxLot + 1e-12 ||
    Math.abs(FIXED_LOTS / m.lotStep - Math.round(FIXED_LOTS / m.lotStep)) > 1e-8
  ) {
    return { skip: "FIXED_LOT_UNSUPPORTED" };
  }

  const distance = Math.abs(entry - stop);
  const conversion = Math.max(
    conversionAt(symbol, entry),
    conversionAt(symbol, stop)
  );
  const perLotRisk = (distance + costPrice) * m.lotSize * conversion;
  const riskAmount = FIXED_LOTS * perLotRisk;
  const riskCeilingAmount = equity * HARD_RISK_CEILING_PERCENT / 100;

  if (!(riskAmount > 0) || !(riskCeilingAmount > 0)) {
    return { skip: "INVALID_SIZING_INPUT" };
  }
  if (riskAmount > riskCeilingAmount + 1e-8) {
    return { skip: "MIN_LOT_RISK_SKIP" };
  }

  return {
    lots: FIXED_LOTS,
    units: FIXED_LOTS * m.lotSize,
    riskAmount,
    riskCeilingAmount,
    plannedRiskPercent: riskAmount / equity * 100
  };
}

function simulate({
  from,
  to,
  costs,
  quality = QUALITY.BASE,
  exitMode = "FIXED_1P8R",
  confirmation = "NONE",
  symbols = SYMBOLS,
  collectTrace = false
}) {
  const activeSymbols = SYMBOLS.filter(s => symbols.includes(s));
  const indexed = Object.fromEntries(
    activeSymbols.map(symbol => [
      symbol,
      new Map(
        prepared.pairs[symbol].candles
          .filter(c => c.time >= from && c.time < to)
          .map(c => [c.time, c])
      )
    ])
  );
  const times = [
    ...new Set(activeSymbols.flatMap(s => [...indexed[s].keys()]))
  ].sort((a, b) => a - b);

  let equity = STARTING_BALANCE;
  let position = null;
  const trades = [];
  const curve = [{ time: from, equity }];
  const skips = {};
  const trace = new Map();

  let currentDay = null;
  let currentWeek = null;
  let dayStart = equity;
  let weekStart = equity;
  let dayPnl = 0;
  let weekPnl = 0;
  let losing = 0;
  let dailyEntries = 0;
  const lastExit = {};

  const skip = reason => {
    skips[reason] = (skips[reason] || 0) + 1;
  };

  const mark = (candidate, reason, features = {}) => {
    if (!collectTrace) return;
    const key = candidateKey(candidate);
    if (!trace.has(key)) {
      trace.set(key, {
        key,
        symbol: candidate.symbol,
        signalTime: candidate.signalTime,
        h1Time: candidate.h1Time,
        reason,
        closeLocation: candidate.closeLocation,
        bodyFraction: candidate.bodyFraction,
        displacementATR: candidate.displacementATR,
        ...features
      });
    }
  };

  const close = (p, price, time, reason) => {
    const m = prepared.pairs[p.symbol].metadata;
    const move = (p.entryPrice - price) - p.costPrice;
    const conversion = m.quotingCurrency === "USD" ? 1 : 1 / price;
    const pnl = move * p.units * conversion;

    const trade = {
      ...p,
      exitPrice: price,
      exitTime: time,
      pnl,
      rMultiple: pnl / p.riskAmount,
      reason
    };

    trades.push(trade);
    equity += pnl;
    dayPnl += pnl;
    weekPnl += pnl;
    losing = pnl < 0 ? losing + 1 : 0;
    lastExit[p.symbol] = time;
    curve.push({ time, equity });
    position = null;
  };

  for (const time of times) {
    const day = dayKey(time);
    const week = weekKey(time);

    if (day !== currentDay) {
      currentDay = day;
      dayStart = equity;
      dayPnl = 0;
      losing = 0;
      dailyEntries = 0;
    }
    if (week !== currentWeek) {
      currentWeek = week;
      weekStart = equity;
      weekPnl = 0;
    }

    // Opening gap stop first.
    if (position) {
      const candle = indexed[position.symbol].get(time);
      if (candle && candle.open >= position.stopLoss) {
        close(position, candle.open, time, "GAP_STOP");
      }
    }

    // Channel exit executes at next M15 open after a completed H1 exit signal.
    if (position && exitMode === "CHANNEL_10H") {
      const candle = indexed[position.symbol].get(time);
      const exitSignal = researchPairs[position.symbol].channelExits[time - M15];
      if (candle && exitSignal?.exitShort) {
        close(position, candle.open, time, "OPPOSITE_10H_CHANNEL");
      }
    }

    for (const symbol of activeSymbols) {
      const candle = indexed[symbol].get(time);
      if (!candle) continue;

      const signalTime = time - M15;
      const candidate = researchPairs[symbol].candidates[signalTime];
      if (!candidate || signalTime < from || !passesQuality(candidate, quality)) {
        continue;
      }

      const date = new Date(time);
      const hour = date.getUTCHours();
      const m = prepared.pairs[symbol].metadata;
      const entryPrice = candle.open;
      const stopLoss = entryPrice + CONFIG.atrStopMultiple * candidate.atr;
      const distance = Math.abs(entryPrice - stopLoss);
      const stopPips = distance / m.pipSize;
      const breadth = usdBreadth(candidate);
      const baseFeatures = {
        hour,
        atrPips: candidate.atr / m.pipSize,
        stopPips,
        breadthStrongCount: breadth.strongCount,
        breadthOtherStrongCount: breadth.otherStrongCount,
        breadthVotes: breadth.votes,
        equityBefore: equity,
        dayPnlBefore: dayPnl,
        weekPnlBefore: weekPnl,
        losingBefore: losing,
        dailyEntriesBefore: dailyEntries,
        positionSymbolBefore: position?.symbol ?? null
      };

      if ([0, 6].includes(date.getUTCDay()) ||
          hour < CONFIG.entryHourUtcStart ||
          hour >= CONFIG.entryHourUtcEndExclusive) {
        skip("ENTRY_OUTSIDE_SESSION");
        mark(candidate, "ENTRY_OUTSIDE_SESSION", baseFeatures);
        continue;
      }

      if (newsBlocked(symbol, signalTime, time, CONFIG.newsPolicy, prepared.blackouts)) {
        skip("NEWS_BLOCK");
        mark(candidate, "NEWS_BLOCK", baseFeatures);
        continue;
      }

      if (
        confirmation === "USD_BREADTH" &&
        !(breadth.strongCount >= 2 && breadth.otherStrongCount >= 1)
      ) {
        skip("USD_BREADTH_BLOCK");
        mark(candidate, "USD_BREADTH_BLOCK", baseFeatures);
        continue;
      }

      if (position) {
        skip("PORTFOLIO_CAPACITY");
        mark(candidate, "PORTFOLIO_CAPACITY", baseFeatures);
        continue;
      }

      if (dailyEntries >= CONFIG.maxEntriesPerUtcDay) {
        skip("DAILY_TRADE_LIMIT");
        mark(candidate, "DAILY_TRADE_LIMIT", baseFeatures);
        continue;
      }

      if (
        dayPnl <= -dayStart * 0.02 ||
        weekPnl <= -weekStart * 0.05 ||
        losing >= 2 ||
        equity <= 0
      ) {
        skip("LOSS_GUARD");
        mark(candidate, "LOSS_GUARD", baseFeatures);
        continue;
      }

      if (lastExit[symbol] != null && time - lastExit[symbol] <= 4 * M15) {
        skip("POST_TRADE_COOLDOWN");
        mark(candidate, "POST_TRADE_COOLDOWN", baseFeatures);
        continue;
      }

      if (!(stopPips > 0)) {
        skip("INVALID_STOP");
        mark(candidate, "INVALID_STOP", baseFeatures);
        continue;
      }

      if (
        costs.spreadPips > 3 ||
        costs.spreadPips / stopPips > 0.2 + 1e-12
      ) {
        skip("SPREAD_BLOCK");
        mark(candidate, "SPREAD_BLOCK", baseFeatures);
        continue;
      }

      const costPrice =
        (costs.spreadPips + 2 * costs.slippagePips) * m.pipSize;
      const size = fixedLotSizing({
        symbol,
        entry: entryPrice,
        stop: stopLoss,
        equity,
        costPrice
      });

      if (size.skip) {
        skip(size.skip);
        mark(candidate, size.skip, baseFeatures);
        continue;
      }

      const takeProfit =
        exitMode === "FIXED_1P8R"
          ? entryPrice - CONFIG.rewardRiskTarget * distance
          : null;

      position = {
        symbol,
        side: "SELL",
        signalTime,
        h1SignalTime: candidate.h1Time,
        entryTime: time,
        entryPrice,
        entryEquity: equity,
        stopLoss,
        takeProfit,
        stopPips,
        atr: candidate.atr,
        trigger: candidate.trigger,
        closeLocation: candidate.closeLocation,
        bodyFraction: candidate.bodyFraction,
        displacementATR: candidate.displacementATR,
        breadthStrongCount: breadth.strongCount,
        breadthOtherStrongCount: breadth.otherStrongCount,
        breadthVotes: breadth.votes,
        costPrice,
        qualityId: quality.id,
        exitMode,
        confirmation,
        ...size
      };

      dailyEntries++;
      mark(candidate, "EXECUTED", {
        ...baseFeatures,
        plannedRiskPercent: size.plannedRiskPercent
      });
      // Keep scanning later symbols on this same M15 open so attribution
      // records them as capacity-blocked. They cannot execute because position is now occupied.
    }

    if (position) {
      const candle = indexed[position.symbol].get(time);
      if (candle) {
        const stopHit = candle.high >= position.stopLoss;
        const targetHit =
          exitMode === "FIXED_1P8R" &&
          candle.low <= position.takeProfit;

        // Conservative same-bar ordering.
        if (stopHit) {
          close(position, position.stopLoss, time + M15 - 1, "STOP_LOSS");
        } else if (targetHit) {
          close(position, position.takeProfit, time + M15 - 1, "TAKE_PROFIT");
        }
      }
    }
  }

  if (position) {
    const last = [...indexed[position.symbol].values()].at(-1);
    if (last) close(position, last.close, last.time + M15 - 1, "END_OF_WINDOW");
  }

  const metrics = summarize(trades, STARTING_BALANCE, skips, curve);
  const byPair = Object.fromEntries(
    activeSymbols.map(symbol => [
      symbol,
      summarize(
        trades.filter(t => t.symbol === symbol),
        STARTING_BALANCE
      )
    ])
  );

  const plannedRisks = trades.map(t => t.plannedRiskPercent);
  const sizingDiagnostics = {
    minLots: trades.length ? min(trades.map(t => t.lots)) : null,
    maxLots: trades.length ? max(trades.map(t => t.lots)) : null,
    averagePlannedRiskPercent: mean(plannedRisks),
    maxPlannedRiskPercent: plannedRisks.length ? max(plannedRisks) : null,
    minLotRiskSkips: skips.MIN_LOT_RISK_SKIP || 0
  };

  return {
    from,
    to,
    costs,
    quality: quality.id,
    exitMode,
    confirmation,
    symbols: activeSymbols,
    metrics,
    byPair,
    trades,
    equityCurve: curve,
    sizingDiagnostics,
    trace: collectTrace ? [...trace.values()] : undefined
  };
}

function windowSummary(result) {
  return validationWindows.map(window => {
    const prior = result.trades.filter(t => t.exitTime < window.from);
    const startingBalance =
      STARTING_BALANCE + sum(prior, t => t.pnl);
    const rows = result.trades.filter(
      t => t.exitTime >= window.from && t.exitTime < window.to
    );
    return {
      from: window.from,
      to: window.to,
      ...summarize(rows, startingBalance)
    };
  });
}

function eligibility(validation, stress, windows) {
  const reasons = [];
  const m = validation.metrics;

  if (m.tradeCount < 30) reasons.push("FEWER_THAN_30_VALIDATION_TRADES");
  if (m.expectancyR <= 0 || !(m.profitFactor > 1.1)) {
    reasons.push("WEAK_EXPECTANCY_OR_PF");
  }
  if (m.maxDrawdownPercent > 10) {
    reasons.push("DRAWDOWN_ABOVE_10_PERCENT");
  }
  if (stress.metrics.expectancyR <= 0 || stress.metrics.tradeCount < 20) {
    reasons.push("STRESS_FRAGILE");
  }
  if (windows.filter(w => w.totalR > 0).length < 2) {
    reasons.push("INCONSISTENT_WINDOWS");
  }

  const pairRows = Object.values(validation.byPair);
  if (pairRows.some(p => p.tradeCount < 5)) {
    reasons.push("INSUFFICIENT_PAIR_DISTRIBUTION");
  }

  const pairGains = pairRows.map(
    p => Math.max(0, p.endingBalance - STARTING_BALANCE)
  );
  if (
    pairGains.length &&
    Math.max(...pairGains) / (sum(pairGains, x => x) || 1) > 0.75
  ) {
    reasons.push("PAIR_GAIN_CONCENTRATION");
  }

  const windowGains = windows.map(
    w => Math.max(0, w.endingBalance - w.startingBalance)
  );
  if (
    windowGains.length &&
    Math.max(...windowGains) / (sum(windowGains, x => x) || 1) > 0.75
  ) {
    reasons.push("WINDOW_GAIN_CONCENTRATION");
  }

  return reasons;
}

function verify(result) {
  let balance = STARTING_BALANCE;
  const daily = {};

  for (const trade of result.trades) {
    assert.equal(trade.side, "SELL", "NON_SELL_TRADE_EXECUTED");
    assert.equal(trade.entryTime, trade.signalTime + M15, "ENTRY_NOT_NEXT_M15_OPEN");
    assert.equal(trade.lots, FIXED_LOTS, "FIXED_LOT_DRIFT");
    assert.ok(
      trade.riskAmount <=
        trade.entryEquity * HARD_RISK_CEILING_PERCENT / 100 + 1e-8,
      "HARD_RISK_CEILING_BREACH"
    );

    if (result.exitMode === "FIXED_1P8R") {
      const riskDistance = Math.abs(trade.entryPrice - trade.stopLoss);
      const targetDistance = Math.abs(trade.takeProfit - trade.entryPrice);
      assert.ok(
        Math.abs(targetDistance / riskDistance - CONFIG.rewardRiskTarget) < 1e-10,
        "TARGET_R_DRIFT"
      );
    } else {
      assert.equal(trade.takeProfit, null, "CHANNEL_EXIT_HAS_FIXED_TARGET");
    }

    const day = dayKey(trade.entryTime);
    daily[day] = (daily[day] || 0) + 1;
    assert.ok(daily[day] <= CONFIG.maxEntriesPerUtcDay, "DAILY_ENTRY_LIMIT_BREACH");

    balance += trade.pnl;
  }

  assert.ok(
    Math.abs(balance - result.metrics.endingBalance) < 1e-7,
    "ENDING_BALANCE_MISMATCH"
  );
}

function metricLite(result) {
  const m = result.metrics;
  return {
    trades: m.tradeCount,
    endingBalance: m.endingBalance,
    returnPercent: m.returnPercent,
    totalR: m.totalR,
    wins: m.wins,
    losses: m.losses,
    winRate: m.winRate,
    profitFactor: m.profitFactor,
    expectancyR: m.expectancyR,
    maxDrawdownPercent: m.maxDrawdownPercent,
    longestLosingStreak: m.longestLosingStreak,
    averageStopPips: m.averageStopPips,
    minLotSkips: m.minLotSkips,
    spreadBlocked: m.spreadBlocked,
    newsBlocked: m.newsBlocked,
    capacityBlocked: m.capacityBlocked,
    byPair: Object.fromEntries(
      Object.entries(result.byPair).map(([symbol, row]) => [
        symbol,
        {
          trades: row.tradeCount,
          totalR: row.totalR,
          profitFactor: row.profitFactor,
          expectancyR: row.expectancyR,
          returnPercent: row.returnPercent
        }
      ])
    )
  };
}

function subsetMetrics(trades) {
  const m = summarize(trades, STARTING_BALANCE);
  return {
    trades: m.tradeCount,
    totalR: m.totalR,
    winRate: m.winRate,
    profitFactor: m.profitFactor,
    expectancyR: m.expectancyR,
    pnl: m.endingBalance - STARTING_BALANCE
  };
}

function featureSummary(rows) {
  const avg = field => mean(rows.map(r => r[field]).filter(Number.isFinite));
  const hourCounts = {};
  const reasonCounts = {};
  for (const row of rows) {
    if (Number.isInteger(row.hour)) {
      hourCounts[row.hour] = (hourCounts[row.hour] || 0) + 1;
    }
    reasonCounts[row.reason] = (reasonCounts[row.reason] || 0) + 1;
  }
  return {
    count: rows.length,
    averageCloseLocation: avg("closeLocation"),
    averageBodyFraction: avg("bodyFraction"),
    averageDisplacementATR: avg("displacementATR"),
    averageAtrPips: avg("atrPips"),
    averageStopPips: avg("stopPips"),
    averageBreadthStrongCount: avg("breadthStrongCount"),
    averageBreadthOtherStrongCount: avg("breadthOtherStrongCount"),
    hourCounts,
    reasonCounts
  };
}

function tradeMap(result) {
  return new Map(
    result.trades.map(trade => [
      `${trade.symbol}:${trade.signalTime}`,
      trade
    ])
  );
}

// -------------------- Experiment 1: attribution --------------------

const portfolioTraceRun = simulate({
  from: validationFrom,
  to: prepared.to,
  costs: COSTS.BASE,
  quality: QUALITY.BASE,
  exitMode: "FIXED_1P8R",
  confirmation: "NONE",
  symbols: SYMBOLS,
  collectTrace: true
});

const gbpSoloTraceRun = simulate({
  from: validationFrom,
  to: prepared.to,
  costs: COSTS.BASE,
  quality: QUALITY.BASE,
  exitMode: "FIXED_1P8R",
  confirmation: "NONE",
  symbols: ["GBPUSD"],
  collectTrace: true
});

verify(portfolioTraceRun);
verify(gbpSoloTraceRun);

const portTrace = new Map(
  portfolioTraceRun.trace.filter(x => x.symbol === "GBPUSD").map(x => [x.key, x])
);
const soloTrace = new Map(
  gbpSoloTraceRun.trace.filter(x => x.symbol === "GBPUSD").map(x => [x.key, x])
);
const allGbpKeys = [...new Set([...portTrace.keys(), ...soloTrace.keys()])].sort();
const portTrades = tradeMap(portfolioTraceRun);
const soloTrades = tradeMap(gbpSoloTraceRun);

const attributionGroups = {
  PORTFOLIO_EXECUTED: [],
  NEWLY_ADMITTED_SOLO: [],
  PORTFOLIO_ONLY: [],
  BLOCKED_BOTH: []
};

for (const key of allGbpKeys) {
  const p = portTrace.get(key);
  const s = soloTrace.get(key);
  const portExecuted = p?.reason === "EXECUTED";
  const soloExecuted = s?.reason === "EXECUTED";
  const row = {
    key,
    portfolio: p ?? null,
    solo: s ?? null
  };

  if (portExecuted && soloExecuted) attributionGroups.PORTFOLIO_EXECUTED.push(row);
  else if (!portExecuted && soloExecuted) attributionGroups.NEWLY_ADMITTED_SOLO.push(row);
  else if (portExecuted && !soloExecuted) attributionGroups.PORTFOLIO_ONLY.push(row);
  else attributionGroups.BLOCKED_BOTH.push(row);
}

function rowsForFeatures(group) {
  return group.map(x => x.portfolio || x.solo).filter(Boolean);
}

const attribution = {
  portfolioOverall: metricLite(portfolioTraceRun),
  gbpSoloOverall: metricLite(gbpSoloTraceRun),
  portfolioGbpTrades: subsetMetrics(
    portfolioTraceRun.trades.filter(t => t.symbol === "GBPUSD")
  ),
  gbpSoloTrades: subsetMetrics(gbpSoloTraceRun.trades),
  portfolioGbpFirstReasonCounts: featureSummary(
    portfolioTraceRun.trace.filter(x => x.symbol === "GBPUSD")
  ).reasonCounts,
  groups: {
    PORTFOLIO_EXECUTED: {
      features: featureSummary(rowsForFeatures(attributionGroups.PORTFOLIO_EXECUTED)),
      realizedInPortfolio: subsetMetrics(
        attributionGroups.PORTFOLIO_EXECUTED
          .map(x => portTrades.get(x.key))
          .filter(Boolean)
      )
    },
    NEWLY_ADMITTED_SOLO: {
      features: featureSummary(rowsForFeatures(attributionGroups.NEWLY_ADMITTED_SOLO)),
      realizedInSolo: subsetMetrics(
        attributionGroups.NEWLY_ADMITTED_SOLO
          .map(x => soloTrades.get(x.key))
          .filter(Boolean)
      )
    },
    PORTFOLIO_ONLY: {
      features: featureSummary(rowsForFeatures(attributionGroups.PORTFOLIO_ONLY)),
      realizedInPortfolio: subsetMetrics(
        attributionGroups.PORTFOLIO_ONLY
          .map(x => portTrades.get(x.key))
          .filter(Boolean)
      )
    },
    BLOCKED_BOTH: {
      features: featureSummary(rowsForFeatures(attributionGroups.BLOCKED_BOTH))
    }
  }
};

// -------------------- Experiment 2: channel exit --------------------

const channelBase = simulate({
  from: validationFrom,
  to: prepared.to,
  costs: COSTS.BASE,
  quality: QUALITY.BASE,
  exitMode: "CHANNEL_10H",
  confirmation: "NONE",
  symbols: SYMBOLS
});
const channelStress = simulate({
  from: validationFrom,
  to: prepared.to,
  costs: COSTS.STRESS,
  quality: QUALITY.BASE,
  exitMode: "CHANNEL_10H",
  confirmation: "NONE",
  symbols: SYMBOLS
});
verify(channelBase);
verify(channelStress);
const channelWindows = windowSummary(channelBase);
const channelRejections = eligibility(channelBase, channelStress, channelWindows);

const channelExitExperiment = {
  base: metricLite(channelBase),
  stress: metricLite(channelStress),
  windows: channelWindows.map(w => ({
    from: w.from,
    to: w.to,
    trades: w.tradeCount,
    totalR: w.totalR,
    returnPercent: w.returnPercent
  })),
  eligible: channelRejections.length === 0,
  rejectionReasons: channelRejections
};

// -------------------- Experiment 3: pre-validation quality selection --------------------

const trainingRows = QUALITY_LIST.map(q => {
  const result = simulate({
    from: prepared.from,
    to: validationFrom,
    costs: COSTS.BASE,
    quality: q,
    exitMode: "FIXED_1P8R",
    confirmation: "NONE",
    symbols: SYMBOLS
  });
  verify(result);
  return { quality: q, result };
});

const eligibleTraining = trainingRows.filter(x => x.result.metrics.tradeCount >= 30);
const selectionPool = eligibleTraining.length ? eligibleTraining : trainingRows.filter(x => x.quality.id === "BASE");

selectionPool.sort((a, b) => {
  const am = a.result.metrics;
  const bm = b.result.metrics;
  if (bm.expectancyR !== am.expectancyR) return bm.expectancyR - am.expectancyR;
  const apf = am.profitFactor ?? -Infinity;
  const bpf = bm.profitFactor ?? -Infinity;
  if (bpf !== apf) return bpf - apf;
  return am.maxDrawdownPercent - bm.maxDrawdownPercent;
});

const selectedQuality = selectionPool[0].quality;

const selectedBase = simulate({
  from: validationFrom,
  to: prepared.to,
  costs: COSTS.BASE,
  quality: selectedQuality,
  exitMode: "FIXED_1P8R",
  confirmation: "NONE",
  symbols: SYMBOLS
});
const selectedStress = simulate({
  from: validationFrom,
  to: prepared.to,
  costs: COSTS.STRESS,
  quality: selectedQuality,
  exitMode: "FIXED_1P8R",
  confirmation: "NONE",
  symbols: SYMBOLS
});
verify(selectedBase);
verify(selectedStress);
const selectedWindows = windowSummary(selectedBase);
const selectedRejections = eligibility(selectedBase, selectedStress, selectedWindows);

const qualitySelectionExperiment = {
  selectionRule: ">=30 training trades, max expectancyR, then PF, then lower DD",
  training: Object.fromEntries(
    trainingRows.map(({ quality, result }) => [
      quality.id,
      metricLite(result)
    ])
  ),
  selectedQuality: selectedQuality.id,
  heldForwardBase: metricLite(selectedBase),
  heldForwardStress: metricLite(selectedStress),
  windows: selectedWindows.map(w => ({
    from: w.from,
    to: w.to,
    trades: w.tradeCount,
    totalR: w.totalR,
    returnPercent: w.returnPercent
  })),
  eligible: selectedRejections.length === 0,
  rejectionReasons: selectedRejections,
  caveat: "Held-forward region was inspected in prior related experiments; not pristine OOS."
};

// -------------------- Experiment 4: USD breadth confirmation --------------------

const breadthBase = simulate({
  from: validationFrom,
  to: prepared.to,
  costs: COSTS.BASE,
  quality: QUALITY.BASE,
  exitMode: "FIXED_1P8R",
  confirmation: "USD_BREADTH",
  symbols: SYMBOLS
});
const breadthStress = simulate({
  from: validationFrom,
  to: prepared.to,
  costs: COSTS.STRESS,
  quality: QUALITY.BASE,
  exitMode: "FIXED_1P8R",
  confirmation: "USD_BREADTH",
  symbols: SYMBOLS
});
verify(breadthBase);
verify(breadthStress);
const breadthWindows = windowSummary(breadthBase);
const breadthRejections = eligibility(breadthBase, breadthStress, breadthWindows);

const breadthExperiment = {
  rule: ">=2 of 3 four-H1 USD-strength votes, including >=1 other-pair confirmation",
  base: metricLite(breadthBase),
  stress: metricLite(breadthStress),
  windows: breadthWindows.map(w => ({
    from: w.from,
    to: w.to,
    trades: w.tradeCount,
    totalR: w.totalR,
    returnPercent: w.returnPercent
  })),
  eligible: breadthRejections.length === 0,
  rejectionReasons: breadthRejections
};

// -------------------- Experiment 5: cost robustness --------------------

const strategyDefs = {
  BASE_FIXED_1P8R: {
    quality: QUALITY.BASE,
    exitMode: "FIXED_1P8R",
    confirmation: "NONE"
  },
  CHANNEL_EXIT: {
    quality: QUALITY.BASE,
    exitMode: "CHANNEL_10H",
    confirmation: "NONE"
  },
  PREVALIDATION_SELECTED: {
    quality: selectedQuality,
    exitMode: "FIXED_1P8R",
    confirmation: "NONE"
  },
  USD_BREADTH_CONFIRM: {
    quality: QUALITY.BASE,
    exitMode: "FIXED_1P8R",
    confirmation: "USD_BREADTH"
  }
};

const costMatrix = {};
for (const [strategyId, def] of Object.entries(strategyDefs)) {
  costMatrix[strategyId] = {};
  for (const [costId, costs] of Object.entries(COST_GRID)) {
    const result = simulate({
      from: validationFrom,
      to: prepared.to,
      costs,
      quality: def.quality,
      exitMode: def.exitMode,
      confirmation: def.confirmation,
      symbols: SYMBOLS
    });
    verify(result);
    costMatrix[strategyId][costId] = metricLite(result);
  }
}

const costRobustness = Object.fromEntries(
  Object.entries(costMatrix).map(([strategyId, rows]) => [
    strategyId,
    {
      costRobust:
        rows.BASE.expectancyR > 0 &&
        rows.STRESS.expectancyR > 0 &&
        rows.STRESS.trades >= 20,
      scenarios: rows
    }
  ])
);

// Baseline metrics are already the attribution portfolio run at BASE cost.
const baselineStress = simulate({
  from: validationFrom,
  to: prepared.to,
  costs: COSTS.STRESS,
  quality: QUALITY.BASE,
  exitMode: "FIXED_1P8R",
  confirmation: "NONE",
  symbols: SYMBOLS
});
verify(baselineStress);
const baselineWindows = windowSummary(portfolioTraceRun);
const baselineRejections = eligibility(
  portfolioTraceRun,
  baselineStress,
  baselineWindows
);

const output = {
  experiment: CONFIG.id,
  protocol: "docs/STRATEGY_SOLUTIONS_SUITE_V1_PROTOCOL.md",
  inputHash: prepared.inputHash,
  fullFrom: prepared.from,
  fullTo: prepared.to,
  validationFrom,
  baseline: {
    base: metricLite(portfolioTraceRun),
    stress: metricLite(baselineStress),
    windows: baselineWindows.map(w => ({
      from: w.from,
      to: w.to,
      trades: w.tradeCount,
      totalR: w.totalR,
      returnPercent: w.returnPercent
    })),
    eligible: baselineRejections.length === 0,
    rejectionReasons: baselineRejections
  },
  experiment1Attribution: attribution,
  experiment2ChannelExit: channelExitExperiment,
  experiment3QualitySelection: qualitySelectionExperiment,
  experiment4UsdBreadth: breadthExperiment,
  experiment5CostRobustness: costRobustness,
  safety: {
    offlineOnly: true,
    productionModified: false,
    liveExecution: false
  }
};

await fs.mkdir(out, { recursive: true });
await fs.writeFile(
  path.join(out, "results.json"),
  JSON.stringify(output, null, 2)
);

const compact = {
  baseline: output.baseline,
  attribution: output.experiment1Attribution,
  channelExit: output.experiment2ChannelExit,
  qualitySelection: output.experiment3QualitySelection,
  usdBreadth: output.experiment4UsdBreadth,
  costRobustness: output.experiment5CostRobustness
};

await fs.writeFile(
  path.join(out, "summary.json"),
  JSON.stringify(compact, null, 2)
);

console.log(JSON.stringify({
  stage: "complete",
  experiment: CONFIG.id,
  inputHash: prepared.inputHash,
  baseline: {
    base: metricLite(portfolioTraceRun),
    stress: metricLite(baselineStress),
    rejectionReasons: baselineRejections
  },
  attribution: {
    portfolioGbpTrades: attribution.portfolioGbpTrades,
    gbpSoloTrades: attribution.gbpSoloTrades,
    portfolioGbpFirstReasonCounts: attribution.portfolioGbpFirstReasonCounts,
    groups: attribution.groups
  },
  channelExit: channelExitExperiment,
  qualitySelection: qualitySelectionExperiment,
  usdBreadth: breadthExperiment,
  costRobustness: costRobustness,
  out
}));
