import fs from 'node:fs/promises';

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf('--' + name);
  return i < 0 ? fallback : args[i + 1];
};

const gateway = flag('gateway', 'https://tradelocker-gpt-gateway.vercel.app');
const requestedFrom = Date.parse(flag('from', '2024-01-01T00:00:00.000Z'));
const requestedTo = Date.parse(flag('to', new Date(Date.now() - 10 * 60_000).toISOString()));
const key = process.env.TRADE_APPROVAL_KEY;
const origin = new URL(gateway);

if (!key) throw new Error('TRADE_APPROVAL_KEY must be available');
if (origin.protocol !== 'https:' && origin.hostname !== 'localhost') throw new Error('HTTPS gateway required');
if (!Number.isFinite(requestedFrom) || !Number.isFinite(requestedTo) || requestedTo <= requestedFrom) throw new Error('Invalid audit range');

async function request(route, body) {
  const response = await fetch(new URL(route, origin), {
    method: body ? 'POST' : 'GET',
    redirect: 'error',
    signal: AbortSignal.timeout(120000),
    headers: {
      'x-trade-approval-key': key,
      ...(process.env.VERCEL_AUTOMATION_BYPASS_SECRET ? {
        'x-vercel-protection-bypass': process.env.VERCEL_AUTOMATION_BYPASS_SECRET
      } : {}),
      ...(body ? { 'content-type': 'application/json' } : {})
    },
    ...(body ? { body: JSON.stringify(body) } : {})
  });

  if (!response.ok) throw new Error('GATEWAY_HTTP_' + response.status);
  const data = await response.json();
  if (data?.ok === false || data?.error) throw new Error('GATEWAY_REQUEST_FAILED');
  return data;
}

function percentile(values, p) {
  const vals = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!vals.length) return null;
  if (vals.length === 1) return vals[0];
  const pos = (vals.length - 1) * p;
  const lo = Math.floor(pos);
  const hi = Math.min(lo + 1, vals.length - 1);
  const frac = pos - lo;
  return vals[lo] * (1 - frac) + vals[hi] * frac;
}

function pct(values) {
  return {
    p25: percentile(values, 0.25),
    p50: percentile(values, 0.50),
    p75: percentile(values, 0.75)
  };
}

function fmt(v) {
  return Number.isFinite(v) ? v.toFixed(4) : '';
}

function firstD1Fail(directionPass, rangePass, bodyPass, closePass) {
  if (!directionPass) return 'DIR';
  if (!rangePass) return 'RANGE';
  if (!bodyPass) return 'BODY';
  if (!closePass) return 'CLOSE';
  return '';
}

function firstD2Fail(directionalMove, combinedRangeAtr, moveAtr, efficiency, finalLocation, beyondBos) {
  if (!(directionalMove > 0)) return 'DIR_MOVE';
  if (!(combinedRangeAtr >= 1.20)) return 'RANGE';
  if (!(moveAtr >= 0.80)) return 'MOVE';
  if (!(efficiency >= 0.60)) return 'EFF';
  if (!(finalLocation >= 0.75)) return 'CLOSE';
  if (!beyondBos) return 'BOS';
  return '';
}

function hourKey(time) {
  return Math.floor(time / 3600000);
}

class AuditEngine {
  constructor(auditFrom) {
    this.auditFrom = auditFrom;

    this.bars = [];
    this.tr14 = [];
    this.prevClose = null;
    this.atr14 = null;

    this.latestStructHighPrice = null;
    this.latestStructLowPrice = null;

    this.swingHighPrice = null;
    this.swingHighOriginBar = null;
    this.swingHighConsumed = true;

    this.swingLowPrice = null;
    this.swingLowOriginBar = null;
    this.swingLowConsumed = true;

    this.lastBullSweepLevel = null;
    this.lastBullSweepBar = null;
    this.lastBearSweepLevel = null;
    this.lastBearSweepBar = null;
    this.lastAnySweepBar = null;

    this.setupSide = '';
    this.setupState = '';
    this.sweepBar = null;
    this.sweepExtreme = null;
    this.chochLevel = null;
    this.chochBar = null;
    this.impulseExtreme = null;
    this.pullbackBar = null;
    this.bosLevel = null;

    this.dispFirstBar = null;
    this.dispFirstOpen = null;
    this.dispFirstHigh = null;
    this.dispFirstLow = null;
    this.dispFirstClose = null;
    this.pendingAudit = null;

    this.h1 = [];
    this.activeHourKey = null;
    this.activeH1Open = null;
    this.activeH1High = null;
    this.activeH1Low = null;
    this.activeH1Close = null;

    this.prevH1SwingHigh = null;
    this.lastH1SwingHigh = null;
    this.prevH1SwingLow = null;
    this.lastH1SwingLow = null;
    this.lastH1HighPivotKey = null;
    this.lastH1LowPivotKey = null;
    this.h1Bias = 'BUILDING';

    this.rows = [];
  }

  resetSetup() {
    this.setupSide = '';
    this.setupState = '';
    this.sweepBar = null;
    this.sweepExtreme = null;
    this.chochLevel = null;
    this.chochBar = null;
    this.impulseExtreme = null;
    this.pullbackBar = null;
    this.bosLevel = null;
    this.dispFirstBar = null;
    this.dispFirstOpen = null;
    this.dispFirstHigh = null;
    this.dispFirstLow = null;
    this.dispFirstClose = null;
    this.pendingAudit = null;
  }

  updateAtr(bar) {
    if (this.prevClose == null) {
      this.prevClose = bar.close;
      return null;
    }

    const tr = Math.max(
      bar.high - bar.low,
      Math.abs(bar.high - this.prevClose),
      Math.abs(bar.low - this.prevClose)
    );

    this.tr14.push(tr);
    if (this.tr14.length > 14) this.tr14.shift();
    this.prevClose = bar.close;

    if (this.tr14.length < 14) return null;
    this.atr14 = this.tr14.reduce((a, b) => a + b, 0) / 14;
    return this.atr14;
  }

  processH1(bar) {
    const key = hourKey(bar.time);

    if (this.activeHourKey == null) {
      this.activeHourKey = key;
      this.activeH1Open = bar.open;
      this.activeH1High = bar.high;
      this.activeH1Low = bar.low;
      this.activeH1Close = bar.close;
      return;
    }

    if (key === this.activeHourKey) {
      this.activeH1High = Math.max(this.activeH1High, bar.high);
      this.activeH1Low = Math.min(this.activeH1Low, bar.low);
      this.activeH1Close = bar.close;
      return;
    }

    this.h1.push({
      key: this.activeHourKey,
      open: this.activeH1Open,
      high: this.activeH1High,
      low: this.activeH1Low,
      close: this.activeH1Close
    });
    if (this.h1.length > 500) this.h1.shift();

    this.updateH1Structure();

    this.activeHourKey = key;
    this.activeH1Open = bar.open;
    this.activeH1High = bar.high;
    this.activeH1Low = bar.low;
    this.activeH1Close = bar.close;
  }

  updateH1Structure() {
    const n = this.h1.length;
    if (n < 5) {
      this.h1Bias = 'BUILDING';
      return;
    }

    const c = n - 3;
    const candidate = this.h1[c];

    const isHigh =
      candidate.high > this.h1[c - 1].high &&
      candidate.high > this.h1[c - 2].high &&
      candidate.high > this.h1[c + 1].high &&
      candidate.high > this.h1[c + 2].high;

    const isLow =
      candidate.low < this.h1[c - 1].low &&
      candidate.low < this.h1[c - 2].low &&
      candidate.low < this.h1[c + 1].low &&
      candidate.low < this.h1[c + 2].low;

    if (isHigh && candidate.key !== this.lastH1HighPivotKey) {
      this.prevH1SwingHigh = this.lastH1SwingHigh;
      this.lastH1SwingHigh = candidate.high;
      this.lastH1HighPivotKey = candidate.key;
    }

    if (isLow && candidate.key !== this.lastH1LowPivotKey) {
      this.prevH1SwingLow = this.lastH1SwingLow;
      this.lastH1SwingLow = candidate.low;
      this.lastH1LowPivotKey = candidate.key;
    }

    const enough = [
      this.prevH1SwingHigh,
      this.lastH1SwingHigh,
      this.prevH1SwingLow,
      this.lastH1SwingLow
    ].every(Number.isFinite);

    if (!enough) {
      this.h1Bias = 'BUILDING';
      return;
    }

    const hh = this.lastH1SwingHigh > this.prevH1SwingHigh;
    const lh = this.lastH1SwingHigh < this.prevH1SwingHigh;
    const hl = this.lastH1SwingLow > this.prevH1SwingLow;
    const ll = this.lastH1SwingLow < this.prevH1SwingLow;

    if (hh && hl) this.h1Bias = 'BULL';
    else if (lh && ll) this.h1Bias = 'BEAR';
    else this.h1Bias = 'NEUTRAL';
  }

  finalizeRow(row) {
    if (row.timeMs >= this.auditFrom) this.rows.push(row);
  }

  onBar(bar) {
    const i = this.bars.length;
    this.bars.push(bar);

    this.processH1(bar);
    const atr = this.updateAtr(bar);
    if (!Number.isFinite(atr) || atr <= 0 || i < 4) return;

    const pivot = this.bars[i - 2];

    const isPivotHigh =
      pivot.high > this.bars[i - 4].high &&
      pivot.high > this.bars[i - 3].high &&
      pivot.high > this.bars[i - 1].high &&
      pivot.high > bar.high;

    const isPivotLow =
      pivot.low < this.bars[i - 4].low &&
      pivot.low < this.bars[i - 3].low &&
      pivot.low < this.bars[i - 1].low &&
      pivot.low < bar.low;

    if (isPivotHigh) this.latestStructHighPrice = pivot.high;
    if (isPivotLow) this.latestStructLowPrice = pivot.low;

    let sequenceClosed = false;

    if (this.setupState) {
      if (this.setupSide === 'BULL' && bar.low < this.sweepExtreme) {
        this.resetSetup();
        sequenceClosed = true;
      } else if (this.setupSide === 'BEAR' && bar.high > this.sweepExtreme) {
        this.resetSetup();
        sequenceClosed = true;
      }
    }

    if (this.setupState === 'WAIT_CH') {
      if (i - this.sweepBar > 6) {
        this.resetSetup();
        sequenceClosed = true;
      } else if (this.setupSide === 'BULL' && bar.close > this.chochLevel) {
        this.setupState = 'WAIT_PULLBACK';
        this.chochBar = i;
        this.impulseExtreme = bar.high;
      } else if (this.setupSide === 'BEAR' && bar.close < this.chochLevel) {
        this.setupState = 'WAIT_PULLBACK';
        this.chochBar = i;
        this.impulseExtreme = bar.low;
      }
    }

    if (this.setupState === 'WAIT_PULLBACK') {
      if (i - this.chochBar > 10) {
        this.resetSetup();
        sequenceClosed = true;
      } else if (this.setupSide === 'BULL') {
        this.impulseExtreme = Math.max(this.impulseExtreme, bar.high);
        if ((this.impulseExtreme - bar.low) / atr >= 0.15) {
          this.bosLevel = this.impulseExtreme;
          this.pullbackBar = i;
          this.setupState = 'WAIT_BOS';
        }
      } else if (this.setupSide === 'BEAR') {
        this.impulseExtreme = Math.min(this.impulseExtreme, bar.low);
        if ((bar.high - this.impulseExtreme) / atr >= 0.15) {
          this.bosLevel = this.impulseExtreme;
          this.pullbackBar = i;
          this.setupState = 'WAIT_BOS';
        }
      }
    }

    if (this.setupState === 'WAIT_BOS') {
      if (i - this.chochBar > 10) {
        this.resetSetup();
        sequenceClosed = true;
      } else if (i > this.pullbackBar) {
        const bullishBos = this.setupSide === 'BULL' && bar.close > this.bosLevel;
        const bearishBos = this.setupSide === 'BEAR' && bar.close < this.bosLevel;

        if (bullishBos || bearishBos) {
          const candleRange = bar.high - bar.low;
          const body = Math.abs(bar.close - bar.open);
          const d1RangeAtr = candleRange / atr;
          const bodyFraction = candleRange > 0 ? body / candleRange : 0;
          const directionPass = bullishBos ? bar.close > bar.open : bar.close < bar.open;
          const rangePass = d1RangeAtr >= 1.10;
          const bodyPass = bodyFraction >= 0.60;
          const closeLocation = candleRange > 0
            ? (bullishBos ? (bar.close - bar.low) / candleRange : (bar.high - bar.close) / candleRange)
            : 0;
          const closePass = closeLocation >= 0.75;
          const d1Pass = directionPass && rangePass && bodyPass && closePass;

          const row = {
            time: new Date(bar.time).toISOString(),
            timeMs: bar.time,
            bar: i,
            side: bullishBos ? 'BULL' : 'BEAR',
            h1_bias: this.h1Bias,
            atr,
            d1_range_atr: d1RangeAtr,
            d1_body_fraction: bodyFraction,
            d1_close_location: closeLocation,
            d1_pass: d1Pass,
            d1_fail_reason: firstD1Fail(directionPass, rangePass, bodyPass, closePass),
            d2_combined_range_atr: null,
            d2_directional_move_atr: null,
            d2_efficiency: null,
            d2_final_close_location: null,
            d2_beyond_bos: null,
            d2_pass: null,
            d2_fail_reason: ''
          };

          if (d1Pass) {
            this.finalizeRow(row);
            this.resetSetup();
            sequenceClosed = true;
          } else {
            this.pendingAudit = row;
            this.dispFirstBar = i;
            this.dispFirstOpen = bar.open;
            this.dispFirstHigh = bar.high;
            this.dispFirstLow = bar.low;
            this.dispFirstClose = bar.close;
            this.setupState = 'WAIT_DISP2';
          }
        }
      }
    }

    if (this.setupState === 'WAIT_DISP2') {
      if (i > this.dispFirstBar + 1) {
        if (this.pendingAudit) {
          this.pendingAudit.d2_pass = false;
          this.pendingAudit.d2_fail_reason = 'TIMING';
          this.finalizeRow(this.pendingAudit);
        }
        this.resetSetup();
        sequenceClosed = true;
      } else if (i === this.dispFirstBar + 1) {
        const combinedHigh = Math.max(this.dispFirstHigh, bar.high);
        const combinedLow = Math.min(this.dispFirstLow, bar.low);
        const combinedRange = combinedHigh - combinedLow;

        const directionalMove = this.setupSide === 'BULL'
          ? bar.close - this.dispFirstOpen
          : this.dispFirstOpen - bar.close;

        const finalLocation = combinedRange > 0
          ? (this.setupSide === 'BULL'
              ? (bar.close - combinedLow) / combinedRange
              : (combinedHigh - bar.close) / combinedRange)
          : 0;

        const beyondBos = this.setupSide === 'BULL'
          ? bar.close > this.bosLevel
          : bar.close < this.bosLevel;

        const combinedRangeAtr = combinedRange / atr;
        const moveAtr = directionalMove / atr;
        const efficiency = combinedRange > 0 ? directionalMove / combinedRange : 0;

        const d2Pass =
          directionalMove > 0 &&
          combinedRangeAtr >= 1.20 &&
          moveAtr >= 0.80 &&
          efficiency >= 0.60 &&
          finalLocation >= 0.75 &&
          beyondBos;

        if (this.pendingAudit) {
          Object.assign(this.pendingAudit, {
            d2_combined_range_atr: combinedRangeAtr,
            d2_directional_move_atr: moveAtr,
            d2_efficiency: efficiency,
            d2_final_close_location: finalLocation,
            d2_beyond_bos: beyondBos,
            d2_pass: d2Pass,
            d2_fail_reason: firstD2Fail(
              directionalMove,
              combinedRangeAtr,
              moveAtr,
              efficiency,
              finalLocation,
              beyondBos
            )
          });
          this.finalizeRow(this.pendingAudit);
        }

        this.resetSetup();
        sequenceClosed = true;
      }
    }

    const cooldown =
      this.lastAnySweepBar != null &&
      i - this.lastAnySweepBar <= 3;

    if (
      !sequenceClosed &&
      this.setupState === '' &&
      Number.isFinite(this.swingLowPrice) &&
      !this.swingLowConsumed
    ) {
      const lowAge = i - this.swingLowOriginBar;

      if (lowAge >= 3) {
        const penetration = (this.swingLowPrice - bar.low) / atr;
        const reclaim = (bar.close - this.swingLowPrice) / atr;

        const validBullSweep =
          bar.low < this.swingLowPrice &&
          bar.close > this.swingLowPrice &&
          penetration >= 0.05 &&
          penetration <= 0.35 &&
          reclaim >= 0.05;

        if (validBullSweep) {
          let duplicate = false;
          if (Number.isFinite(this.lastBullSweepLevel)) {
            duplicate =
              Math.abs(this.swingLowPrice - this.lastBullSweepLevel) / atr <= 0.20 &&
              i - this.lastBullSweepBar <= 10;
          }

          if (!duplicate && !cooldown && Number.isFinite(this.latestStructHighPrice)) {
            this.lastBullSweepLevel = this.swingLowPrice;
            this.lastBullSweepBar = i;
            this.lastAnySweepBar = i;

            this.setupSide = 'BULL';
            this.setupState = 'WAIT_CH';
            this.sweepBar = i;
            this.sweepExtreme = bar.low;
            this.chochLevel = this.latestStructHighPrice;
          }

          this.swingLowConsumed = true;
        } else if (bar.close < this.swingLowPrice) {
          this.swingLowConsumed = true;
        }
      }
    }

    if (
      !sequenceClosed &&
      this.setupState === '' &&
      Number.isFinite(this.swingHighPrice) &&
      !this.swingHighConsumed
    ) {
      const highAge = i - this.swingHighOriginBar;

      if (highAge >= 3) {
        const penetration = (bar.high - this.swingHighPrice) / atr;
        const reclaim = (this.swingHighPrice - bar.close) / atr;

        const validBearSweep =
          bar.high > this.swingHighPrice &&
          bar.close < this.swingHighPrice &&
          penetration >= 0.05 &&
          penetration <= 0.35 &&
          reclaim >= 0.05;

        if (validBearSweep) {
          let duplicate = false;
          if (Number.isFinite(this.lastBearSweepLevel)) {
            duplicate =
              Math.abs(this.swingHighPrice - this.lastBearSweepLevel) / atr <= 0.20 &&
              i - this.lastBearSweepBar <= 10;
          }

          if (!duplicate && !cooldown && Number.isFinite(this.latestStructLowPrice)) {
            this.lastBearSweepLevel = this.swingHighPrice;
            this.lastBearSweepBar = i;
            this.lastAnySweepBar = i;

            this.setupSide = 'BEAR';
            this.setupState = 'WAIT_CH';
            this.sweepBar = i;
            this.sweepExtreme = bar.high;
            this.chochLevel = this.latestStructLowPrice;
          }

          this.swingHighConsumed = true;
        } else if (bar.close > this.swingHighPrice) {
          this.swingHighConsumed = true;
        }
      }
    }

    if (isPivotHigh) {
      const neighborHigh = Math.max(
        this.bars[i - 4].high,
        this.bars[i - 3].high,
        this.bars[i - 1].high,
        bar.high
      );

      const highProm = (pivot.high - neighborHigh) / atr;
      const highDist = Math.abs(pivot.high - bar.close) / atr;

      if (highProm >= 0.20 && highDist >= 0.15 && pivot.high > bar.close) {
        this.swingHighPrice = pivot.high;
        this.swingHighOriginBar = i - 2;
        this.swingHighConsumed = false;
      }
    }

    if (isPivotLow) {
      const neighborLow = Math.min(
        this.bars[i - 4].low,
        this.bars[i - 3].low,
        this.bars[i - 1].low,
        bar.low
      );

      const lowProm = (neighborLow - pivot.low) / atr;
      const lowDist = Math.abs(bar.close - pivot.low) / atr;

      if (lowProm >= 0.20 && lowDist >= 0.15 && pivot.low < bar.close) {
        this.swingLowPrice = pivot.low;
        this.swingLowOriginBar = i - 2;
        this.swingLowConsumed = false;
      }
    }
  }

  summary() {
    const rows = this.rows;

    const side = { BULL: 0, BEAR: 0 };
    const h1 = { BULL: 0, BEAR: 0, NEUTRAL: 0, BUILDING: 0 };
    const d1Fail = { DIR: 0, RANGE: 0, BODY: 0, CLOSE: 0 };
    const d2Fail = { DIR_MOVE: 0, RANGE: 0, MOVE: 0, EFF: 0, CLOSE: 0, BOS: 0, TIMING: 0 };

    let d1Passes = 0;
    let d2Attempts = 0;
    let d2Passes = 0;
    let aligned = 0;

    for (const row of rows) {
      side[row.side] = (side[row.side] || 0) + 1;
      h1[row.h1_bias] = (h1[row.h1_bias] || 0) + 1;
      if ((row.side === 'BULL' && row.h1_bias === 'BULL') || (row.side === 'BEAR' && row.h1_bias === 'BEAR')) aligned++;

      if (row.d1_pass) d1Passes++;
      else d1Fail[row.d1_fail_reason] = (d1Fail[row.d1_fail_reason] || 0) + 1;

      if (row.d2_pass != null) {
        d2Attempts++;
        if (row.d2_pass) d2Passes++;
        else d2Fail[row.d2_fail_reason] = (d2Fail[row.d2_fail_reason] || 0) + 1;
      }
    }

    const d2Rows = rows.filter(r =>
      r.d2_pass != null &&
      Number.isFinite(r.d2_combined_range_atr)
    );

    return {
      requestedFrom: new Date(requestedFrom).toISOString(),
      requestedTo: new Date(requestedTo).toISOString(),
      bosCandidates: rows.length,
      side,
      h1AtBos: h1,
      h1AlignedBos: aligned,
      d1: {
        pass: d1Passes,
        fail: rows.length - d1Passes,
        failReasons: d1Fail
      },
      d2: {
        attempts: d2Attempts,
        pass: d2Passes,
        fail: d2Attempts - d2Passes,
        failReasons: d2Fail
      },
      distributions: {
        d1RangeAtr: pct(rows.map(r => r.d1_range_atr)),
        d1BodyFraction: pct(rows.map(r => r.d1_body_fraction)),
        d1CloseLocation: pct(rows.map(r => r.d1_close_location)),
        d2CombinedRangeAtr: pct(d2Rows.map(r => r.d2_combined_range_atr)),
        d2DirectionalMoveAtr: pct(d2Rows.map(r => r.d2_directional_move_atr)),
        d2Efficiency: pct(d2Rows.map(r => r.d2_efficiency)),
        d2FinalCloseLocation: pct(d2Rows.map(r => r.d2_final_close_location))
      }
    };
  }
}

async function main() {
  const runtime = (await request('/api/tradelocker/runtime-config')).runtime;
  if (runtime?.tradingEnabled !== false || runtime?.killSwitch !== true) {
    throw new Error('RESEARCH_REQUIRES_EXECUTION_DISABLED');
  }

  const instruments = (await request('/api/trading/forex-universe')).instruments;
  const instrument = instruments.find(i => i.symbol === 'USDCHF');

  if (!instrument?.tradableInstrumentId || !instrument?.infoRouteId) {
    throw new Error('MISSING_USDCHF_INSTRUMENT');
  }

  const warmupFrom = requestedFrom - 31 * 86400000;
  const bars = new Map();
  const chunkMs = 4 * 86400000;

  for (let cursor = warmupFrom; cursor < requestedTo; cursor += chunkMs) {
    const end = Math.min(cursor + chunkMs - 1, requestedTo - 1);
    let chunk;

    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        chunk = (await request('/api/trading/history', {
          symbol: 'USDCHF',
          tradableInstrumentId: instrument.tradableInstrumentId,
          infoRouteId: instrument.infoRouteId,
          resolution: '5m',
          from: cursor,
          to: end,
          maxBars: 2000
        })).result;
        break;
      } catch (error) {
        const retryable = [
          'GATEWAY_HTTP_400',
          'GATEWAY_HTTP_429',
          'GATEWAY_HTTP_500',
          'GATEWAY_HTTP_502',
          'GATEWAY_HTTP_503',
          'GATEWAY_HTTP_504'
        ].includes(error.message);

        if (!retryable || attempt === 3) throw error;
        await new Promise(resolve => setTimeout(resolve, 1200 * (attempt + 1)));
      }
    }

    if (!chunk || chunk.truncated || chunk.chunks?.some(c => !['ok', 'no_data', 'no-data'].includes(c.status))) {
      throw new Error('HISTORY_CHUNK_INCOMPLETE_USDCHF');
    }

    for (const candle of chunk.candles || []) {
      const normalized = {
        time: Number(candle.time ?? candle.timestamp ?? candle.openTime ?? candle.t),
        open: Number(candle.open),
        high: Number(candle.high),
        low: Number(candle.low),
        close: Number(candle.close)
      };

      if (
        Number.isFinite(normalized.time) &&
        [normalized.open, normalized.high, normalized.low, normalized.close].every(Number.isFinite)
      ) {
        bars.set(normalized.time, normalized);
      }
    }

    if ((Math.floor((cursor - warmupFrom) / chunkMs) + 1) % 25 === 0) {
      console.log(JSON.stringify({
        stage: 'history-progress',
        through: new Date(end).toISOString(),
        bars: bars.size
      }));
    }

    await new Promise(resolve => setTimeout(resolve, 300));
  }

  const candles = [...bars.values()]
    .sort((a, b) => a.time - b.time)
    .filter(c => c.time < requestedTo);

  if (candles.length < 5000) throw new Error('INSUFFICIENT_M5_HISTORY');

  const engine = new AuditEngine(requestedFrom);
  for (const candle of candles) engine.onBar(candle);

  const summary = engine.summary();

  await fs.mkdir('research-output', { recursive: true });
  await fs.writeFile(
    'research-output/scalp-2h2-m5-summary.json',
    JSON.stringify({
      source: 'TradeLocker',
      symbol: 'USDCHF',
      resolution: '5m',
      safety: {
        tradingEnabled: runtime.tradingEnabled,
        killSwitch: runtime.killSwitch
      },
      bars: candles.length,
      coverage: {
        from: new Date(candles[0].time).toISOString(),
        to: new Date(candles.at(-1).time).toISOString()
      },
      summary
    }, null, 2)
  );

  console.log('');
  console.log('========== 2H.2 M5 DISPLACEMENT AUDIT SUMMARY ==========');
  console.log('BARS|' + candles.length);
  console.log('COVERAGE|' + new Date(candles[0].time).toISOString() + '|' + new Date(candles.at(-1).time).toISOString());
  console.log('BOS_CANDIDATES|' + summary.bosCandidates);
  console.log('SIDE|BULL=' + summary.side.BULL + '|BEAR=' + summary.side.BEAR);
  console.log('H1_AT_BOS|BULL=' + summary.h1AtBos.BULL + '|BEAR=' + summary.h1AtBos.BEAR + '|NEUTRAL=' + summary.h1AtBos.NEUTRAL + '|BUILDING=' + summary.h1AtBos.BUILDING);
  console.log('H1_ALIGNED_BOS|' + summary.h1AlignedBos);
  console.log('D1|PASS=' + summary.d1.pass + '|FAIL=' + summary.d1.fail + '|DIR=' + summary.d1.failReasons.DIR + '|RANGE=' + summary.d1.failReasons.RANGE + '|BODY=' + summary.d1.failReasons.BODY + '|CLOSE=' + summary.d1.failReasons.CLOSE);
  console.log('D2|ATTEMPTS=' + summary.d2.attempts + '|PASS=' + summary.d2.pass + '|FAIL=' + summary.d2.fail + '|DIR_MOVE=' + summary.d2.failReasons.DIR_MOVE + '|RANGE=' + summary.d2.failReasons.RANGE + '|MOVE=' + summary.d2.failReasons.MOVE + '|EFF=' + summary.d2.failReasons.EFF + '|CLOSE=' + summary.d2.failReasons.CLOSE + '|BOS=' + summary.d2.failReasons.BOS + '|TIMING=' + summary.d2.failReasons.TIMING);
  console.log('D1_RANGE_ATR|p25=' + fmt(summary.distributions.d1RangeAtr.p25) + '|p50=' + fmt(summary.distributions.d1RangeAtr.p50) + '|p75=' + fmt(summary.distributions.d1RangeAtr.p75));
  console.log('D1_BODY_FRACTION|p25=' + fmt(summary.distributions.d1BodyFraction.p25) + '|p50=' + fmt(summary.distributions.d1BodyFraction.p50) + '|p75=' + fmt(summary.distributions.d1BodyFraction.p75));
  console.log('D1_CLOSE_LOCATION|p25=' + fmt(summary.distributions.d1CloseLocation.p25) + '|p50=' + fmt(summary.distributions.d1CloseLocation.p50) + '|p75=' + fmt(summary.distributions.d1CloseLocation.p75));
  console.log('D2_COMBINED_RANGE_ATR|p25=' + fmt(summary.distributions.d2CombinedRangeAtr.p25) + '|p50=' + fmt(summary.distributions.d2CombinedRangeAtr.p50) + '|p75=' + fmt(summary.distributions.d2CombinedRangeAtr.p75));
  console.log('D2_DIRECTIONAL_MOVE_ATR|p25=' + fmt(summary.distributions.d2DirectionalMoveAtr.p25) + '|p50=' + fmt(summary.distributions.d2DirectionalMoveAtr.p50) + '|p75=' + fmt(summary.distributions.d2DirectionalMoveAtr.p75));
  console.log('D2_EFFICIENCY|p25=' + fmt(summary.distributions.d2Efficiency.p25) + '|p50=' + fmt(summary.distributions.d2Efficiency.p50) + '|p75=' + fmt(summary.distributions.d2Efficiency.p75));
  console.log('D2_FINAL_CLOSE_LOCATION|p25=' + fmt(summary.distributions.d2FinalCloseLocation.p25) + '|p50=' + fmt(summary.distributions.d2FinalCloseLocation.p50) + '|p75=' + fmt(summary.distributions.d2FinalCloseLocation.p75));
  console.log('=========================================================');
}

try {
  await main();
} catch (error) {
  console.error(error?.message || 'M5 audit failed');
  process.exitCode = 1;
}
