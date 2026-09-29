const M15 = 15 * 60 * 1000;
const H1 = 60 * 60 * 1000;

function max(values) {
  return Math.max(...values);
}

function min(values) {
  return Math.min(...values);
}

export function buildCompletedH1(candles) {
  const bars = [];
  let bucket = [];
  let bucketHour = null;

  const flush = () => {
    if (!bucket.length) return;

    if (bucket.length === 4) {
      const expected = [0, 1, 2, 3].map(i => bucketHour + i * M15);
      const ordered = [...bucket].sort((a, b) => a.time - b.time);
      if (expected.every((time, i) => Number(ordered[i]?.time) === time)) {
        bars.push({
          time: bucketHour,
          lastM15Time: ordered[3].time,
          open: ordered[0].open,
          high: max(ordered.map(x => x.high)),
          low: min(ordered.map(x => x.low)),
          close: ordered[3].close
        });
      }
    }

    bucket = [];
  };

  for (const candle of candles) {
    const hour = Math.floor(Number(candle.time) / H1) * H1;

    if (bucketHour != null && hour !== bucketHour) {
      flush();
    }

    if (!bucket.length) bucketHour = hour;
    bucket.push(candle);
  }

  flush();
  return bars;
}

function pivotLabel(kind, price, prior) {
  if (!prior) return kind === "HIGH" ? "FIRST_HIGH" : "FIRST_LOW";

  if (kind === "HIGH") {
    if (price > prior.price) return "HH";
    if (price < prior.price) return "LH";
    return "EQH";
  }

  if (price > prior.price) return "HL";
  if (price < prior.price) return "LL";
  return "EQL";
}

function trendFrom(latestHigh, latestLow) {
  if (latestHigh?.label === "HH" && latestLow?.label === "HL") {
    return "BULLISH";
  }
  if (latestHigh?.label === "LH" && latestLow?.label === "LL") {
    return "BEARISH";
  }
  return "NEUTRAL";
}

function atrSeries(bars, length = 14) {
  const tr = [];
  const out = [];

  for (let i = 0; i < bars.length; i++) {
    const bar = bars[i];
    const priorClose = i ? bars[i - 1].close : bar.close;

    tr.push(
      Math.max(
        bar.high - bar.low,
        Math.abs(bar.high - priorClose),
        Math.abs(bar.low - priorClose)
      )
    );

    out.push(
      i >= length - 1
        ? tr.slice(i - length + 1, i + 1).reduce((n, x) => n + x, 0) / length
        : null
    );
  }

  return out;
}

function isSwingHigh(bars, i, left = 2, right = 2) {
  if (i - left < 0 || i + right >= bars.length) return false;
  const value = bars[i].high;

  for (let j = i - left; j <= i + right; j++) {
    if (j === i) continue;
    if (!(value > bars[j].high)) return false;
  }

  return true;
}

function isSwingLow(bars, i, left = 2, right = 2) {
  if (i - left < 0 || i + right >= bars.length) return false;
  const value = bars[i].low;

  for (let j = i - left; j <= i + right; j++) {
    if (j === i) continue;
    if (!(value < bars[j].low)) return false;
  }

  return true;
}

function eventType(direction, trend) {
  if (direction === "BUY") {
    if (trend === "BULLISH") return "BOS_BULLISH";
    if (trend === "BEARISH") return "CHOCH_BULLISH";
    return "BREAK_BULLISH";
  }

  if (trend === "BEARISH") return "BOS_BEARISH";
  if (trend === "BULLISH") return "CHOCH_BEARISH";
  return "BREAK_BEARISH";
}

export function buildMarketStructureFromH1(
  bars,
  {
    pivotLeft = 2,
    pivotRight = 2,
    atrBars = 14
  } = {}
) {
  const atr = atrSeries(bars, atrBars);
  const brokenLevels = new Set();
  const events = [];
  const snapshots = [];
  let latestHigh = null;
  let latestLow = null;

  for (let j = 0; j < bars.length; j++) {
    const bar = bars[j];
    const confirmedPivots = [];
    const candidateIndex = j - pivotRight;

    if (candidateIndex >= pivotLeft) {
      const pivotBar = bars[candidateIndex];

      if (isSwingHigh(bars, candidateIndex, pivotLeft, pivotRight)) {
        const pivot = {
          id: `H:${pivotBar.time}`,
          kind: "HIGH",
          time: pivotBar.time,
          price: pivotBar.high,
          label: pivotLabel("HIGH", pivotBar.high, latestHigh),
          confirmedAt: bar.time,
          confirmedLastM15Time: bar.lastM15Time
        };
        latestHigh = pivot;
        confirmedPivots.push(pivot);
      }

      if (isSwingLow(bars, candidateIndex, pivotLeft, pivotRight)) {
        const pivot = {
          id: `L:${pivotBar.time}`,
          kind: "LOW",
          time: pivotBar.time,
          price: pivotBar.low,
          label: pivotLabel("LOW", pivotBar.low, latestLow),
          confirmedAt: bar.time,
          confirmedLastM15Time: bar.lastM15Time
        };
        latestLow = pivot;
        confirmedPivots.push(pivot);
      }
    }

    const trend = trendFrom(latestHigh, latestLow);
    const priorClose = j ? bars[j - 1].close : bar.close;
    let structureEvent = null;

    if (
      latestHigh &&
      !brokenLevels.has(latestHigh.id) &&
      priorClose <= latestHigh.price &&
      bar.close > latestHigh.price
    ) {
      brokenLevels.add(latestHigh.id);
      structureEvent = {
        type: eventType("BUY", trend),
        direction: "BUY",
        trendBeforeBreak: trend,
        brokenPivot: { ...latestHigh },
        level: latestHigh.price,
        h1Time: bar.time,
        signalTime: bar.lastM15Time,
        close: bar.close,
        atr: atr[j]
      };
    } else if (
      latestLow &&
      !brokenLevels.has(latestLow.id) &&
      priorClose >= latestLow.price &&
      bar.close < latestLow.price
    ) {
      brokenLevels.add(latestLow.id);
      structureEvent = {
        type: eventType("SELL", trend),
        direction: "SELL",
        trendBeforeBreak: trend,
        brokenPivot: { ...latestLow },
        level: latestLow.price,
        h1Time: bar.time,
        signalTime: bar.lastM15Time,
        close: bar.close,
        atr: atr[j]
      };
    }

    if (structureEvent) events.push(structureEvent);

    snapshots.push({
      h1Time: bar.time,
      signalTime: bar.lastM15Time,
      close: bar.close,
      atr: atr[j],
      trend,
      latestHigh: latestHigh ? { ...latestHigh } : null,
      latestLow: latestLow ? { ...latestLow } : null,
      confirmedPivots: confirmedPivots.map(x => ({ ...x })),
      event: structureEvent ? { ...structureEvent } : null
    });
  }

  return {
    bars,
    snapshots,
    events,
    bySignalTime: Object.fromEntries(
      snapshots.map(snapshot => [snapshot.signalTime, snapshot])
    )
  };
}

export function buildMarketStructure(candles, options = {}) {
  return buildMarketStructureFromH1(buildCompletedH1(candles), options);
}

export function findRetestEntry({
  candles,
  event,
  maxRetestBars = 8
}) {
  if (!event || !["BUY", "SELL"].includes(event.direction)) return null;

  const byTime = new Map(candles.map(c => [Number(c.time), c]));
  const firstRetestTime = Number(event.signalTime) + M15;
  const level = Number(event.level);
  const buy = event.direction === "BUY";

  for (let i = 0; i < maxRetestBars; i++) {
    const retestTime = firstRetestTime + i * M15;
    const candle = byTime.get(retestTime);

    if (!candle) continue;

    const validRetest = buy
      ? candle.low <= level && candle.close > level
      : candle.high >= level && candle.close < level;

    if (validRetest) {
      const entryTime = retestTime + M15;
      const entryCandle = byTime.get(entryTime);

      if (!entryCandle) {
        return {
          state: "NO_ENTRY_CANDLE",
          event,
          retestTime,
          entryTime,
          level
        };
      }

      return {
        state: "READY",
        event,
        retestTime,
        entryTime,
        entryPrice: entryCandle.open,
        level
      };
    }

    const invalidated = buy
      ? candle.close < level
      : candle.close > level;

    if (invalidated) {
      return {
        state: "INVALIDATED",
        event,
        retestTime,
        entryTime: null,
        level
      };
    }
  }

  return {
    state: "EXPIRED",
    event,
    retestTime: null,
    entryTime: null,
    level
  };
}

export function armChochBosSequences(events) {
  let armedDirection = null;
  const confirmations = [];

  for (const event of events) {
    if (event.type === "CHOCH_BULLISH") {
      armedDirection = "BUY";
      continue;
    }

    if (event.type === "CHOCH_BEARISH") {
      armedDirection = "SELL";
      continue;
    }

    if (
      armedDirection === "BUY" &&
      event.type === "BOS_BULLISH"
    ) {
      confirmations.push({
        ...event,
        reversalConfirmedBy: "CHOCH_TO_BOS",
        armedDirection
      });
      armedDirection = null;
      continue;
    }

    if (
      armedDirection === "SELL" &&
      event.type === "BOS_BEARISH"
    ) {
      confirmations.push({
        ...event,
        reversalConfirmedBy: "CHOCH_TO_BOS",
        armedDirection
      });
      armedDirection = null;
    }
  }

  return confirmations;
}
