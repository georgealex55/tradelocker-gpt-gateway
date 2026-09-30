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
if (!Number.isFinite(requestedFrom) || !Number.isFinite(requestedTo) || requestedTo <= requestedFrom) throw new Error('Invalid backtest range');

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

function hourKey(time) {
  return Math.floor(time / 3600000);
}

function safeDiv(a, b) {
  return Number.isFinite(a) && Number.isFinite(b) && b !== 0 ? a / b : null;
}

function round(v, digits = 4) {
  return Number.isFinite(v) ? Number(v.toFixed(digits)) : null;
}

class BacktestEngine {
  constructor(auditFrom, config = {}) {
    this.auditFrom = auditFrom;
    this.config = {
      name: 'baseline-1.10',
      d1Range: 1.10,
      d2Range: 1.20,
      d2Move: 0.80,
      d2Efficiency: 0.60,
      fvgMinAtr: 0.10,
      fvgMaxAtr: 0.75,
      minAvailableR: 1.50,
      stopBufferAtr: 0.10,
      riskPct: 0.01,
      startingBalance: 500,
      ...config
    };

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

    this.position = null;
    this.trades = [];
    this.equity = this.config.startingBalance;
    this.peakEquity = this.equity;
    this.maxDrawdownPct = 0;
    this.ambiguousBars = 0;

    this.funnel = {
      sweeps: 0,
      choch: 0,
      bos: 0,
      d1Pass: 0,
      d2Pass: 0,
      displacementPass: 0,
      fvgFound: 0,
      retestTouch: 0,
      midpointRetest: 0,
      availableRPass: 0,
      h1GatePass: 0,
      tradesOpened: 0
    };

    this.resetSetup();
  }

  inAudit(time) {
    return time >= this.auditFrom;
  }

  bump(name, time) {
    if (this.inAudit(time)) this.funnel[name]++;
  }

  resetSetup() {
    this.setupSide = '';
    this.setupState = '';
    this.sweepBar = null;
    this.sweepTime = null;
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

    this.dispStartBar = null;
    this.dispEndBar = null;
    this.displacementType = null;
    this.postDispExtreme = null;

    this.fvgBar = null;
    this.fvgLower = null;
    this.fvgUpper = null;
    this.fvgMid = null;
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

  startDisplacement(startBar, endBar, extreme, type, time) {
    this.dispStartBar = startBar;
    this.dispEndBar = endBar;
    this.postDispExtreme = extreme;
    this.displacementType = type;
    this.setupState = 'WAIT_FVG';
    this.bump(type === 'D1' ? 'd1Pass' : 'd2Pass', time);
    this.bump('displacementPass', time);
  }

  findFvgAt(i, atr) {
    if (i < 2) return false;

    const c1 = this.bars[i - 2];
    const c3 = this.bars[i];

    const overlapsDisplacement =
      i >= this.dispStartBar &&
      (i - 2) <= this.dispEndBar;

    if (!overlapsDisplacement) return false;

    if (this.setupSide === 'BULL') {
      if (!(c3.low > c1.high)) return false;

      const lower = c1.high;
      const upper = c3.low;
      const sizeAtr = (upper - lower) / atr;

      if (sizeAtr < this.config.fvgMinAtr || sizeAtr > this.config.fvgMaxAtr) return false;

      this.fvgLower = lower;
      this.fvgUpper = upper;
      this.fvgMid = (lower + upper) / 2;
      this.fvgBar = i;
      this.setupState = 'WAIT_RETEST';
      this.bump('fvgFound', c3.time);
      return true;
    }

    if (this.setupSide === 'BEAR') {
      if (!(c3.high < c1.low)) return false;

      const lower = c3.high;
      const upper = c1.low;
      const sizeAtr = (upper - lower) / atr;

      if (sizeAtr < this.config.fvgMinAtr || sizeAtr > this.config.fvgMaxAtr) return false;

      this.fvgLower = lower;
      this.fvgUpper = upper;
      this.fvgMid = (lower + upper) / 2;
      this.fvgBar = i;
      this.setupState = 'WAIT_RETEST';
      this.bump('fvgFound', c3.time);
      return true;
    }

    return false;
  }

  h1Aligned() {
    return (
      (this.setupSide === 'BULL' && this.h1Bias === 'BULL') ||
      (this.setupSide === 'BEAR' && this.h1Bias === 'BEAR')
    );
  }

  openTrade(bar, i, atr) {
    const entry = this.fvgMid;
    const stop = this.setupSide === 'BULL'
      ? this.sweepExtreme - this.config.stopBufferAtr * atr
      : this.sweepExtreme + this.config.stopBufferAtr * atr;
    const target = this.postDispExtreme;

    const risk = this.setupSide === 'BULL' ? entry - stop : stop - entry;
    const reward = this.setupSide === 'BULL' ? target - entry : entry - target;
    const availableR = safeDiv(reward, risk);

    if (!(risk > 0) || !(reward > 0) || !Number.isFinite(availableR)) return { opened: false, reason: 'INVALID_RISK_REWARD' };

    if (availableR < this.config.minAvailableR) {
      return { opened: false, reason: 'R_BELOW_MIN', availableR };
    }

    this.bump('availableRPass', bar.time);

    if (!this.h1Aligned()) {
      return { opened: false, reason: 'H1_BLOCK', availableR };
    }

    this.bump('h1GatePass', bar.time);

    if (!this.inAudit(bar.time)) {
      return { opened: false, reason: 'WARMUP', availableR };
    }

    this.position = {
      side: this.setupSide,
      entry,
      stop,
      target,
      risk,
      availableR,
      entryTime: bar.time,
      entryBar: i,
      displacementType: this.displacementType,
      h1Bias: this.h1Bias,
      sweepTime: this.sweepTime
    };

    this.bump('tradesOpened', bar.time);
    this.processPositionBar(bar, i);

    return { opened: true, availableR };
  }

  processPositionBar(bar, i) {
    if (!this.position) return false;

    const p = this.position;

    const stopHit = p.side === 'BULL'
      ? bar.low <= p.stop
      : bar.high >= p.stop;

    const targetHit = p.side === 'BULL'
      ? bar.high >= p.target
      : bar.low <= p.target;

    if (!stopHit && !targetHit) return false;

    let rResult;
    let exitReason;

    if (stopHit && targetHit) {
      rResult = -1;
      exitReason = 'BOTH_STOP_FIRST';
      this.ambiguousBars++;
    } else if (stopHit) {
      rResult = -1;
      exitReason = 'STOP';
    } else {
      rResult = p.availableR;
      exitReason = 'TARGET';
    }

    const equityBefore = this.equity;
    this.equity *= (1 + this.config.riskPct * rResult);

    this.peakEquity = Math.max(this.peakEquity, this.equity);
    const dd = this.peakEquity > 0
      ? (this.peakEquity - this.equity) / this.peakEquity
      : 0;

    this.maxDrawdownPct = Math.max(this.maxDrawdownPct, dd);

    this.trades.push({
      side: p.side,
      displacementType: p.displacementType,
      h1Bias: p.h1Bias,
      entryTime: p.entryTime,
      exitTime: bar.time,
      barsHeld: i - p.entryBar,
      entry: p.entry,
      stop: p.stop,
      target: p.target,
      availableR: p.availableR,
      rResult,
      exitReason,
      equityBefore,
      equityAfter: this.equity
    });

    this.position = null;
    return true;
  }

  onBar(bar) {
    const i = this.bars.length;
    this.bars.push(bar);

    this.processH1(bar);
    const atr = this.updateAtr(bar);

    if (!Number.isFinite(atr) || atr <= 0 || i < 4) return;

    if (this.position) {
      this.processPositionBar(bar, i);
      return;
    }

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
        this.bump('choch', bar.time);
      } else if (this.setupSide === 'BEAR' && bar.close < this.chochLevel) {
        this.setupState = 'WAIT_PULLBACK';
        this.chochBar = i;
        this.impulseExtreme = bar.low;
        this.bump('choch', bar.time);
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
          this.bump('bos', bar.time);

          const candleRange = bar.high - bar.low;
          const body = Math.abs(bar.close - bar.open);
          const d1RangeAtr = candleRange / atr;
          const bodyFraction = candleRange > 0 ? body / candleRange : 0;
          const directionPass = bullishBos ? bar.close > bar.open : bar.close < bar.open;
          const rangePass = d1RangeAtr >= this.config.d1Range;
          const bodyPass = bodyFraction >= 0.60;

          const closeLocation = candleRange > 0
            ? (bullishBos
              ? (bar.close - bar.low) / candleRange
              : (bar.high - bar.close) / candleRange)
            : 0;

          const closePass = closeLocation >= 0.75;
          const d1Pass = directionPass && rangePass && bodyPass && closePass;

          if (d1Pass) {
            const extreme = this.setupSide === 'BULL' ? bar.high : bar.low;
            this.startDisplacement(i, i, extreme, 'D1', bar.time);
          } else {
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
        const directionalMoveAtr = directionalMove / atr;
        const efficiency = combinedRange > 0 ? directionalMove / combinedRange : 0;

        const d2Pass =
          directionalMove > 0 &&
          combinedRangeAtr >= this.config.d2Range &&
          directionalMoveAtr >= this.config.d2Move &&
          efficiency >= this.config.d2Efficiency &&
          finalLocation >= 0.75 &&
          beyondBos;

        if (d2Pass) {
          const extreme = this.setupSide === 'BULL' ? combinedHigh : combinedLow;
          this.startDisplacement(this.dispFirstBar, i, extreme, 'D2', bar.time);
        } else {
          this.resetSetup();
          sequenceClosed = true;
        }
      }
    }

    if (this.setupState === 'WAIT_FVG') {
      if (i <= this.dispEndBar + 2) {
        this.findFvgAt(i, atr);

        if (this.setupSide === 'BULL') {
          this.postDispExtreme = Math.max(this.postDispExtreme, bar.high);
        } else if (this.setupSide === 'BEAR') {
          this.postDispExtreme = Math.min(this.postDispExtreme, bar.low);
        }
      } else {
        this.resetSetup();
        sequenceClosed = true;
      }
    }

    if (this.setupState === 'WAIT_RETEST' && i > this.fvgBar) {
      if (i - this.fvgBar > 6) {
        this.resetSetup();
        sequenceClosed = true;
      } else if (this.setupSide === 'BULL') {
        if (bar.close < this.fvgLower) {
          this.resetSetup();
          sequenceClosed = true;
        } else if (bar.low <= this.fvgUpper) {
          this.bump('retestTouch', bar.time);

          if (bar.low <= this.fvgMid) {
            this.bump('midpointRetest', bar.time);
            this.openTrade(bar, i, atr);
          }

          this.resetSetup();
          sequenceClosed = true;
        } else {
          this.postDispExtreme = Math.max(this.postDispExtreme, bar.high);
        }
      } else if (this.setupSide === 'BEAR') {
        if (bar.close > this.fvgUpper) {
          this.resetSetup();
          sequenceClosed = true;
        } else if (bar.high >= this.fvgLower) {
          this.bump('retestTouch', bar.time);

          if (bar.high >= this.fvgMid) {
            this.bump('midpointRetest', bar.time);
            this.openTrade(bar, i, atr);
          }

          this.resetSetup();
          sequenceClosed = true;
        } else {
          this.postDispExtreme = Math.min(this.postDispExtreme, bar.low);
        }
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
            this.sweepTime = bar.time;
            this.sweepExtreme = bar.low;
            this.chochLevel = this.latestStructHighPrice;
            this.bump('sweeps', bar.time);
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
            this.sweepTime = bar.time;
            this.sweepExtreme = bar.high;
            this.chochLevel = this.latestStructLowPrice;
            this.bump('sweeps', bar.time);
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

  subgroup(trades) {
    if (!trades.length) {
      return {
        trades: 0,
        wins: 0,
        losses: 0,
        winRate: null,
        totalR: 0,
        expectancyR: null,
        profitFactorR: null
      };
    }

    const wins = trades.filter(t => t.rResult > 0);
    const losses = trades.filter(t => t.rResult < 0);
    const grossWinR = wins.reduce((s, t) => s + t.rResult, 0);
    const grossLossR = Math.abs(losses.reduce((s, t) => s + t.rResult, 0));
    const totalR = trades.reduce((s, t) => s + t.rResult, 0);

    return {
      trades: trades.length,
      wins: wins.length,
      losses: losses.length,
      winRate: wins.length / trades.length,
      totalR,
      expectancyR: totalR / trades.length,
      profitFactorR: grossLossR > 0 ? grossWinR / grossLossR : null
    };
  }

  summary() {
    const closed = this.trades;
    const overall = this.subgroup(closed);

    return {
      config: this.config,
      funnel: this.funnel,
      overall: {
        ...overall,
        startingBalance: this.config.startingBalance,
        endingBalance: this.equity,
        returnPct: (this.equity / this.config.startingBalance - 1),
        maxDrawdownPct: this.maxDrawdownPct,
        ambiguousBars: this.ambiguousBars,
        unresolvedPosition: this.position ? 1 : 0
      },
      side: {
        bull: this.subgroup(closed.filter(t => t.side === 'BULL')),
        bear: this.subgroup(closed.filter(t => t.side === 'BEAR'))
      },
      displacement: {
        d1: this.subgroup(closed.filter(t => t.displacementType === 'D1')),
        d2: this.subgroup(closed.filter(t => t.displacementType === 'D2'))
      },
      trades: closed
    };
  }
}

async function fetchHistory(runtime) {
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
  return candles;
}

function printSummary(label, result) {
  const o = result.overall;

  console.log(
    label + '|' +
    'TRADES=' + o.trades + '|' +
    'WINS=' + o.wins + '|' +
    'LOSSES=' + o.losses + '|' +
    'WIN_RATE=' + (Number.isFinite(o.winRate) ? (o.winRate * 100).toFixed(2) + '%' : 'NA') + '|' +
    'PF_R=' + (Number.isFinite(o.profitFactorR) ? o.profitFactorR.toFixed(3) : 'NA') + '|' +
    'EXP_R=' + (Number.isFinite(o.expectancyR) ? o.expectancyR.toFixed(3) : 'NA') + '|' +
    'TOTAL_R=' + o.totalR.toFixed(3) + '|' +
    'RETURN=' + (o.returnPct * 100).toFixed(2) + '%|' +
    'MAX_DD=' + (o.maxDrawdownPct * 100).toFixed(2) + '%|' +
    'AMBIG=' + o.ambiguousBars + '|' +
    'OPEN=' + o.unresolvedPosition
  );

  console.log(
    label + '_FUNNEL|' +
    'SWEEP=' + result.funnel.sweeps + '|' +
    'CHOCH=' + result.funnel.choch + '|' +
    'BOS=' + result.funnel.bos + '|' +
    'D1=' + result.funnel.d1Pass + '|' +
    'D2=' + result.funnel.d2Pass + '|' +
    'DISP=' + result.funnel.displacementPass + '|' +
    'FVG=' + result.funnel.fvgFound + '|' +
    'RETEST=' + result.funnel.retestTouch + '|' +
    'MID=' + result.funnel.midpointRetest + '|' +
    'R15=' + result.funnel.availableRPass + '|' +
    'H1=' + result.funnel.h1GatePass + '|' +
    'OPENED=' + result.funnel.tradesOpened
  );

  const formatGroup = (name, g) => {
    console.log(
      label + '_' + name + '|' +
      'TRADES=' + g.trades + '|' +
      'WIN_RATE=' + (Number.isFinite(g.winRate) ? (g.winRate * 100).toFixed(2) + '%' : 'NA') + '|' +
      'PF_R=' + (Number.isFinite(g.profitFactorR) ? g.profitFactorR.toFixed(3) : 'NA') + '|' +
      'EXP_R=' + (Number.isFinite(g.expectancyR) ? g.expectancyR.toFixed(3) : 'NA') + '|' +
      'TOTAL_R=' + g.totalR.toFixed(3)
    );
  };

  formatGroup('BULL', result.side.bull);
  formatGroup('BEAR', result.side.bear);
  formatGroup('D1', result.displacement.d1);
  formatGroup('D2', result.displacement.d2);
}

async function main() {
  const runtime = (await request('/api/tradelocker/runtime-config')).runtime;

  if (runtime?.tradingEnabled !== false || runtime?.killSwitch !== true) {
    throw new Error('RESEARCH_REQUIRES_EXECUTION_DISABLED');
  }

  const candles = await fetchHistory(runtime);

  const configs = [
    {
      name: 'baseline-1.10',
      d1Range: 1.10,
      d2Range: 1.20,
      d2Move: 0.80,
      d2Efficiency: 0.60
    },
    {
      name: 'challenger-1.00',
      d1Range: 1.00,
      d2Range: 1.20,
      d2Move: 0.80,
      d2Efficiency: 0.60
    }
  ];

  const results = {};

  for (const config of configs) {
    const engine = new BacktestEngine(requestedFrom, config);

    for (const candle of candles) {
      engine.onBar(candle);
    }

    results[config.name] = engine.summary();
  }

  const baseline = results['baseline-1.10'];
  const challenger = results['challenger-1.00'];

  const comparison = {
    tradeDelta: challenger.overall.trades - baseline.overall.trades,
    totalRDelta: challenger.overall.totalR - baseline.overall.totalR,
    expectancyRDelta:
      (challenger.overall.expectancyR ?? 0) -
      (baseline.overall.expectancyR ?? 0),
    profitFactorDelta:
      (challenger.overall.profitFactorR ?? 0) -
      (baseline.overall.profitFactorR ?? 0),
    returnPctDelta: challenger.overall.returnPct - baseline.overall.returnPct,
    maxDrawdownPctDelta: challenger.overall.maxDrawdownPct - baseline.overall.maxDrawdownPct
  };

  await fs.mkdir('research-output', { recursive: true });

  await fs.writeFile(
    'research-output/scalp-2i-full-backtest.json',
    JSON.stringify({
      source: 'TradeLocker',
      symbol: 'USDCHF',
      resolution: '5m',
      requestedFrom: new Date(requestedFrom).toISOString(),
      requestedTo: new Date(requestedTo).toISOString(),
      bars: candles.length,
      coverage: {
        from: new Date(candles[0].time).toISOString(),
        to: new Date(candles.at(-1).time).toISOString()
      },
      safety: {
        tradingEnabled: runtime.tradingEnabled,
        killSwitch: runtime.killSwitch
      },
      executionModel: {
        ordersSent: false,
        startingBalance: 500,
        riskPerTradePct: 1,
        spreadAndSlippage: 'not applied in 2I; reserved for 2K',
        entry: 'first qualifying FVG midpoint retest',
        stop: 'sweep extreme plus/minus 0.10 ATR',
        target: 'post-displacement impulse extreme before first retest',
        minimumAvailableR: 1.5,
        h1Gate: 'direction must match confirmed synthetic H1 structure bias at retest',
        overlappingPositions: 'not allowed',
        sameBarStopAndTarget: 'conservative stop-first'
      },
      results,
      comparison
    }, null, 2)
  );

  console.log('');
  console.log('========== 2I USDCHF M5 FULL STRATEGY BACKTEST ==========');
  console.log('BARS|' + candles.length);
  console.log('COVERAGE|' + new Date(candles[0].time).toISOString() + '|' + new Date(candles.at(-1).time).toISOString());
  console.log('MODEL|ENTRY=FVG50|STOP=SWEEP+0.10ATR|TARGET=POST_DISP_EXTREME|MIN_R=1.50|RISK=1%|COSTS=NONE|BOTH_HIT=STOP_FIRST');

  printSummary('BASELINE_1.10', baseline);
  printSummary('CHALLENGER_1.00', challenger);

  console.log(
    'DELTA_CHALLENGER_MINUS_BASELINE|' +
    'TRADES=' + comparison.tradeDelta + '|' +
    'TOTAL_R=' + comparison.totalRDelta.toFixed(3) + '|' +
    'EXP_R=' + comparison.expectancyRDelta.toFixed(3) + '|' +
    'PF_R=' + comparison.profitFactorDelta.toFixed(3) + '|' +
    'RETURN=' + (comparison.returnPctDelta * 100).toFixed(2) + '%|' +
    'MAX_DD=' + (comparison.maxDrawdownPctDelta * 100).toFixed(2) + '%'
  );

  console.log('=========================================================');
}

try {
  await main();
} catch (error) {
  console.error(error?.message || '2I backtest failed');
  process.exitCode = 1;
}
