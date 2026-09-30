function finite(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function rowValues(row) {
  const values = row?.indicators?.values || {};
  const macd = values.macd;

  return {
    ema20: finite(values.ema?.[20]),
    ema50: finite(values.ema?.[50]),
    rsi: finite(values.rsi),
    macdHistogram: finite(macd?.histogram)
  };
}

export function evaluateSoftRegimePullback({
  regime,
  currentCandle,
  currentIndicators,
  recentRows = [],
  previousMacdHistogram = null,
  pullbackLookbackBars = 6,
  rsiMidline = 50
} = {}) {
  const direction =
    regime?.strength === "SOFT" &&
    ["LONG", "SHORT"].includes(regime?.direction)
      ? regime.direction
      : null;

  const current = {
    close: finite(currentCandle?.close),
    ema20: finite(currentIndicators?.ema20),
    ema50: finite(currentIndicators?.ema50),
    rsi: finite(currentIndicators?.rsi),
    macdHistogram: finite(currentIndicators?.macdHistogram)
  };

  const previousMacd = finite(previousMacdHistogram);
  const lookback = recentRows.slice(-Math.max(1, Number(pullbackLookbackBars) || 6));

  if (!direction) {
    return {
      eligible: false,
      direction: null,
      stage: "NOT_SOFT_REGIME",
      ready: false,
      countertrendPullback: false,
      recovery: {
        ema20Reclaim: false,
        rsiMidlineReclaim: false,
        macdZeroCross: false
      }
    };
  }

  const countertrendPullback = lookback.some(row => {
    const v = rowValues(row);
    if ([v.ema20, v.ema50, v.rsi, v.macdHistogram].some(x => x == null)) {
      return false;
    }

    return direction === "LONG"
      ? v.ema20 < v.ema50 && v.rsi < rsiMidline && v.macdHistogram < 0
      : v.ema20 > v.ema50 && v.rsi > rsiMidline && v.macdHistogram > 0;
  });

  const stable = [
    current.close,
    current.ema20,
    current.ema50,
    current.rsi,
    current.macdHistogram
  ].every(x => x != null);

  const ema20Reclaim = stable
    ? direction === "LONG"
      ? current.close > current.ema20
      : current.close < current.ema20
    : false;

  const rsiMidlineReclaim = stable
    ? direction === "LONG"
      ? current.rsi >= rsiMidline
      : current.rsi <= rsiMidline
    : false;

  const macdZeroCross =
    stable &&
    previousMacd != null
      ? direction === "LONG"
        ? previousMacd <= 0 && current.macdHistogram > 0
        : previousMacd >= 0 && current.macdHistogram < 0
      : false;

  const ready =
    countertrendPullback &&
    ema20Reclaim &&
    rsiMidlineReclaim &&
    macdZeroCross;

  let stage = "WAITING_FOR_COUNTERTREND_PULLBACK";

  if (countertrendPullback) {
    if (!ema20Reclaim) {
      stage = "WAITING_FOR_EMA20_RECLAIM";
    } else if (!rsiMidlineReclaim) {
      stage = "WAITING_FOR_RSI_MIDLINE";
    } else if (!macdZeroCross) {
      stage = "WAITING_FOR_MACD_ZERO_CROSS";
    } else {
      stage = "SOFT_REGIME_REVERSAL_READY";
    }
  }

  return {
    eligible: true,
    direction,
    stage,
    ready,
    countertrendPullback,
    current,
    recovery: {
      ema20Reclaim,
      rsiMidlineReclaim,
      macdZeroCross
    },
    thresholds: {
      pullbackLookbackBars: Math.max(1, Number(pullbackLookbackBars) || 6),
      rsiMidline
    }
  };
}
