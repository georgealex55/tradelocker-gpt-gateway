import { M15, SYMBOLS, riskPercent, newsBlocked } from './policies.mjs';

const sum = (a, fn) => a.reduce((n, x) => n + fn(x), 0);
const dayKey = t => new Date(t).toISOString().slice(0, 10);
const weekKey = t => { const d = new Date(t); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); return dayKey(+d); };

export function summarize(trades, startingBalance = 200, skips = {}, curve = []) {
  const wins = trades.filter(t => t.pnl > 0), losses = trades.filter(t => t.pnl < 0);
  const grossWin = sum(wins, t => t.pnl), grossLoss = -sum(losses, t => t.pnl);
  const totalR = sum(trades, t => t.rMultiple), pnl = sum(trades, t => t.pnl);
  let equity = startingBalance, peak = equity, dd = 0, ddPct = 0, streak = 0, longest = 0;
  const points = curve.length ? curve : trades.map(t => ({ equity: equity += t.pnl }));
  for (const p of points) { peak = Math.max(peak, p.equity); dd = Math.max(dd, peak - p.equity); ddPct = Math.max(ddPct, peak > 0 ? (peak - p.equity) / peak * 100 : 0); }
  for (const t of trades) { streak = t.pnl < 0 ? streak + 1 : 0; longest = Math.max(longest, streak); }
  const stops = trades.map(t => t.stopPips).sort((a, b) => a - b);
  const side = s => { const rows = trades.filter(t => t.side === s); return { trades: rows.length, totalR: sum(rows, t => t.rMultiple) }; };
  return {
    startingBalance, endingBalance: startingBalance + pnl, returnPercent: pnl / startingBalance * 100,
    totalR, tradeCount: trades.length, wins: wins.length, losses: losses.length,
    breakeven: trades.length - wins.length - losses.length,
    winRate: trades.length ? wins.length / trades.length * 100 : 0,
    profitFactor: grossLoss > 0 ? grossWin / grossLoss : null,
    profitFactorState: grossLoss > 0 ? 'FINITE' : grossWin > 0 ? 'NO_LOSSES' : 'NO_GAINS',
    expectancyR: trades.length ? totalR / trades.length : 0,
    averageRealizedR: trades.length ? totalR / trades.length : 0,
    maxDrawdownPercent: ddPct, maxDrawdownDollars: dd, longestLosingStreak: longest,
    averageStopPips: stops.length ? sum(stops, x => x) / stops.length : null,
    medianStopPips: stops.length ? (stops[Math.floor((stops.length - 1) / 2)] + stops[Math.floor(stops.length / 2)]) / 2 : null,
    minLotSkips: skips.MIN_LOT_RISK_SKIP || 0, spreadBlocked: skips.SPREAD_BLOCK || 0,
    newsBlocked: skips.NEWS_BLOCK || 0, capacityBlocked: skips.PORTFOLIO_CAPACITY || 0,
    long: side('BUY'), short: side('SELL'), skips
  };
}

export function sizePosition({ entry, stop, metadata: m, equity, percent, committedRisk, costPrice, maxPositions }) {
  const distance = Math.abs(entry - stop);
  const conversion = price => m.quotingCurrency === 'USD' ? 1 : m.baseCurrency === 'USD' ? 1 / price : NaN;
  // Budget includes modeled costs and conservative conversion at entry/stop.
  const perLot = (distance + costPrice) * m.lotSize * Math.max(conversion(entry), conversion(stop));
  const perTradeBudget = equity * percent / 100;
  // Deliberate total-risk cap: 1% for one slot, 1.5% for two slots.
  const available = Math.min(perTradeBudget, equity * (maxPositions === 2 ? 0.015 : 0.01) - committedRisk);
  if (!(perLot > 0) || !(available > 0)) return { skip: 'PORTFOLIO_RISK_CAP' };
  const lots = Math.floor((Math.min(available / perLot, 0.01, m.maxLot) + 1e-12) / m.lotStep) * m.lotStep;
  if (lots + 1e-12 < m.minLot) return { skip: available + 1e-9 < perTradeBudget ? 'PORTFOLIO_RISK_CAP' : 'MIN_LOT_RISK_SKIP' };
  const riskAmount = lots * perLot;
  if (riskAmount > available + 1e-8) throw new Error('SIZING_EXCEEDS_BUDGET');
  return { lots, units: lots * m.lotSize, riskAmount, targetRiskAmount: perTradeBudget, conversion: conversion(entry) };
}

export function exitAt(position, candle) {
  const buy = position.side === 'BUY';
  // An adverse opening gap fills at the observed open, never at a stale stop.
  if (buy ? candle.open <= position.stopLoss : candle.open >= position.stopLoss) return { price: candle.open, reason: 'GAP_STOP' };
  const stop = buy ? candle.low <= position.stopLoss : candle.high >= position.stopLoss;
  const target = buy ? candle.high >= position.takeProfit : candle.low <= position.takeProfit;
  if (stop) return { price: position.stopLoss, reason: 'STOP_LOSS' };
  if (target) return { price: position.takeProfit, reason: 'TAKE_PROFIT' };
  return null;
}

// Pure simulation: no broker, network, database, or order imports.
export function simulate({ prepared, combo, costs, from, to, schedule = [], symbols = SYMBOLS, startingBalance = 200 }) {
  const { pairs, blackouts = [] } = prepared;
  const activeSymbols = SYMBOLS.filter(s => symbols.includes(s));
  const indexed = Object.fromEntries(activeSymbols.map(s => [s, new Map(pairs[s].candles.filter(c => c.time >= from && c.time < to).map(c => [c.time, c]))]));
  const times = [...new Set(activeSymbols.flatMap(s => [...indexed[s].keys()]))].sort((a, b) => a - b);
  let equity = startingBalance, open = [], trades = [], curve = [{ time: from, equity: startingBalance }], skips = {};
  let currentDay, currentWeek, dayStart = startingBalance, weekStart = startingBalance, dayPnl = 0, weekPnl = 0, losing = 0;
  let dailyEntries = {}, lastExit = {}, peakCommittedRisk = 0;
  const skip = k => { skips[k] = (skips[k] || 0) + 1; };
  const close = (p, price, time, reason) => {
    const move = (p.side === 'BUY' ? price - p.entryPrice : p.entryPrice - price) - p.costPrice;
    const m = pairs[p.symbol].metadata;
    const conversion = m.quotingCurrency === 'USD' ? 1 : 1 / price;
    const pnl = move * p.units * conversion;
    const trade = { ...p, exitPrice: price, exitTime: time, pnl, rMultiple: pnl / p.riskAmount, reason };
    trades.push(trade); equity += pnl; dayPnl += pnl; weekPnl += pnl;
    losing = pnl < 0 ? losing + 1 : 0; lastExit[p.symbol] = time;
    curve.push({ time, equity });
  };
  for (const time of times) {
    const day = dayKey(time), week = weekKey(time);
    if (day !== currentDay) { currentDay = day; dayStart = equity; dayPnl = 0; losing = 0; dailyEntries = {}; }
    if (week !== currentWeek) { currentWeek = week; weekStart = equity; weekPnl = 0; }
    // All opens precede all intrabar exits: an exit later in this bar cannot fund an earlier entry.
    for (const symbol of activeSymbols) {
      const candle = indexed[symbol].get(time);
      if (!candle) continue;
      const selection = schedule.find(w => time >= w.from && time < w.to);
      const adx = combo.parameters === 'PAIR_SPECIFIC' ? selection?.selected?.[symbol] ?? 20 : 20;
      const signal = pairs[symbol].tapes[adx]?.[time - M15];
      if (!signal || time - M15 < from) continue;
      const date = new Date(time), hour = date.getUTCHours();
      if ([0, 6].includes(date.getUTCDay()) || hour < 7 || hour >= 16) { skip('ENTRY_OUTSIDE_SESSION'); continue; }
      if (newsBlocked(symbol, time - M15, time, combo.news, blackouts)) { skip('NEWS_BLOCK'); continue; }
      const stop = signal.stopLoss, buy = signal.action === 'BUY';
      if (!(stop > 0) || !(buy ? stop < candle.open : stop > candle.open)) { skip('ENTRY_GAP_INVALIDATES_LEVELS'); continue; }
      const m = pairs[symbol].metadata, stopPips = Math.abs(candle.open - stop) / m.pipSize;
      if (costs.spreadPips > 3 || costs.spreadPips / stopPips > 0.2 + 1e-12) { skip('SPREAD_BLOCK'); continue; }
      if (open.length >= combo.positions || open.some(p => p.symbol === symbol)) { skip('PORTFOLIO_CAPACITY'); continue; }
      if ((combo.daily === 'PER_PAIR' ? dailyEntries[symbol] || 0 : sum(Object.values(dailyEntries), n => n)) >= 2) { skip('DAILY_TRADE_LIMIT'); continue; }
      if (dayPnl <= -dayStart * 0.02 || weekPnl <= -weekStart * 0.05 || losing >= 2 || equity <= 0) { skip('LOSS_GUARD'); continue; }
      if (lastExit[symbol] != null && time - lastExit[symbol] <= 4 * M15) { skip('POST_TRADE_COOLDOWN'); continue; }
      const costPrice = (costs.spreadPips + 2 * costs.slippagePips) * m.pipSize;
      const percent = riskPercent(combo.risk, signal), committedRisk = sum(open, p => p.riskAmount);
      const size = sizePosition({ entry: candle.open, stop, metadata: m, equity, percent, committedRisk, costPrice, maxPositions: combo.positions });
      if (size.skip) { skip(size.skip); continue; }
      const distance = Math.abs(candle.open - stop);
      open.push({ symbol, side: signal.action, signalTime: time - M15, entryTime: time,
        entryPrice: candle.open, stopLoss: stop, takeProfit: candle.open + (buy ? 1 : -1) * 1.8 * distance,
        stopPips, costPrice, riskPolicyPercent: percent, selectedAdx: adx, ...size });
      dailyEntries[symbol] = (dailyEntries[symbol] || 0) + 1;
      peakCommittedRisk = Math.max(peakCommittedRisk, committedRisk + size.riskAmount);
    }
    const remaining = [];
    for (const p of open) {
      const candle = indexed[p.symbol].get(time);
      const exit = candle ? exitAt(p, candle) : null;
      if (exit) close(p, exit.price, time + M15 - 1, exit.reason); else remaining.push(p);
    }
    open = remaining;
  }
  for (const p of open) {
    const last = [...indexed[p.symbol].values()].at(-1);
    close(p, last.close, last.time + M15 - 1, 'END_OF_WINDOW');
  }
  const metrics = summarize(trades, startingBalance, skips, curve);
  const byPair = Object.fromEntries(activeSymbols.map(s => [s, summarize(trades.filter(t => t.symbol === s), startingBalance)]));
  return { metrics, byPair, trades, equityCurve: curve, peakCommittedRisk, from, to };
}
