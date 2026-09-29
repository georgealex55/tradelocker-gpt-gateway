// Offline research only. Imports no gateway, database, credentials or order client.
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createIndicatorEngine } from '../lib/indicators.js';
import { createCompletedTimeframeAggregator } from '../lib/timeframes.js';
import { createForexStrategyV1 } from '../lib/forexStrategyV1.js';
import { FOREX_STRATEGY_V1_CONFIG as BASE } from '../lib/forexStrategyV1Config.js';
import { validateDataset, evaluateCombo } from '../lib/research/prepare.mjs';
import { summarize } from '../lib/research/engine.mjs';
import { SYMBOLS, COSTS, M15, combinations } from '../lib/research/policies.mjs';

const source = process.argv[2] || 'research-output';
const out = process.argv[3] || 'research-output/entry-ablation';
const dataset = JSON.parse(await fs.readFile(`${source}/dataset.rechecked.json`, 'utf8'));
const archived = JSON.parse(await fs.readFile(`${source}/results.json`, 'utf8'));
const validated = validateDataset(dataset);
assert.equal(validated.inputHash, '61e9d2fae987acf428cb8034e04514d7f84ad01e9e1a2f03d606de09ea740c14');
const schedule = archived.run.manifest_json.schedule;
const control = combinations().find(c => c.id === 'C049');
assert.equal(control.risk, '1.00');
assert.equal(control.parameters, 'SHARED');
const variants = { ORIGINAL: {}, NO_MACD: { requireMacdHistogramZeroCross: false }, NO_BAR_BREAK: { requirePreviousBarBreak: false } };
const prepared = Object.fromEntries(Object.keys(variants).map(k => [k, { ...validated, pairs: {} }]));
const checks = ['emaTrend', 'pullback', 'rsiReset', 'rsiTrigger', 'macdCross', 'previousBarBreak'];
const counter = () => ({ evaluated: 0, commonBlocked: 0, blockReasons: {}, noH1Direction: 0, eligibleForChecks: 0,
  failures: Object.fromEntries(checks.map(k => [k, 0])), soleFailures: Object.fromEntries(checks.map(k => [k, 0])), signals: 0 });
const diagnostics = {};
function count(c, decision) {
  c.evaluated++;
  if (decision.blocks.length) {
    c.commonBlocked++;
    for (const b of decision.blocks) c.blockReasons[b] = (c.blockReasons[b] || 0) + 1;
    return;
  }
  if (decision.regime.bias === 'NONE') { c.noH1Direction++; return; }
  c.eligibleForChecks++;
  assert.deepEqual(Object.keys(decision.checks), checks);
  const failed = checks.filter(k => !decision.checks[k]);
  for (const k of failed) c.failures[k]++;
  if (failed.length === 1) c.soleFailures[failed[0]]++;
  if (decision.action !== 'HOLD') c.signals++;
}

for (const symbol of SYMBOLS) {
  const pair = validated.pairs[symbol];
  const entry = createIndicatorEngine(BASE.indicators.entry), higher = createIndicatorEngine(BASE.indicators.regime);
  const aggregate = createCompletedTimeframeAggregator('1H');
  let higherSnapshot = higher.snapshot(), higherCandle = null, h1Count = 0;
  const evaluators = Object.fromEntries(Object.entries(variants).map(([name, setup]) => [name, createForexStrategyV1({ symbol,
    config: { ...BASE, setup: { ...BASE.setup, h1MinimumAdx: 20, ...setup }, eventRisk: { ...BASE.eventRisk, fixedBlackouts: [] } }
  })]));
  const tapes = Object.fromEntries(Object.keys(variants).map(k => [k, { 20: {} }]));
  diagnostics[symbol] = { training: counter(), validation: counter(), variantSignals: {} };
  for (const candle of pair.candles) {
    const indicators = entry.update(candle), completed = aggregate.add(candle);
    if (completed) {
      assert.equal(h1Count, 4);
      higherCandle = completed; higherSnapshot = higher.update(completed); h1Count = 0;
    }
    h1Count++;
    for (const [name, evaluate] of Object.entries(evaluators)) {
      const decision = evaluate({ candle, indicators, higherTimeframe: { candle: higherCandle, indicators: higherSnapshot }, spreadPips: COSTS.BASE.spreadPips });
      if (decision.action !== 'HOLD') tapes[name][20][candle.time] = decision;
      if (name === 'ORIGINAL' && candle.time >= validated.from && candle.time < validated.to)
        count(diagnostics[symbol][candle.time < schedule[0].from ? 'training' : 'validation'], decision);
    }
  }
  for (const name of Object.keys(variants)) {
    prepared[name].pairs[symbol] = { ...pair, tapes: tapes[name] };
    diagnostics[symbol].variantSignals[name] = Object.keys(tapes[name][20]).filter(t => Number(t) >= schedule[0].from && Number(t) < validated.to).length;
  }
  for (const [name, key] of [['NO_MACD', 'macdCross'], ['NO_BAR_BREAK', 'previousBarBreak']]) {
    assert.equal(diagnostics[symbol].variantSignals[name] - diagnostics[symbol].validation.signals, diagnostics[symbol].validation.soleFailures[key]);
    for (const [time, signal] of Object.entries(tapes.ORIGINAL[20])) {
      const other = tapes[name][20][time];
      assert.ok(other);
      for (const field of ['action', 'stopLoss', 'takeProfit']) assert.equal(signal[field], other[field]);
    }
  }
  console.log(JSON.stringify({ stage: 'signals', symbol, ...diagnostics[symbol] }));
}

const near = (a, b) => assert.ok(Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) < 1e-7, `${a} != ${b}`);
let ledgerChecks = 0;
function verify(result, costs, input) {
  near(result.metrics.endingBalance, 200 + result.trades.reduce((a, t) => a + t.pnl, 0));
  let balance = 200, lastExit = -Infinity;
  const daily = {};
  for (const t of result.trades) {
    assert.equal(t.entryTime, t.signalTime + M15);
    assert.ok(t.entryTime > lastExit && t.exitTime >= t.entryTime && t.exitTime < result.to);
    assert.ok(t.entryTime >= result.from);
    assert.equal(t.riskPolicyPercent, 1);
    near(t.lots, .01); near(t.units, 1000);
    near(t.targetRiskAmount, balance * .01);
    assert.ok(t.riskAmount > 0 && t.riskAmount <= balance * .01 + 1e-8);
    near(t.entryPrice, input.pairs[t.symbol].candles.find(c => c.time === t.entryTime).open);
    near(Math.abs(t.takeProfit - t.entryPrice), 1.8 * Math.abs(t.entryPrice - t.stopLoss));
    near(t.costPrice, (costs.spreadPips + 2 * costs.slippagePips) * input.pairs[t.symbol].metadata.pipSize);
    const conversion = t.symbol === 'USDCHF' ? 1 / t.exitPrice : 1;
    near(t.pnl, ((t.exitPrice - t.entryPrice) * (t.side === 'BUY' ? 1 : -1) - t.costPrice) * t.units * conversion);
    near(t.rMultiple, t.pnl / t.riskAmount);
    const day = new Date(t.entryTime).toISOString().slice(0, 10);
    daily[day] = (daily[day] || 0) + 1; assert.ok(daily[day] <= 2);
    balance += t.pnl; lastExit = t.exitTime; ledgerChecks++;
  }
  near(balance, result.metrics.endingBalance);
}
const group = (trades, key) => Object.fromEntries([...new Set(trades.map(key))].sort().map(k => [k, summarize(trades.filter(t => key(t) === k))]));
const results = {};
for (const name of Object.keys(variants)) {
  const r = evaluateCombo(prepared[name], control, schedule);
  if (name === 'ORIGINAL') {
    const old = archived.results.find(r => r.combo_id === 'C049').result_json;
    for (const scope of ['descriptive', 'validation', 'stress']) assert.deepEqual(r[scope], old[scope]);
  }
  for (const scope of ['descriptive', 'validation', 'stress']) verify(r[scope], scope === 'stress' ? COSTS.STRESS : COSTS.BASE, prepared[name]);
  const baselineTrades = results.ORIGINAL?.validation.trades || r.validation.trades;
  const tradeKey = t => `${t.symbol}:${t.side}:${t.entryTime}`;
  const baseKeys = new Set(baselineTrades.map(tradeKey)), currentKeys = new Set(r.validation.trades.map(tradeKey));
  results[name] = { ...r, variant: name, setupOverrides: variants[name],
    contributionByPairDirection: group(r.validation.trades, t => `${t.symbol}:${t.side}`),
    contributionByEntryUtcHour: group(r.validation.trades, t => String(new Date(t.entryTime).getUTCHours()).padStart(2, '0')),
    addedTradeContribution: summarize(r.validation.trades.filter(t => !baseKeys.has(tradeKey(t)))),
    removedControlTradeContribution: summarize(baselineTrades.filter(t => !currentKeys.has(tradeKey(t)))) };
  console.log(JSON.stringify({ stage: 'result', variant: name, metrics: r.validation.metrics, stress: r.stress.metrics, eligible: r.eligible }));
}
await fs.mkdir(out, { recursive: true });
const files = ['scripts/entry-ablation.mjs', 'lib/research/prepare.mjs', 'lib/research/engine.mjs', 'lib/research/policies.mjs', 'lib/forexStrategyV1.js', 'lib/forexStrategyV1Config.js', 'lib/indicators.js', 'lib/timeframes.js'];
const sourceHashes = Object.fromEntries(await Promise.all(files.map(async f => [f, createHash('sha256').update(await fs.readFile(f)).digest('hex')])));
const output = { experiment: 'entry-ablation-v1', label: 'Exploratory; previously inspected historical periods, not fresh validation', inputHash: validated.inputHash,
  sourceHashes, control, variants, from: validated.from, to: validated.to, validationFrom: schedule[0].from, schedule,
  safety: { offlineOnly: true, productionModified: false, liveExecution: false },
  verification: { baselineExactlyReproduced: true, signalSupersetAndSoleFailureChecks: true, ledgerChecks }, diagnostics, results };
await fs.writeFile(`${out}/results.json`, JSON.stringify(output, null, 2));
const columns = ['variant', 'scope', 'tradeCount', 'endingBalance', 'returnPercent', 'profitFactor', 'expectancyR', 'maxDrawdownPercent', 'minLotSkips'];
const rows = Object.entries(results).flatMap(([name, r]) => ['descriptive', 'validation', 'stress'].map(scope => [name, scope, ...columns.slice(2).map(k => r[scope].metrics[k] ?? '')]));
await fs.writeFile(`${out}/summary.csv`, [columns, ...rows].map(r => r.join(',')).join('\n') + '\n');
console.log(JSON.stringify({ stage: 'complete', out, ledgerChecks, baselineExactlyReproduced: true }));
