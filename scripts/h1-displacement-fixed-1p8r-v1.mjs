// Offline research only. No broker, DB, credential, or order-client imports.
import fs from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { validateDataset } from "../lib/research/prepare.mjs";
import { summarize } from "../lib/research/engine.mjs";
import { SYMBOLS, M15, COSTS, newsBlocked } from "../lib/research/policies.mjs";

const H1 = 60 * 60 * 1000;
const STARTING_BALANCE = 500;
const HARD_RISK_CEILING_PERCENT = 20;
const FIXED_LOTS = 0.01;
const ACTIVE_SYMBOLS = Object.freeze(["GBPUSD"]);
const VALIDATED_INPUT_HASH =
  "61e9d2fae987acf428cb8034e04514d7f84ad01e9e1a2f03d606de09ea740c14";

const STRATEGY = Object.freeze({
  id: "h1-displacement-gbpusd-sell-only-v1",
  allowedSide: "SELL",
  signalTimeframe: "H1",
  entryChannelBars: 20,
  atrBars: 14,
  atrStopMultiple: 2,
  closeLocationMin: 0.75,
  bodyFractionMin: 0.50,
  displacementAtrMin: 0.10,
  rewardRiskTarget: 1.8,
  fixedLots: FIXED_LOTS,
  hardRiskCeilingPercent: HARD_RISK_CEILING_PERCENT,
  maxPositions: 1,
  maxEntriesPerUtcDay: 2,
  entryHourUtcStart: 7,
  entryHourUtcEndExclusive: 16,
  newsPolicy: "STRICT_BLACKOUT"
});

const source = process.argv[2] || "research-output";
const out = process.argv[3] || "research-output/h1-displacement-gbpusd-sell-only-v1";

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
const windows = Array.from({ length: 3 }, (_, i) => ({
  from: Math.ceil((validationFrom + i * validationWidth) / M15) * M15,
  to:
    i === 2
      ? prepared.to
      : Math.ceil((validationFrom + (i + 1) * validationWidth) / M15) * M15
}));

const sum = (rows, fn) => rows.reduce((n, row) => n + fn(row), 0);
const max = values => Math.max(...values);
const min = values => Math.min(...values);
const dayKey = time => new Date(time).toISOString().slice(0, 10);
const weekKey = time => {
  const d = new Date(time);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return dayKey(+d);
};

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

function buildSignals(pair) {
  const bars = completedH1(pair.candles);
  const trueRanges = [];
  const entries = {};
  const diagnostics = {
    channelBreakouts: 0,
    closeLocationPass: 0,
    bodyLocationPass: 0,
    displacementPass: 0
  };

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

    if (i < Math.max(STRATEGY.entryChannelBars, STRATEGY.atrBars - 1)) continue;

    const atr =
      sum(trueRanges.slice(i - STRATEGY.atrBars + 1, i + 1), x => x) /
      STRATEGY.atrBars;
    if (!(atr > 0)) continue;

    const prior = bars.slice(i - STRATEGY.entryChannelBars, i);
    const entryHigh = max(prior.map(x => x.high));
    const entryLow = min(prior.map(x => x.low));

    let action = null;
    let trigger = null;
    if (bar.close > entryHigh) {
      action = "BUY";
      trigger = entryHigh;
    } else if (bar.close < entryLow) {
      action = "SELL";
      trigger = entryLow;
    }
    if (!action) continue;
    if (action !== STRATEGY.allowedSide) continue;

    diagnostics.channelBreakouts++;

    const range = bar.high - bar.low;
    if (!(range > 0)) continue;

    const closeLocation =
      action === "BUY"
        ? (bar.close - bar.low) / range
        : (bar.high - bar.close) / range;
    const bodyFraction = Math.abs(bar.close - bar.open) / range;
    const displacementATR =
      action === "BUY"
        ? (bar.close - trigger) / atr
        : (trigger - bar.close) / atr;

    if (!(closeLocation >= STRATEGY.closeLocationMin)) continue;
    diagnostics.closeLocationPass++;

    if (!(bodyFraction >= STRATEGY.bodyFractionMin)) continue;
    diagnostics.bodyLocationPass++;

    if (!(displacementATR >= STRATEGY.displacementAtrMin)) continue;
    diagnostics.displacementPass++;

    entries[bar.lastM15Time] = {
      action,
      atr,
      h1Time: bar.time,
      trigger,
      quality: { closeLocation, bodyFraction, displacementATR }
    };
  }

  return { bars, entries, diagnostics };
}

for (const symbol of SYMBOLS) {
  Object.assign(prepared.pairs[symbol], buildSignals(prepared.pairs[symbol]));
}

function conversionAt(pair, price) {
  const m = pair.metadata;
  if (m.quotingCurrency === "USD") return 1;
  if (m.baseCurrency === "USD") return 1 / price;
  return NaN;
}

function fixedMinLotSize({ pair, entry, stop, equity, costPrice }) {
  const m = pair.metadata;

  if (
    FIXED_LOTS + 1e-12 < m.minLot ||
    FIXED_LOTS > m.maxLot + 1e-12 ||
    Math.abs(FIXED_LOTS / m.lotStep - Math.round(FIXED_LOTS / m.lotStep)) > 1e-8
  ) {
    return { skip: "FIXED_LOT_UNSUPPORTED" };
  }

  const distance = Math.abs(entry - stop);
  const conversion = Math.max(conversionAt(pair, entry), conversionAt(pair, stop));
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
    plannedRiskPercent: riskAmount / equity * 100,
    perLotRisk
  };
}

function simulate({ from, to, costs, symbols = ACTIVE_SYMBOLS }) {
  const activeSymbols = ACTIVE_SYMBOLS.filter(s => symbols.includes(s));
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

  const close = (p, price, time, reason) => {
    const pair = prepared.pairs[p.symbol];
    const move =
      (p.side === "BUY" ? price - p.entryPrice : p.entryPrice - price) -
      p.costPrice;
    const conversion =
      pair.metadata.quotingCurrency === "USD" ? 1 : 1 / price;
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

    // Adverse opening gap is executable at this bar's open and can free capacity.
    if (position) {
      const candle = indexed[position.symbol].get(time);
      if (candle) {
        const buy = position.side === "BUY";
        const gapStop = buy
          ? candle.open <= position.stopLoss
          : candle.open >= position.stopLoss;
        if (gapStop) close(position, candle.open, time, "GAP_STOP");
      }
    }

    // Entries happen at the M15 open, before any later intrabar exit can free capacity.
    for (const symbol of activeSymbols) {
      const candle = indexed[symbol].get(time);
      if (!candle) continue;

      const signalTime = time - M15;
      const signal = prepared.pairs[symbol].entries[signalTime];
      if (!signal || signalTime < from) continue;

      const date = new Date(time);
      const hour = date.getUTCHours();

      if (
        [0, 6].includes(date.getUTCDay()) ||
        hour < STRATEGY.entryHourUtcStart ||
        hour >= STRATEGY.entryHourUtcEndExclusive
      ) {
        skip("ENTRY_OUTSIDE_SESSION");
        continue;
      }

      if (
        newsBlocked(
          symbol,
          signalTime,
          time,
          STRATEGY.newsPolicy,
          prepared.blackouts
        )
      ) {
        skip("NEWS_BLOCK");
        continue;
      }

      if (position) {
        skip("PORTFOLIO_CAPACITY");
        continue;
      }

      if (dailyEntries >= STRATEGY.maxEntriesPerUtcDay) {
        skip("DAILY_TRADE_LIMIT");
        continue;
      }

      if (
        dayPnl <= -dayStart * 0.02 ||
        weekPnl <= -weekStart * 0.05 ||
        losing >= 2 ||
        equity <= 0
      ) {
        skip("LOSS_GUARD");
        continue;
      }

      if (lastExit[symbol] != null && time - lastExit[symbol] <= 4 * M15) {
        skip("POST_TRADE_COOLDOWN");
        continue;
      }

      const pair = prepared.pairs[symbol];
      const m = pair.metadata;
      const buy = signal.action === "BUY";
      const entryPrice = candle.open;
      const stopLoss =
        entryPrice +
        (buy ? -1 : 1) * STRATEGY.atrStopMultiple * signal.atr;
      const distance = Math.abs(entryPrice - stopLoss);
      const stopPips = distance / m.pipSize;

      if (!(stopPips > 0)) {
        skip("INVALID_STOP");
        continue;
      }

      if (
        costs.spreadPips > 3 ||
        costs.spreadPips / stopPips > 0.2 + 1e-12
      ) {
        skip("SPREAD_BLOCK");
        continue;
      }

      const costPrice =
        (costs.spreadPips + 2 * costs.slippagePips) * m.pipSize;

      const size = fixedMinLotSize({
        pair,
        entry: entryPrice,
        stop: stopLoss,
        equity,
        costPrice
      });

      if (size.skip) {
        skip(size.skip);
        continue;
      }

      const takeProfit =
        entryPrice +
        (buy ? 1 : -1) * STRATEGY.rewardRiskTarget * distance;

      position = {
        symbol,
        side: signal.action,
        signalTime,
        entryTime: time,
        entryPrice,
        entryEquity: equity,
        stopLoss,
        takeProfit,
        stopPips,
        atr: signal.atr,
        trigger: signal.trigger,
        h1SignalTime: signal.h1Time,
        quality: signal.quality,
        costPrice,
        hardRiskCeilingPercent: HARD_RISK_CEILING_PERCENT,
        ...size
      };

      dailyEntries++;
      break;
    }

    // Conservative same-bar ordering: stop wins if both stop and target are touched.
    if (position) {
      const candle = indexed[position.symbol].get(time);
      if (candle) {
        const buy = position.side === "BUY";
        const stopHit = buy
          ? candle.low <= position.stopLoss
          : candle.high >= position.stopLoss;
        const targetHit = buy
          ? candle.high >= position.takeProfit
          : candle.low <= position.takeProfit;

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
    if (last) {
      close(position, last.close, last.time + M15 - 1, "END_OF_WINDOW");
    }
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

  const planned = trades.map(t => t.plannedRiskPercent);
  const sizingDiagnostics = {
    minLots: trades.length ? min(trades.map(t => t.lots)) : null,
    maxLots: trades.length ? max(trades.map(t => t.lots)) : null,
    averagePlannedRiskPercent: planned.length
      ? sum(planned, x => x) / planned.length
      : null,
    maxPlannedRiskPercent: planned.length ? max(planned) : null,
    minLotRiskSkips: skips.MIN_LOT_RISK_SKIP || 0
  };

  return {
    from,
    to,
    costs,
    metrics,
    byPair,
    trades,
    equityCurve: curve,
    sizingDiagnostics
  };
}

function windowSummary(validation) {
  return windows.map(window => {
    const prior = validation.trades.filter(t => t.exitTime < window.from);
    const startingBalance =
      STARTING_BALANCE + sum(prior, t => t.pnl);
    const rows = validation.trades.filter(
      t => t.exitTime >= window.from && t.exitTime < window.to
    );
    return {
      from: window.from,
      to: window.to,
      ...summarize(rows, startingBalance)
    };
  });
}

function eligibility(validation, stress, windowRows) {
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
  if (windowRows.filter(w => w.totalR > 0).length < 2) {
    reasons.push("INCONSISTENT_WINDOWS");
  }

  const windowGains = windowRows.map(
    w => Math.max(0, w.endingBalance - w.startingBalance)
  );
  if (
    Math.max(...windowGains) / (sum(windowGains, x => x) || 1) > 0.75
  ) {
    reasons.push("WINDOW_GAIN_CONCENTRATION");
  }

  return reasons;
}

function verify(result) {
  let balance = STARTING_BALANCE;
  const daily = {};

  for (const t of result.trades) {
    assert.equal(t.entryTime, t.signalTime + M15, "ENTRY_NOT_NEXT_M15_OPEN");
    assert.equal(t.side, STRATEGY.allowedSide, "NON_SELL_TRADE_EXECUTED");
    assert.equal(t.symbol, "GBPUSD", "NON_GBPUSD_TRADE_EXECUTED");
    assert.equal(t.lots, FIXED_LOTS, "FIXED_LOT_DRIFT");
    assert.ok(
      t.riskAmount <=
        t.entryEquity * HARD_RISK_CEILING_PERCENT / 100 + 1e-8,
      "HARD_RISK_CEILING_BREACH"
    );

    const distance = Math.abs(t.entryPrice - t.stopLoss);
    const targetDistance = Math.abs(t.takeProfit - t.entryPrice);
    assert.ok(
      Math.abs(targetDistance / distance - STRATEGY.rewardRiskTarget) < 1e-10,
      "TARGET_R_DRIFT"
    );

    const day = dayKey(t.entryTime);
    daily[day] = (daily[day] || 0) + 1;
    assert.ok(
      daily[day] <= STRATEGY.maxEntriesPerUtcDay,
      "DAILY_ENTRY_LIMIT_BREACH"
    );

    balance += t.pnl;
  }

  assert.ok(
    Math.abs(balance - result.metrics.endingBalance) < 1e-7,
    "ENDING_BALANCE_MISMATCH"
  );
}

const descriptive = simulate({
  from: prepared.from,
  to: prepared.to,
  costs: COSTS.BASE
});
const validation = simulate({
  from: validationFrom,
  to: prepared.to,
  costs: COSTS.BASE
});
const stress = simulate({
  from: validationFrom,
  to: prepared.to,
  costs: COSTS.STRESS
});
const windowRows = windowSummary(validation);

for (const result of [descriptive, validation, stress]) verify(result);

const rejectionReasons = eligibility(validation, stress, windowRows);
const direction = side =>
  summarize(
    validation.trades.filter(t => t.side === side),
    STARTING_BALANCE
  );

const sourceHash = createHash("sha256")
  .update(await fs.readFile(new URL(import.meta.url)))
  .digest("hex");

const signalDiagnostics = Object.fromEntries(
  ACTIVE_SYMBOLS.map(symbol => [symbol, prepared.pairs[symbol].diagnostics])
);

const output = {
  experiment: STRATEGY.id,
  recordedProtocol: "docs/H1_DISPLACEMENT_GBPUSD_SELL_ONLY_V1_PROTOCOL.md",
  inputHash: prepared.inputHash,
  sourceHash,
  strategy: STRATEGY,
  validationFrom,
  fullFrom: prepared.from,
  fullTo: prepared.to,
  signalDiagnostics,
  descriptive,
  validation,
  stress,
  windows: windowRows,
  contributionByDirection: {
    BUY: direction("BUY"),
    SELL: direction("SELL")
  },
  eligible: rejectionReasons.length === 0,
  rejectionReasons,
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

const rows = [[
  "scope",
  "trades",
  "endingBalance",
  "returnPercent",
  "profitFactor",
  "expectancyR",
  "maxDrawdownPercent",
  "wins",
  "losses",
  "winRate",
  "averagePlannedRiskPercent",
  "maxPlannedRiskPercent",
  "minLotRiskSkips"
]];

for (const [name, result] of [
  ["descriptive", descriptive],
  ["validation", validation],
  ["stress", stress]
]) {
  rows.push([
    name,
    result.metrics.tradeCount,
    result.metrics.endingBalance,
    result.metrics.returnPercent,
    result.metrics.profitFactor ?? "",
    result.metrics.expectancyR,
    result.metrics.maxDrawdownPercent,
    result.metrics.wins,
    result.metrics.losses,
    result.metrics.winRate,
    result.sizingDiagnostics.averagePlannedRiskPercent ?? "",
    result.sizingDiagnostics.maxPlannedRiskPercent ?? "",
    result.sizingDiagnostics.minLotRiskSkips
  ]);
}

await fs.writeFile(
  path.join(out, "summary.csv"),
  rows.map(row => row.join(",")).join("\n") + "\n"
);

console.log(JSON.stringify({
  stage: "complete",
  strategy: STRATEGY.id,
  inputHash: prepared.inputHash,
  signalDiagnostics,
  eligible: output.eligible,
  rejectionReasons,
  validation: validation.metrics,
  validationSizing: validation.sizingDiagnostics,
  stress: stress.metrics,
  stressSizing: stress.sizingDiagnostics,
  windows: windowRows.map(w => ({
    from: w.from,
    to: w.to,
    trades: w.tradeCount,
    totalR: w.totalR,
    returnPercent: w.returnPercent
  })),
  byPair: Object.fromEntries(
    Object.entries(validation.byPair).map(([symbol, row]) => [
      symbol,
      {
        trades: row.tradeCount,
        totalR: row.totalR,
        profitFactor: row.profitFactor,
        returnPercent: row.returnPercent
      }
    ])
  ),
  byDirection: {
    BUY: output.contributionByDirection.BUY,
    SELL: output.contributionByDirection.SELL
  },
  out
}));
