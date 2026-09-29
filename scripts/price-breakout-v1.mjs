// Offline research only. No broker, database, credential, or order-client imports.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { validateDataset } from '../lib/research/prepare.mjs';
import { summarize, sizePosition } from '../lib/research/engine.mjs';
import { SYMBOLS, M15, COSTS, newsBlocked } from '../lib/research/policies.mjs';

const H1 = 60 * 60 * 1000;
const STARTING_BALANCE = 200;
const VALIDATED_INPUT_HASH = '61e9d2fae987acf428cb8034e04514d7f84ad01e9e1a2f03d606de09ea740c14';
const STRATEGY = Object.freeze({
  id: 'price-breakout-channel-v1',
  signalTimeframe: 'H1',
  entryChannelBars: 20,
  exitChannelBars: 10,
  atrBars: 14,
  atrStopMultiple: 2,
  riskPercent: 1,
  maxLots: 0.01,
  maxPositions: 1,
  maxEntriesPerUtcDay: 2,
  entryHourUtcStart: 7,
  entryHourUtcEndExclusive: 16,
  newsPolicy: 'STRICT_BLACKOUT'
});

const source = process.argv[2] || 'research-output';
const out = process.argv[3] || 'research-output/price-breakout-v1';
const dataset = JSON.parse(await fs.readFile(path.join(source, 'dataset.rechecked.json'), 'utf8'));
const prepared = validateDataset(dataset);
assert.equal(prepared.inputHash, VALIDATED_INPUT_HASH, 'FROZEN_DATASET_HASH_MISMATCH');
// The original portfolio-144 held-forward boundary is deterministic: first half
// trains, and the second half is split into three equal chronological windows.
const validationFrom = Math.ceil((prepared.from + (prepared.to - prepared.from) / 2) / M15) * M15;
assert.equal(validationFrom, Date.parse('2025-05-14T10:30:00.000Z'), 'VALIDATION_BOUNDARY_DRIFT');
const validationWidth = (prepared.to - validationFrom) / 3;
const schedule = Array.from({ length: 3 }, (_, i) => ({
  from: Math.ceil((validationFrom + i * validationWidth) / M15) * M15,
  to: i === 2 ? prepared.to : Math.ceil((validationFrom + (i + 1) * validationWidth) / M15) * M15
}));

const sum = (rows, fn) => rows.reduce((n, row) => n + fn(row), 0);
const dayKey = t => new Date(t).toISOString().slice(0, 10);
const weekKey = t => {
  const d = new Date(t);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return dayKey(+d);
};
const max = rows => Math.max(...rows);
const min = rows => Math.min(...rows);

function completedH1(candles) {
  const bars = [];
  let bucket = [];
  let bucketHour = null;
  const flush = () => {
    if (!bucket.length) return;
    assert.equal(bucket.length, 4, 'INCOMPLETE_H1_BUCKET');
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

function buildTapes(pair) {
  const bars = completedH1(pair.candles);
  const trueRanges = [];
  const entries = {};
  const exits = {};
  for (let i = 0; i < bars.length; i++) {
    const bar = bars[i];
    const priorClose = i ? bars[i - 1].close : bar.close;
    trueRanges.push(Math.max(bar.high - bar.low, Math.abs(bar.high - priorClose), Math.abs(bar.low - priorClose)));
    if (i < Math.max(STRATEGY.entryChannelBars, STRATEGY.exitChannelBars, STRATEGY.atrBars - 1)) continue;
    const atr = sum(trueRanges.slice(i - STRATEGY.atrBars + 1, i + 1), x => x) / STRATEGY.atrBars;
    const entryWindow = bars.slice(i - STRATEGY.entryChannelBars, i);
    const exitWindow = bars.slice(i - STRATEGY.exitChannelBars, i);
    const entryHigh = max(entryWindow.map(x => x.high));
    const entryLow = min(entryWindow.map(x => x.low));
    const exitHigh = max(exitWindow.map(x => x.high));
    const exitLow = min(exitWindow.map(x => x.low));
    if (bar.close > entryHigh) entries[bar.lastM15Time] = { action: 'BUY', atr, h1Time: bar.time, trigger: entryHigh };
    else if (bar.close < entryLow) entries[bar.lastM15Time] = { action: 'SELL', atr, h1Time: bar.time, trigger: entryLow };
    exits[bar.lastM15Time] = { exitLong: bar.close < exitLow, exitShort: bar.close > exitHigh, h1Time: bar.time, close: bar.close, exitHigh, exitLow };
  }
  return { bars, entries, exits };
}

for (const symbol of SYMBOLS) Object.assign(prepared.pairs[symbol], buildTapes(prepared.pairs[symbol]));

function simulate({ from, to, costs, symbols = SYMBOLS }) {
  const activeSymbols = SYMBOLS.filter(s => symbols.includes(s));
  const indexed = Object.fromEntries(activeSymbols.map(s => [s, new Map(
    prepared.pairs[s].candles.filter(c => c.time >= from && c.time < to).map(c => [c.time, c])
  )]));
  const times = [...new Set(activeSymbols.flatMap(s => [...indexed[s].keys()]))].sort((a, b) => a - b);
  let equity = STARTING_BALANCE;
  let position = null;
  let trades = [];
  let curve = [{ time: from, equity }];
  let skips = {};
  let currentDay, currentWeek, dayStart = equity, weekStart = equity, dayPnl = 0, weekPnl = 0, losing = 0;
  let dailyEntries = 0;
  const lastExit = {};
  const skip = key => { skips[key] = (skips[key] || 0) + 1; };
  const close = (p, price, time, reason) => {
    const m = prepared.pairs[p.symbol].metadata;
    const move = (p.side === 'BUY' ? price - p.entryPrice : p.entryPrice - price) - p.costPrice;
    const conversion = m.quotingCurrency === 'USD' ? 1 : 1 / price;
    const pnl = move * p.units * conversion;
    const trade = { ...p, exitPrice: price, exitTime: time, pnl, rMultiple: pnl / p.riskAmount, reason };
    trades.push(trade);
    equity += pnl; dayPnl += pnl; weekPnl += pnl;
    losing = pnl < 0 ? losing + 1 : 0;
    lastExit[p.symbol] = time;
    curve.push({ time, equity });
    position = null;
  };

  for (const time of times) {
    const day = dayKey(time), week = weekKey(time);
    if (day !== currentDay) { currentDay = day; dayStart = equity; dayPnl = 0; losing = 0; dailyEntries = 0; }
    if (week !== currentWeek) { currentWeek = week; weekStart = equity; weekPnl = 0; }

    // Existing stop gaps take precedence over a discretionary channel exit.
    if (position) {
      const candle = indexed[position.symbol].get(time);
      if (candle) {
        const buy = position.side === 'BUY';
        if (buy ? candle.open <= position.stopLoss : candle.open >= position.stopLoss) {
          close(position, candle.open, time, 'GAP_STOP');
        }
      }
    }

    // Channel exits are generated only by completed H1 bars and execute next M15 open.
    if (position) {
      const candle = indexed[position.symbol].get(time);
      const channel = prepared.pairs[position.symbol].exits[time - M15];
      if (candle && channel && (position.side === 'BUY' ? channel.exitLong : channel.exitShort)) {
        close(position, candle.open, time, 'OPPOSITE_10H_CHANNEL');
      }
    }

    // Entries execute next M15 open. Pair iteration is deterministic.
    for (const symbol of activeSymbols) {
      const candle = indexed[symbol].get(time);
      if (!candle) continue;
      const signalTime = time - M15;
      const signal = prepared.pairs[symbol].entries[signalTime];
      if (!signal || signalTime < from) continue;
      const date = new Date(time), hour = date.getUTCHours();
      if ([0, 6].includes(date.getUTCDay()) || hour < STRATEGY.entryHourUtcStart || hour >= STRATEGY.entryHourUtcEndExclusive) { skip('ENTRY_OUTSIDE_SESSION'); continue; }
      if (newsBlocked(symbol, signalTime, time, STRATEGY.newsPolicy, prepared.blackouts)) { skip('NEWS_BLOCK'); continue; }
      if (position) { skip('PORTFOLIO_CAPACITY'); continue; }
      if (dailyEntries >= STRATEGY.maxEntriesPerUtcDay) { skip('DAILY_TRADE_LIMIT'); continue; }
      if (dayPnl <= -dayStart * 0.02 || weekPnl <= -weekStart * 0.05 || losing >= 2 || equity <= 0) { skip('LOSS_GUARD'); continue; }
      if (lastExit[symbol] != null && time - lastExit[symbol] <= 4 * M15) { skip('POST_TRADE_COOLDOWN'); continue; }

      const m = prepared.pairs[symbol].metadata;
      const buy = signal.action === 'BUY';
      const entryPrice = candle.open;
      const stopLoss = entryPrice + (buy ? -1 : 1) * STRATEGY.atrStopMultiple * signal.atr;
      const stopPips = Math.abs(entryPrice - stopLoss) / m.pipSize;
      if (!(stopPips > 0)) { skip('INVALID_STOP'); continue; }
      if (costs.spreadPips > 3 || costs.spreadPips / stopPips > 0.2 + 1e-12) { skip('SPREAD_BLOCK'); continue; }
      const costPrice = (costs.spreadPips + 2 * costs.slippagePips) * m.pipSize;
      const size = sizePosition({
        entry: entryPrice,
        stop: stopLoss,
        metadata: m,
        equity,
        percent: STRATEGY.riskPercent,
        committedRisk: 0,
        costPrice,
        maxPositions: 1
      });
      if (size.skip) { skip(size.skip); continue; }
      assert.ok(size.lots <= STRATEGY.maxLots + 1e-12, 'LOT_CAP_BREACH');
      position = {
        symbol, side: signal.action, signalTime, entryTime: time, entryPrice, stopLoss,
        stopPips, atr: signal.atr, trigger: signal.trigger, h1SignalTime: signal.h1Time,
        costPrice, riskPolicyPercent: STRATEGY.riskPercent, ...size
      };
      dailyEntries++;
      break;
    }

    // Intrabar stop after open-time exits and entries.
    if (position) {
      const candle = indexed[position.symbol].get(time);
      if (candle) {
        const buy = position.side === 'BUY';
        const hit = buy ? candle.low <= position.stopLoss : candle.high >= position.stopLoss;
        if (hit) close(position, position.stopLoss, time + M15 - 1, 'STOP_LOSS');
      }
    }
  }

  if (position) {
    const last = [...indexed[position.symbol].values()].at(-1);
    if (last) close(position, last.close, last.time + M15 - 1, 'END_OF_WINDOW');
  }
  const metrics = summarize(trades, STARTING_BALANCE, skips, curve);
  const byPair = Object.fromEntries(activeSymbols.map(s => [s, summarize(trades.filter(t => t.symbol === s), STARTING_BALANCE)]));
  return { from, to, costs, metrics, byPair, trades, equityCurve: curve };
}

function windowSummary(validation) {
  return schedule.map(w => {
    const prior = validation.trades.filter(t => t.exitTime < w.from);
    const startingBalance = STARTING_BALANCE + sum(prior, t => t.pnl);
    const rows = validation.trades.filter(t => t.exitTime >= w.from && t.exitTime < w.to);
    return { from: w.from, to: w.to, ...summarize(rows, startingBalance) };
  });
}

function eligibility(validation, stress, windows) {
  const reasons = [];
  const m = validation.metrics;
  if (m.tradeCount < 30) reasons.push('FEWER_THAN_30_VALIDATION_TRADES');
  if (m.expectancyR <= 0 || !(m.profitFactor > 1.1)) reasons.push('WEAK_EXPECTANCY_OR_PF');
  if (m.maxDrawdownPercent > 10) reasons.push('DRAWDOWN_ABOVE_10_PERCENT');
  if (stress.metrics.expectancyR <= 0 || stress.metrics.tradeCount < 20) reasons.push('STRESS_FRAGILE');
  if (windows.filter(w => w.totalR > 0).length < 2) reasons.push('INCONSISTENT_WINDOWS');
  const pairGains = Object.values(validation.byPair).map(p => Math.max(0, p.endingBalance - STARTING_BALANCE));
  if (Math.max(...pairGains) / (sum(pairGains, x => x) || 1) > 0.75) reasons.push('PAIR_GAIN_CONCENTRATION');
  if (Object.values(validation.byPair).some(p => p.tradeCount < 5)) reasons.push('INSUFFICIENT_PAIR_DISTRIBUTION');
  const windowGains = windows.map(w => Math.max(0, w.endingBalance - w.startingBalance));
  if (Math.max(...windowGains) / (sum(windowGains, x => x) || 1) > 0.75) reasons.push('WINDOW_GAIN_CONCENTRATION');
  return reasons;
}

function verify(result) {
  let balance = STARTING_BALANCE;
  const daily = {};
  for (const t of result.trades) {
    assert.equal(t.entryTime, t.signalTime + M15, 'ENTRY_NOT_NEXT_M15_OPEN');
    assert.ok(t.exitTime >= t.entryTime && t.entryTime >= result.from && t.exitTime < result.to, 'TRADE_TIME_OUT_OF_RANGE');
    assert.equal(t.riskPolicyPercent, 1);
    assert.ok(t.lots <= 0.01 + 1e-12);
    assert.ok(t.riskAmount > 0 && t.riskAmount <= balance * 0.01 + 1e-8, 'RISK_BUDGET_BREACH');
    const day = dayKey(t.entryTime);
    daily[day] = (daily[day] || 0) + 1;
    assert.ok(daily[day] <= 2, 'DAILY_ENTRY_LIMIT_BREACH');
    balance += t.pnl;
  }
  assert.ok(Math.abs(balance - result.metrics.endingBalance) < 1e-7, 'ENDING_BALANCE_MISMATCH');
}

const descriptive = simulate({ from: prepared.from, to: prepared.to, costs: COSTS.BASE });
const validation = simulate({ from: validationFrom, to: prepared.to, costs: COSTS.BASE });
const stress = simulate({ from: validationFrom, to: prepared.to, costs: COSTS.STRESS });
const windows = windowSummary(validation);
const administrationBoundary = Date.parse('2025-01-20T17:00:00.000Z');
const pre2025Administration = simulate({ from: prepared.from, to: Math.min(administrationBoundary, prepared.to), costs: COSTS.BASE });
const trump47Period = administrationBoundary < prepared.to
  ? simulate({ from: Math.max(administrationBoundary, prepared.from), to: prepared.to, costs: COSTS.BASE })
  : null;

for (const result of [descriptive, validation, stress, pre2025Administration, trump47Period].filter(Boolean)) verify(result);
const rejectionReasons = eligibility(validation, stress, windows);
const direction = side => summarize(validation.trades.filter(t => t.side === side), STARTING_BALANCE);
const sourceHash = createHash('sha256').update(await fs.readFile(new URL(import.meta.url))).digest('hex');
const output = {
  experiment: STRATEGY.id,
  recordedProtocol: 'docs/PRICE_BREAKOUT_V1_PROTOCOL.md',
  inputHash: prepared.inputHash,
  sourceHash,
  strategy: STRATEGY,
  validationFrom,
  fullFrom: prepared.from,
  fullTo: prepared.to,
  descriptive,
  validation,
  stress,
  windows,
  regimeSplits: {
    pre2025Administration: { label: 'Before 2025-01-20 17:00Z', result: pre2025Administration },
    trump47Period: { label: '2025-01-20 17:00Z forward', result: trump47Period }
  },
  contributionByDirection: { BUY: direction('BUY'), SELL: direction('SELL') },
  eligible: rejectionReasons.length === 0,
  rejectionReasons,
  safety: { offlineOnly: true, productionModified: false, liveExecution: false }
};

await fs.mkdir(out, { recursive: true });
await fs.writeFile(path.join(out, 'results.json'), JSON.stringify(output, null, 2));
const rows = [
  ['scope','trades','endingBalance','returnPercent','profitFactor','expectancyR','maxDrawdownPercent','minLotSkips'],
  ...[
    ['descriptive', descriptive],
    ['validation', validation],
    ['stress', stress],
    ['pre2025Administration', pre2025Administration],
    ...(trump47Period ? [['trump47Period', trump47Period]] : [])
  ].map(([name, r]) => [name, r.metrics.tradeCount, r.metrics.endingBalance, r.metrics.returnPercent, r.metrics.profitFactor ?? '', r.metrics.expectancyR, r.metrics.maxDrawdownPercent, r.metrics.minLotSkips])
];
await fs.writeFile(path.join(out, 'summary.csv'), rows.map(r => r.join(',')).join('\n') + '\n');
console.log(JSON.stringify({
  stage: 'complete',
  strategy: STRATEGY.id,
  eligible: output.eligible,
  rejectionReasons,
  validation: validation.metrics,
  stress: stress.metrics,
  pre2025Administration: pre2025Administration.metrics,
  trump47Period: trump47Period?.metrics ?? null,
  out
}));
