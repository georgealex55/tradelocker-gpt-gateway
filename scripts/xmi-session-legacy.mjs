/* Export closed-bar legacy XMI signals without loading the gateway or broker. */
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { buildStructureTimeline } from '../lib/structureA2Core.mjs';

// Next.js resolves extensionless local imports in the existing strategy files.
registerHooks({
  resolve(specifier, context, next) {
    try {
      return next(specifier, context);
    } catch (error) {
      const local = specifier.startsWith('./') || specifier.startsWith('../');
      if (error.code !== 'ERR_MODULE_NOT_FOUND' || !local || /\.[a-z]+$/i.test(specifier)) throw error;
      return next(specifier + '.js', context);
    }
  },
});

const { createIndicatorEngine } = await import('../lib/indicators.js');
const { createForexStrategyV1 } = await import('../lib/forexStrategyV1.js');
const { FOREX_STRATEGY_V1_CONFIG: config } = await import('../lib/forexStrategyV1Config.js');
const { m15, h1 } = JSON.parse(readFileSync(0, 'utf8'));
const HOUR = 60 * 60_000;
const QUARTER = 15 * 60_000;
const result = { 'legacy-v1': [], 'legacy-soft': [], 'legacy-a2': [], a2Exit: [] };
const primary = createIndicatorEngine(config.indicators.entry);
const hourly = createIndicatorEngine(config.indicators.regime);
const strategy = createForexStrategyV1({
  symbol: 'USDCHF',
  config: { ...config, session: { ...config.session, entryStartUtcHour: 0, entryEndUtcHour: 24 } },
});
let index = 0;
let higher = null;
for (const candle of m15) {
  const decision = candle.time + QUARTER;
  while (index < h1.length && h1[index].time + HOUR <= decision) {
    const closed = h1[index++];
    higher = { candle: closed, indicators: hourly.update(closed) };
  }
  const indicators = primary.update(candle);
  const fresh = higher && decision - higher.candle.time < 2 * HOUR;
  const output = strategy({ candle, indicators, higherTimeframe: fresh ? higher : null, spreadPips: 2 });
  if (output.action !== 'HOLD' && Number.isFinite(output.stopLoss)) {
    result['legacy-v1'].push([decision / 60_000, output.action === 'BUY' ? 1 : -1, output.stopLoss]);
  }
  const soft = output.softRegimeSetup;
  if (output.blocks.length === 0 && soft.ready && Number.isFinite(soft.stopLoss)) {
    result['legacy-soft'].push([decision / 60_000, soft.direction === 'LONG' ? 1 : -1, soft.stopLoss]);
  }
}

const timeline = buildStructureTimeline(h1);
for (let i = 20; i < h1.length; i++) {
  const candle = h1[i];
  const decision = (candle.time + HOUR) / 60_000;
  const exitHigh = Math.max(...h1.slice(i - 10, i).map(bar => bar.high));
  if (candle.close > exitHigh) result.a2Exit.push(decision);
  const snapshot = timeline[i];
  if (snapshot.event?.type !== 'BOS_BEARISH' || !(snapshot.atr > 0)) continue;
  const entryLow = Math.min(...h1.slice(i - 20, i).map(bar => bar.low));
  const range = candle.high - candle.low;
  const boundary = Math.min(entryLow, snapshot.event.level);
  if (candle.close < entryLow && range > 0 &&
      (candle.high - candle.close) / range >= 0.75 &&
      Math.abs(candle.close - candle.open) / range >= 0.5 &&
      (boundary - candle.close) / snapshot.atr >= 0.1) {
    result['legacy-a2'].push([decision, -1, 2 * snapshot.atr]);
  }
}
process.stdout.write(JSON.stringify(result));
