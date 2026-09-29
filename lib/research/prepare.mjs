import { createIndicatorEngine, normalizeCandle } from '../indicators.js';
import { createForexStrategyV1 } from '../forexStrategyV1.js';
import { createCompletedTimeframeAggregator } from '../timeframes.js';
import { FOREX_STRATEGY_V1_CONFIG as BASE } from '../forexStrategyV1Config.js';
import { SYMBOLS, M15, ADX_CANDIDATES, REQUIRED_EVENTS, COSTS, ENGINE_VERSION, combinations, rankScore } from './policies.mjs';
import { simulate, summarize } from './engine.mjs';
import { createHash } from 'node:crypto';

export const fingerprint = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');

export function validateDataset(input, { now = Date.now() } = {}) {
  if (input?.source !== 'tradelocker') throw new Error('A frozen TradeLocker dataset is required');
  const pairs = {}, coverage = {};
  for (const symbol of SYMBOLS) {
    const raw = input.pairs?.[symbol], m = raw?.metadata;
    if (!m || m.symbol !== symbol || m.baseCurrency + m.quotingCurrency !== symbol) throw new Error(`Invalid ${symbol} metadata`);
    for (const field of ['tradableInstrumentId', 'tradeRouteId', 'infoRouteId', 'pipSize', 'lotSize', 'minLot', 'lotStep', 'maxLot'])
      if (!Number.isFinite(m[field]) || m[field] <= 0) throw new Error(`Missing verified ${symbol}.${field}`);
    if (!m.verifiedAt || !m.source || !['BID', 'MID', 'ASK'].includes(m.barSource)) throw new Error(`Missing ${symbol} metadata provenance`);
    if (raw.truncated) throw new Error(`Truncated ${symbol} history`);
    if (!Array.isArray(raw.candles) || raw.candles.length < 2000 || raw.candles.length > 100000) throw new Error(`Insufficient or excessive ${symbol} history`);
    const candles = raw.candles.map(normalizeCandle);
    let prior = -Infinity, weekdayGapCount = 0;
    for (const c of candles) {
      if (!Number.isSafeInteger(c.time) || c.time % M15 !== 0 || c.time <= prior || c.time + M15 > now || c.low <= 0) throw new Error(`Invalid, duplicate, unsorted or incomplete ${symbol} candle`);
      if (prior > 0 && c.time - prior > M15 && ![0, 6].includes(new Date(c.time).getUTCDay())) weekdayGapCount++;
      prior = c.time;
    }
    pairs[symbol] = { metadata: m, candles };
    coverage[symbol] = { bars: candles.length, from: candles[0].time, to: candles.at(-1).time + M15, gapCount: weekdayGapCount };
  }
  const commonFrom = Math.max(...Object.values(coverage).map(c => c.from));
  const commonTo = Math.min(...Object.values(coverage).map(c => c.to));

  // Protocol amendment (2026-09-27, before historical outcomes were observed):
  // harmonize on complete H1 hours only. If any pair is missing any M15 candle in
  // an hour, remove that entire hour from every pair. This preserves identical
  // timelines and complete H1 aggregation without forward-filling or inventing bars.
  const timeSets = Object.fromEntries(
    SYMBOLS.map(symbol => [
      symbol,
      new Set(pairs[symbol].candles
        .filter(c => c.time >= commonFrom && c.time < commonTo)
        .map(c => c.time))
    ])
  );
  const intersection = [...timeSets[SYMBOLS[0]]]
    .filter(time => SYMBOLS.every(symbol => timeSets[symbol].has(time)))
    .sort((a, b) => a - b);
  // Include hours observed by any pair, even when one pair is missing all four
  // candles. Otherwise those dropped hours vanish from the audit report.
  const hourCounts = new Map(SYMBOLS.flatMap(symbol => [...timeSets[symbol]])
    .map(time => [Math.floor(time / 3600000) * 3600000, 0]));
  for (const time of intersection) {
    const hour = Math.floor(time / 3600000) * 3600000;
    hourCounts.set(hour, (hourCounts.get(hour) || 0) + 1);
  }
  const validHours = new Set(
    [...hourCounts.entries()].filter(([, count]) => count === 4).map(([hour]) => hour)
  );
  const droppedIncompleteHours = [...hourCounts.entries()]
    .filter(([, count]) => count !== 4)
    .map(([hour, commonBars]) => ({ hour, commonBars }))
    .sort((a, b) => a.hour - b.hour);

  for (const symbol of SYMBOLS) {
    pairs[symbol].candles = pairs[symbol].candles.filter(c =>
      c.time >= commonFrom &&
      c.time < commonTo &&
      validHours.has(Math.floor(c.time / 3600000) * 3600000)
    );
  }

  // Warmup must include at least 250 complete H1 bars for every pair.
  const warmupEnds = SYMBOLS.map(s => {
    let count = 0; const groups = new Map();
    for (const c of pairs[s].candles) {
      const hour = Math.floor(c.time / 3600000) * 3600000;
      groups.set(hour, (groups.get(hour) || 0) + 1);
      if (groups.get(hour) === 4 && ++count === 250) return hour + 3600000;
    }
    throw new Error(`Insufficient H1 warmup for ${s}`);
  });
  const from = Math.max(...warmupEnds, Date.parse(input.requestedFrom));
  const to = Math.min(commonTo, Date.parse(input.requestedTo));
  if (!Number.isFinite(from) || !Number.isFinite(to) || to - from < 180 * 86400000) throw new Error('At least 180 common calendar days after warmup are required');
  const cal = input.calendar;
  if (!cal || cal.complete !== true || ![cal.from,cal.to,cal.reviewedAt].every(v => Number.isFinite(Date.parse(v))) || Date.parse(cal.from) > from || Date.parse(cal.to) < to) throw new Error('CALENDAR_COVERAGE_INCOMPLETE');
  for (const name of REQUIRED_EVENTS) {
    const scope = cal.coverage?.find(c => c.event === name);
    if (!scope?.source || ![scope.from,scope.to].every(v => Number.isFinite(Date.parse(v))) || Date.parse(scope.from) > from || Date.parse(scope.to) < to) throw new Error(`CALENDAR_COVERAGE_INCOMPLETE:${name}`);
    if (!cal.blackouts?.some(b => b.event === name && Date.parse(b.eventTime) >= from && Date.parse(b.eventTime) < to)) throw new Error(`CALENDAR_EVENTS_MISSING:${name}`);
  }
  const blackouts = (cal.blackouts || []).map(b => {
    const start = Date.parse(b.from), end = Date.parse(b.to), event = Date.parse(b.eventTime);
    const central = /DECISION/.test(b.event);
    if (![start, end, event].every(Number.isFinite) || start > event || end < event || !b.source || !Array.isArray(b.currencies) || !b.currencies.length) throw new Error('Invalid calendar blackout/provenance');
    if (event - start < (central ? 90 : 60) * 60000 || end - event < (central ? 60 : 30) * 60000) throw new Error('Calendar windows weaker than canonical windows');
    return b;
  });
  if (!blackouts.length) throw new Error('CALENDAR_EMPTY');
  blackouts.push(...BASE.eventRisk.fixedBlackouts);
  const timeline = SYMBOLS.map(s => new Set(pairs[s].candles.filter(c => c.time >= from && c.time < to).map(c => c.time)));
  const union = new Set(timeline.flatMap(s => [...s]));
  const missingByPair = Object.fromEntries(SYMBOLS.map((s, i) => [s, [...union].filter(t => !timeline[i].has(t)).length]));
  if (Object.values(missingByPair).some(n => n > 0)) throw new Error(`COMMON_TIMELINE_MISMATCH:${JSON.stringify(missingByPair)}`);
  return { pairs, blackouts, from, to, commonFrom, commonTo, coverage, missingByPair, droppedIncompleteHours, calendar: cal, inputHash: fingerprint(input), engineVersion: ENGINE_VERSION };
}

export function preparePair(pair) {
  const entry = createIndicatorEngine(BASE.indicators.entry);
  const higher = createIndicatorEngine(BASE.indicators.regime);
  const aggregator = createCompletedTimeframeAggregator('1H');
  let higherSnapshot = higher.snapshot(), higherCandle = null, h1BarCount = 0;
  const evaluators = Object.fromEntries(ADX_CANDIDATES.map(adx => [adx, createForexStrategyV1({
    symbol: pair.metadata.symbol,
    config: { ...BASE, setup: { ...BASE.setup, h1MinimumAdx: adx }, eventRisk: { ...BASE.eventRisk, fixedBlackouts: [] } }
  })]));
  const tapes = Object.fromEntries(ADX_CANDIDATES.map(a => [a, {}]));
  for (const candle of pair.candles) {
    const indicators = entry.update(candle);
    const completed = aggregator.add(candle);
    if (completed) {
      if (h1BarCount !== 4) throw new Error('INCOMPLETE_H1_BUCKET: repair history before research');
      higherCandle = completed; higherSnapshot = higher.update(completed); h1BarCount = 0;
    }
    h1BarCount++;
    for (const adx of ADX_CANDIDATES) {
      const decision = evaluators[adx]({ candle, indicators, higherTimeframe: { candle: higherCandle, indicators: higherSnapshot }, spreadPips: COSTS.BASE.spreadPips });
      if (decision.action !== 'HOLD') tapes[adx][candle.time] = decision;
    }
  }
  return { ...pair, tapes };
}

export function fitSchedule(prepared) {
  const { from, to } = prepared;
  // First half trains, remaining half is three expanding held-forward windows.
  const first = Math.ceil((from + (to - from) / 2) / M15) * M15;
  const width = (to - first) / 3, schedule = [];
  const trainingPolicy = { ...combinations()[0], risk: '0.75', parameters: 'SHARED' };
  for (let i = 0; i < 3; i++) {
    const start = Math.ceil((first + i * width) / M15) * M15;
    const end = i === 2 ? to : Math.ceil((first + (i + 1) * width) / M15) * M15;
    const selected = {}, evidence = {};
    for (const symbol of SYMBOLS) {
      const candidates = ADX_CANDIDATES.map(adx => {
        const train = simulate({ prepared, combo: { ...trainingPolicy, parameters: 'PAIR_SPECIFIC' }, costs: COSTS.BASE, from, to: start,
          symbols: [symbol], schedule: [{ from, to: start, selected: { [symbol]: adx } }] });
        // Exclude artificial boundary liquidations from parameter selection.
        const m = summarize(train.trades.filter(t => t.reason !== 'END_OF_WINDOW'));
        return { adx, metrics: m, score: m.tradeCount >= 10 ? rankScore(m, 'BALANCED') : null };
      });
      const eligible = candidates.filter(c => c.score != null).sort((a, b) => b.score - a.score || a.adx - b.adx);
      selected[symbol] = eligible[0]?.adx ?? 20;
      evidence[symbol] = { trainingFrom: from, trainingToExclusive: start, candidates, fallback: eligible.length === 0 };
    }
    schedule.push({ from: start, to: end, selected, evidence });
  }
  return schedule;
}

export function evaluateCombo(prepared, combo, schedule) {
  const descriptive = simulate({ prepared, combo, schedule, costs: COSTS.BASE, from: prepared.from, to: prepared.to });
  const validation = simulate({ prepared, combo, schedule, costs: COSTS.BASE, from: schedule[0].from, to: prepared.to });
  const stress = simulate({ prepared, combo, schedule, costs: COSTS.STRESS, from: schedule[0].from, to: prepared.to });
  const windows = schedule.map(w => ({ from: w.from, to: w.to, ...summarize(validation.trades.filter(t => t.exitTime >= w.from && t.exitTime < w.to), 200 + validation.trades.filter(t => t.exitTime < w.from).reduce((n,t) => n+t.pnl,0)) }));
  const reasons = [];
  const m = validation.metrics;
  if (m.tradeCount < 30) reasons.push('FEWER_THAN_30_VALIDATION_TRADES');
  if (m.expectancyR <= 0 || !(m.profitFactor > 1.1)) reasons.push('WEAK_EXPECTANCY_OR_PF');
  if (m.maxDrawdownPercent > 10) reasons.push('DRAWDOWN_ABOVE_10_PERCENT');
  if (stress.metrics.expectancyR <= 0 || stress.metrics.tradeCount < 20) reasons.push('STRESS_FRAGILE');
  if (windows.filter(w => w.totalR > 0).length < 2) reasons.push('INCONSISTENT_WINDOWS');
  const pairGains = Object.values(validation.byPair).map(p => Math.max(0, p.endingBalance - 200));
  if (Math.max(...pairGains) / (pairGains.reduce((a, b) => a + b, 0) || 1) > 0.75) reasons.push('PAIR_GAIN_CONCENTRATION');
  if (Object.values(validation.byPair).some(p => p.tradeCount < 5)) reasons.push('INSUFFICIENT_PAIR_DISTRIBUTION');
  const windowGains = windows.map(w => Math.max(0, w.endingBalance - w.startingBalance));
  if (Math.max(...windowGains) / (windowGains.reduce((a, b) => a + b, 0) || 1) > 0.75) reasons.push('WINDOW_GAIN_CONCENTRATION');
  return { combo, descriptive, validation, stress, windows, score: rankScore(m, combo.objective), eligible: reasons.length === 0, rejectionReasons: reasons };
}
