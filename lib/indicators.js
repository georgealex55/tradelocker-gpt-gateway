import {
  ADX,
  ATR,
  EMA,
  MACD,
  RSI
} from "trading-signals";

const DEFAULT_CONFIG = Object.freeze({
  emaPeriods: [20, 50, 200],
  rsiPeriod: 14,
  atrPeriod: 14,
  adxPeriod: 14,
  macd: {
    fast: 12,
    slow: 26,
    signal: 9
  }
});

function finiteNumber(value, name) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    throw new Error(`${name} must be a finite number`);
  }
  return number;
}

export function normalizeCandle(input) {
  if (!input || typeof input !== "object") {
    throw new Error("candle must be an object");
  }

  const open = finiteNumber(input.open, "candle.open");
  const high = finiteNumber(input.high, "candle.high");
  const low = finiteNumber(input.low, "candle.low");
  const close = finiteNumber(input.close, "candle.close");
  const volume =
    input.volume == null ? null : finiteNumber(input.volume, "candle.volume");

  if (high < low) {
    throw new Error("candle.high must be >= candle.low");
  }

  if (open > high || open < low || close > high || close < low) {
    throw new Error("candle open/close must fall within high/low");
  }

  const time =
    input.time ??
    input.timestamp ??
    input.openTime ??
    input.t ??
    null;

  return {
    time,
    open,
    high,
    low,
    close,
    volume
  };
}

function uniquePositiveIntegers(values, fallback) {
  const source = Array.isArray(values) && values.length ? values : fallback;
  return [...new Set(
    source
      .map(Number)
      .filter(value => Number.isInteger(value) && value > 0)
  )].sort((a, b) => a - b);
}

function positiveInteger(value, fallback, name) {
  const parsed = Number(value ?? fallback);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return parsed;
}

function indicatorValue(indicator) {
  return indicator.isStable ? indicator.getResult() : null;
}

function push(indicator, value, replace) {
  return replace ? indicator.replace(value) : indicator.add(value);
}

export function createIndicatorEngine(config = {}) {
  const emaPeriods = uniquePositiveIntegers(
    config.emaPeriods,
    DEFAULT_CONFIG.emaPeriods
  );

  const rsiPeriod = positiveInteger(
    config.rsiPeriod,
    DEFAULT_CONFIG.rsiPeriod,
    "rsiPeriod"
  );

  const atrPeriod = positiveInteger(
    config.atrPeriod,
    DEFAULT_CONFIG.atrPeriod,
    "atrPeriod"
  );

  const adxPeriod = positiveInteger(
    config.adxPeriod,
    DEFAULT_CONFIG.adxPeriod,
    "adxPeriod"
  );

  const macdConfig = {
    fast: positiveInteger(
      config.macd?.fast,
      DEFAULT_CONFIG.macd.fast,
      "macd.fast"
    ),
    slow: positiveInteger(
      config.macd?.slow,
      DEFAULT_CONFIG.macd.slow,
      "macd.slow"
    ),
    signal: positiveInteger(
      config.macd?.signal,
      DEFAULT_CONFIG.macd.signal,
      "macd.signal"
    )
  };

  if (macdConfig.fast >= macdConfig.slow) {
    throw new Error("macd.fast must be less than macd.slow");
  }

  const emas = new Map(
    emaPeriods.map(period => [period, new EMA(period)])
  );

  const rsi = new RSI(rsiPeriod);
  const atr = new ATR(atrPeriod);
  const adx = new ADX(adxPeriod);
  const macd = new MACD(
    new EMA(macdConfig.fast),
    new EMA(macdConfig.slow),
    new EMA(macdConfig.signal)
  );

  let candlesProcessed = 0;
  let latestCandle = null;

  function snapshot() {
    const ema = {};
    const stable = {};

    for (const [period, indicator] of emas.entries()) {
      ema[period] = indicatorValue(indicator);
      stable[`ema${period}`] = indicator.isStable;
    }

    return {
      candlesProcessed,
      latestCandle,
      values: {
        ema,
        rsi: indicatorValue(rsi),
        atr: indicatorValue(atr),
        adx: indicatorValue(adx),
        adxPlusDi: adx.pdi ?? null,
        adxMinusDi: adx.mdi ?? null,
        macd: indicatorValue(macd)
      },
      stable: {
        ...stable,
        rsi: rsi.isStable,
        atr: atr.isStable,
        adx: adx.isStable,
        macd: macd.isStable
      },
      requiredInputs: {
        ema: Object.fromEntries(
          [...emas.entries()].map(([period, indicator]) => [
            period,
            indicator.getRequiredInputs()
          ])
        ),
        rsi: rsi.getRequiredInputs(),
        atr: atr.getRequiredInputs(),
        adx: adx.getRequiredInputs(),
        macd: macd.getRequiredInputs()
      },
      config: {
        emaPeriods,
        rsiPeriod,
        atrPeriod,
        adxPeriod,
        macd: macdConfig
      }
    };
  }

  function update(candleInput, { replace = false } = {}) {
    const candle = normalizeCandle(candleInput);

    if (!replace) candlesProcessed += 1;
    latestCandle = candle;

    for (const indicator of emas.values()) {
      push(indicator, candle.close, replace);
    }

    push(rsi, candle.close, replace);

    const highLowClose = {
      high: candle.high,
      low: candle.low,
      close: candle.close
    };

    push(atr, highLowClose, replace);
    push(adx, highLowClose, replace);
    push(macd, candle.close, replace);

    return snapshot();
  }

  function warmup(candles = []) {
    let result = snapshot();
    for (const candle of candles) {
      result = update(candle);
    }
    return result;
  }

  return {
    update,
    warmup,
    snapshot,
    get config() {
      return snapshot().config;
    }
  };
}

export function calculateIndicators(candles = [], config = {}) {
  const engine = createIndicatorEngine(config);
  const snapshots = candles.map(candle => engine.update(candle));
  return {
    snapshots,
    latest: engine.snapshot()
  };
}
