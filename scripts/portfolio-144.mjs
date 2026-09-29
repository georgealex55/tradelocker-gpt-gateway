import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { SYMBOLS, combinations, ENGINE_VERSION, COSTS, REQUIRED_EVENTS } from '../lib/research/policies.mjs';
import { validateDataset, preparePair, fitSchedule, evaluateCombo, fingerprint } from '../lib/research/prepare.mjs';
import { historicalMacroBlackouts, historicalMacroCalendar } from '../lib/historicalMacroEvents.js';

const args = process.argv.slice(2);
const flag = (name, fallback) => { const i = args.indexOf(`--${name}`); return i < 0 ? fallback : args[i + 1]; };
const command = args[0];
const directory = path.resolve(flag('output', 'research-output'));
const gateway = flag('gateway', 'https://tradelocker-gpt-gateway.vercel.app');
const key = process.env.TRADE_APPROVAL_KEY;
const origin = new URL(gateway);
if (origin.protocol !== 'https:' && origin.hostname !== 'localhost') throw new Error('HTTPS gateway required');
async function request(route, body) {
  if (!key) throw new Error('TRADE_APPROVAL_KEY must be available in this process environment');
  const response = await fetch(new URL(route, origin), { method: body ? 'POST' : 'GET', redirect: 'error', signal: AbortSignal.timeout(120000), headers: { 'x-trade-approval-key': key,
    ...(process.env.VERCEL_AUTOMATION_BYPASS_SECRET ? { 'x-vercel-protection-bypass': process.env.VERCEL_AUTOMATION_BYPASS_SECRET } : {}),
    ...(body ? { 'content-type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  if (!response.ok) throw new Error(`GATEWAY_HTTP_${response.status}`);
  const data = await response.json();
  if (data.ok === false || data.error) throw new Error('GATEWAY_REQUEST_FAILED');
  return data;
}
async function safeRuntime() {
  const { runtime } = await request('/api/tradelocker/runtime-config');
  if (runtime?.tradingEnabled !== false || runtime?.killSwitch !== true) throw new Error('RESEARCH_REQUIRES_EXECUTION_DISABLED');
  return { tradingEnabled: runtime.tradingEnabled, killSwitch: runtime.killSwitch, commit: runtime.vercelGitCommitSha };
}
async function writeJson(file, value) {
  const destination = path.join(directory, file);
  await fs.writeFile(`${destination}.tmp`, JSON.stringify(value, null, 2));
  await fs.rename(`${destination}.tmp`, destination);
}
function csv(rows) {
  const columns = Object.keys(rows[0] || {});
  return [columns, ...rows.map(r => columns.map(c => r[c]))].map(r => r.map(v => `"${String(v ?? '').replaceAll('"', '""')}"`).join(',')).join('\n');
}
async function collect() {
  const safety = await safeRuntime();
  console.log(JSON.stringify({ stage: 'safety', ...safety }));
  const from = flag('from', '2024-01-01T00:00:00.000Z'), to = flag('to', '2026-09-25T21:00:00.000Z');
  const warmup = Date.parse(from) - 30 * 86400000;
  const instruments = (await request('/api/trading/forex-universe')).instruments;
  const dataset = { source: 'tradelocker', requestedFrom: from, requestedTo: to, collectedAt: new Date().toISOString(), safety, pairs: {} };
  for (const symbol of SYMBOLS) {
    const instrument = instruments.find(i => i.symbol === symbol);
    if (!instrument?.tradeRouteId || !instrument.infoRouteId) throw new Error(`MISSING_INSTRUMENT_${symbol}`);
    const detail = await request(`/api/tradelocker/instrument-details?symbol=${symbol}&tradableInstrumentId=${instrument.tradableInstrumentId}&routeId=${instrument.tradeRouteId}`);
    const m = detail.data?.d || detail.data;
    const tickSize = Number(Array.isArray(m.tickSize) ? m.tickSize[0]?.tickSize : m.tickSize);
    const metadata = { ...instrument, lotSize: Number(m.lotSize), minLot: Number(m.minLot), maxLot: Number(m.maxLot), lotStep: Number(m.lotStep), tickSize,
      // All three requested majors quote to 4-decimal pips; tick precision is distinct.
      pipSize: 0.0001, pipConvention: 'USDCHF/EURUSD/GBPUSD standard pip 0.0001; tickSize independently broker verified',
      baseCurrency: m.baseCurrency, quotingCurrency: m.quotingCurrency, barSource: String(m.barSource || instrument.barSource || '').toUpperCase(), verifiedAt: dataset.collectedAt, source: 'TradeLocker instrument-details + instrument list via authenticated gateway' };
    const bars = new Map();
    for (let cursor = warmup; cursor < Date.parse(to); cursor += 14 * 86400000) {
      const end = Math.min(cursor + 14 * 86400000 - 1, Date.parse(to) - 1);
      let chunk;
      for (let attempt = 0; attempt < 4; attempt++) {
        try {
          chunk = (await request('/api/trading/history', { symbol, tradableInstrumentId: instrument.tradableInstrumentId, infoRouteId: instrument.infoRouteId, resolution: '15m', from: cursor, to: end, maxBars: 2000 })).result;
          break;
        } catch (error) {
          const retryable = ['GATEWAY_HTTP_400','GATEWAY_HTTP_429','GATEWAY_HTTP_500','GATEWAY_HTTP_502','GATEWAY_HTTP_503','GATEWAY_HTTP_504'].includes(error.message);
          if (!retryable || attempt === 3) throw error;
          console.log(JSON.stringify({ stage: 'history-retry', symbol, from: new Date(cursor).toISOString(), attempt: attempt + 1, code: error.message }));
          await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
        }
      }
      if (chunk.truncated || chunk.chunks?.some(c => !['ok','no_data','no-data'].includes(c.status))) throw new Error(`HISTORY_CHUNK_INCOMPLETE_${symbol}`);
      await new Promise(resolve => setTimeout(resolve, 350));
      for (const candle of chunk.candles) bars.set(candle.time, candle);
      dataset.pairs[symbol] = { metadata, candles: [...bars.values()].sort((a, b) => a.time - b.time), truncated: true, collectedThrough: end };
      await writeJson('dataset.partial.json', dataset);
      console.log(JSON.stringify({ stage: 'history-chunk', symbol, from: new Date(cursor).toISOString(), to: new Date(end).toISOString(), bars: chunk.candles.length, totalBars: bars.size }));
    }
    dataset.pairs[symbol] = { metadata, candles: [...bars.values()].sort((a, b) => a.time - b.time), truncated: false };
    await writeJson('dataset.partial.json', dataset);
    console.log(JSON.stringify({ stage: 'collected', symbol, bars: bars.size }));
  }
  const calendarFile = flag('calendar');
  dataset.calendar = calendarFile ? JSON.parse(await fs.readFile(calendarFile, 'utf8')) : historicalMacroCalendar();
  await writeJson('dataset.json', dataset);
  console.log('Dataset saved with official-source macro calendar; validation is required before running.');
}
async function run() {
  const input = JSON.parse(await fs.readFile(flag('input', path.join(directory, 'dataset.json')), 'utf8'));
  const prepared = validateDataset(input);
  for (const symbol of SYMBOLS) { prepared.pairs[symbol] = preparePair(prepared.pairs[symbol]); console.log(JSON.stringify({ stage: 'signals', symbol })); }
  const schedule = fitSchedule(prepared);
  const safety = await safeRuntime();
  const manifest = { engineVersion: ENGINE_VERSION, sourceCommit: safety.commit, inputHash: prepared.inputHash, from: prepared.from, to: prepared.to, coverage: prepared.coverage,
    startingBalance: 200, costs: COSTS, schedule, calendar: { reviewedAt: prepared.calendar.reviewedAt, coverage: prepared.calendar.coverage },
    instruments: Object.fromEntries(SYMBOLS.map(s => [s, prepared.pairs[s].metadata])), safety,
    validationLabel: 'Held-forward windows within this experiment; prior strategy tuning overlap is unknown',
    costModel: 'Canonical OHLC price proxy: round-trip spread + twice per-side slippage deducted at exit. Not an exact historical bid/ask execution replay. Commission/financing excluded.',
    drawdownModel: 'Realized balance drawdown; open-trade mark-to-market drawdown not modeled',
    codeHash: fingerprint(await Promise.all(['lib/research/engine.mjs','lib/research/prepare.mjs','lib/research/policies.mjs','lib/forexStrategyV1.js','lib/forexStrategyV1Config.js','lib/indicators.js','lib/timeframes.js'].map(f => fs.readFile(new URL(`../${f}`, import.meta.url),'utf8')))) };
  // Identity includes code, calendar, costs and data, preventing stale resume across revisions.
  const inputHash = fingerprint({ inputHash: prepared.inputHash, codeHash: manifest.codeHash, costs: COSTS });
  const workerId = randomUUID();
  const { id: runId } = await request('/api/trading/portfolio-144', { action: 'create', inputHash, engineVersion: ENGINE_VERSION, manifest, workerId });
  const state = await request(`/api/trading/portfolio-144?runId=${encodeURIComponent(runId)}`);
  const done = new Map(state.results.filter(r => r.status === 'COMPLETED').map(r => [r.combo_id, r.result_json]));
  const cache = new Map();
  const limit = Number(flag('limit', '144'));
  if (!Number.isInteger(limit) || limit < 1 || limit > 144) throw new Error('limit must be 1..144');
  let processed = 0;
  for (const combo of combinations()) {
    if (done.has(combo.id)) continue;
    if (processed >= limit) break;
    await request('/api/trading/portfolio-144', { action: 'processing', runId, workerId, comboId: combo.id });
    let result;
    try {
      const policyKey = JSON.stringify([combo.risk, combo.positions, combo.daily, combo.news, combo.parameters]);
      const cached = cache.get(policyKey);
      result = cached ? { ...cached, combo, score: (await import('../lib/research/policies.mjs')).rankScore(cached.validation.metrics, combo.objective) } : evaluateCombo(prepared, combo, schedule);
      cache.set(policyKey, result);
    } catch {
      await request('/api/trading/portfolio-144', { action: 'result', runId, workerId, comboId: combo.id, status: 'FAILED' });
      console.log(JSON.stringify({ combo: combo.id, status: 'FAILED' })); processed++; continue;
    }
    // Persistence errors halt immediately: never report a result as saved when it was not.
    await request('/api/trading/portfolio-144', { action: 'result', runId, workerId, comboId: combo.id, status: 'COMPLETED', result });
    done.set(combo.id, result); processed++;
    await writeJson('progress.json', { runId, completed: done.size, total: 144, current: combo.id });
    console.log(JSON.stringify({ combo: combo.id, completed: done.size, total: 144, validationTrades: result.validation.metrics.tradeCount, eligible: result.eligible }));
  }
  await request('/api/trading/portfolio-144', { action: 'finish', runId, workerId });
  const final = await request(`/api/trading/portfolio-144?runId=${encodeURIComponent(runId)}`);
  await writeJson('results.json', final);
  await fs.writeFile(path.join(directory, 'results.csv'), csv([...done.values()].map(r => ({ ...r.combo, ...Object.fromEntries(Object.entries(r.validation.metrics).filter(([, v]) => typeof v !== 'object')), eligible: r.eligible, rejectionReasons: r.rejectionReasons.join(';') }))));
  console.log(JSON.stringify({ runId, completed: final.completed, failures: final.failures, dashboard: `${origin.origin}/backtests/portfolio-144?runId=${runId}` }));
}
await fs.mkdir(directory, { recursive: true });
try {
  if (command === 'collect') await collect();
  else if (command === 'run') await run();
  else if (command === 'calendar-template') {
    await writeJson('calendar.template.json', { complete: false, from: '2024-01-01T00:00:00Z', to: '2026-09-25T21:00:00Z', reviewedAt: null,
      coverage: REQUIRED_EVENTS.map(event => ({ event, from: null, to: null, source: null })),
      blackouts: historicalMacroBlackouts().map(b => ({ ...b, source: null })),
      note: 'Incomplete inherited calendar. Verify every timestamp, add GDP/ECB/BOE, official source URLs, actual revised releases, and coverage review before marking complete.' });
  } else throw new Error('Usage: portfolio-144.mjs collect | run | calendar-template (see docs/PORTFOLIO_144.md)');
} catch (error) {
  // Never print stack traces, HTTP bodies, env values or database URLs.
  console.error(error.message.startsWith('GATEWAY') || error.message.startsWith('CALENDAR') || error.message.startsWith('RESEARCH_') ? error.message : 'Research stopped. Check dataset, calendar, credentials and documented prerequisites.');
  process.exitCode = 1;
}
