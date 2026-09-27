import { normalizeCandle } from "./indicators";

const RESOLUTION_MS = Object.freeze({
  "1m": 60 * 1000,
  "5m": 5 * 60 * 1000,
  "15m": 15 * 60 * 1000,
  "30m": 30 * 60 * 1000,
  "1H": 60 * 60 * 1000,
  "4H": 4 * 60 * 60 * 1000,
  "1D": 24 * 60 * 60 * 1000,
  "1W": 7 * 24 * 60 * 60 * 1000
});

export function resolutionMs(resolution) {
  const raw = String(resolution || "");
  const canonical =
    Object.keys(RESOLUTION_MS).find(
      key => key.toLowerCase() === raw.toLowerCase()
    ) || null;

  if (!canonical) {
    throw new Error(
      `Unsupported fixed timeframe: ${resolution}`
    );
  }

  return {
    resolution: canonical,
    ms: RESOLUTION_MS[canonical]
  };
}

export function createCompletedTimeframeAggregator(resolution) {
  const resolved = resolutionMs(resolution);
  let bucket = null;

  function bucketStart(time) {
    return Math.floor(Number(time) / resolved.ms) * resolved.ms;
  }

  function add(input) {
    const candle = normalizeCandle(input);

    if (!Number.isFinite(Number(candle.time))) {
      throw new Error(
        "Higher-timeframe aggregation requires candle timestamps"
      );
    }

    const start = bucketStart(candle.time);

    if (!bucket) {
      bucket = {
        start,
        candle: {
          time: start,
          open: candle.open,
          high: candle.high,
          low: candle.low,
          close: candle.close,
          volume: candle.volume
        }
      };
      return null;
    }

    if (start < bucket.start) {
      throw new Error("Candles must be ordered by ascending time");
    }

    if (start === bucket.start) {
      bucket.candle.high = Math.max(
        bucket.candle.high,
        candle.high
      );
      bucket.candle.low = Math.min(
        bucket.candle.low,
        candle.low
      );
      bucket.candle.close = candle.close;

      if (bucket.candle.volume != null || candle.volume != null) {
        bucket.candle.volume =
          Number(bucket.candle.volume || 0) +
          Number(candle.volume || 0);
      }

      return null;
    }

    const completed = bucket.candle;

    bucket = {
      start,
      candle: {
        time: start,
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close,
        volume: candle.volume
      }
    };

    return completed;
  }

  function snapshot() {
    return bucket ? { ...bucket.candle } : null;
  }

  return {
    add,
    snapshot,
    resolution: resolved.resolution,
    resolutionMs: resolved.ms
  };
}
