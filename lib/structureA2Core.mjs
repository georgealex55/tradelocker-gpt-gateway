const M15 = 15 * 60 * 1000;
const H1 = 60 * 60 * 1000;

function max(values) {
  return Math.max(...values);
}

function min(values) {
  return Math.min(...values);
}

export function buildCompletedH1(candles = []) {
  const groups = new Map();

  for (const candle of candles) {
    const hour = Math.floor(Number(candle.time) / H1) * H1;
    if (!groups.has(hour)) groups.set(hour, []);
    groups.get(hour).push(candle);
  }

  const bars = [];

  for (const [hour, rows] of [...groups.entries()].sort((a, b) => a[0] - b[0])) {
    const ordered = [...rows].sort((a, b) => Number(a.time) - Number(b.time));
    if (ordered.length !== 4) continue;

    const expected = [0, 1, 2, 3].map(i => hour + i * M15);
    if (!expected.every((time, i) => Number(ordered[i]?.time) === time)) {
      continue;
    }

    bars.push({
      time: hour,
      lastM15Time: Number(ordered[3].time),
      open: Number(ordered[0].open),
      high: max(ordered.map(x => Number(x.high))),
      low: min(ordered.map(x => Number(x.low))),
      close: Number(ordered[3].close)
    });
  }

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

function atrSeries(bars, length = 14) {
  const trueRanges = [];
  const out = [];

  for (let i = 0; i < bars.length; i++) {
    const bar = bars[i];
    const priorClose = i ? bars[i - 1].close : bar.close;

    trueRanges.push(
      Math.max(
        bar.high - bar.low,
        Math.abs(bar.high - priorClose),
        Math.abs(bar.low - priorClose)
      )
    );

    out.push(
      i >= length - 1
        ? trueRanges
            .slice(i - length + 1, i + 1)
            .reduce((n, value) => n + value, 0) / length
        : null
    );
  }

  return out;
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

export function buildStructureTimeline(
  bars,
  {
    pivotLeft = 2,
    pivotRight = 2,
    atrBars = 14
  } = {}
) {
  const atr = atrSeries(bars, atrBars);
  const brokenLevels = new Set();
  const snapshots = [];
  let latestHigh = null;
  let latestLow = null;

  for (let j = 0; j < bars.length; j++) {
    const bar = bars[j];
    const candidateIndex = j - pivotRight;

    if (candidateIndex >= pivotLeft) {
      const pivotBar = bars[candidateIndex];

      if (isSwingHigh(bars, candidateIndex, pivotLeft, pivotRight)) {
        latestHigh = {
          id: `H:${pivotBar.time}`,
          kind: "HIGH",
          time: pivotBar.time,
          price: pivotBar.high,
          label: pivotLabel("HIGH", pivotBar.high, latestHigh),
          confirmedAt: bar.time
        };
      }

      if (isSwingLow(bars, candidateIndex, pivotLeft, pivotRight)) {
        latestLow = {
          id: `L:${pivotBar.time}`,
          kind: "LOW",
          time: pivotBar.time,
          price: pivotBar.low,
          label: pivotLabel("LOW", pivotBar.low, latestLow),
          confirmedAt: bar.time
        };
      }
    }

    const trend = trendFrom(latestHigh, latestLow);
    const priorClose = j ? bars[j - 1].close : bar.close;
    let event = null;

    if (
      latestHigh &&
      !brokenLevels.has(latestHigh.id) &&
      priorClose <= latestHigh.price &&
      bar.close > latestHigh.price
    ) {
      brokenLevels.add(latestHigh.id);
      event = {
        type: eventType("BUY", trend),
        direction: "BUY",
        trendBeforeBreak: trend,
        level: latestHigh.price,
        brokenPivot: { ...latestHigh },
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
      event = {
        type: eventType("SELL", trend),
        direction: "SELL",
        trendBeforeBreak: trend,
        level: latestLow.price,
        brokenPivot: { ...latestLow },
        h1Time: bar.time,
        signalTime: bar.lastM15Time,
        close: bar.close,
        atr: atr[j]
      };
    }

    snapshots.push({
      h1Time: bar.time,
      signalTime: bar.lastM15Time,
      bar: { ...bar },
      atr: atr[j],
      trend,
      latestHigh: latestHigh ? { ...latestHigh } : null,
      latestLow: latestLow ? { ...latestLow } : null,
      event
    });
  }

  return snapshots;
}

export function evaluateStructureA2(
  bars,
  {
    entryChannelBars = 20,
    exitChannelBars = 10,
    atrBars = 14,
    pivotLeft = 2,
    pivotRight = 2,
    closeLocationMin = 0.75,
    bodyFractionMin = 0.5,
    displacementAtrMin = 0.1
  } = {}
) {
  if (!Array.isArray(bars) || !bars.length) return null;

  const snapshots = buildStructureTimeline(bars, {
    atrBars,
    pivotLeft,
    pivotRight
  });
  const i = bars.length - 1;
  const needed = Math.max(entryChannelBars, exitChannelBars, atrBars - 1);

  if (i < needed) return null;

  const bar = bars[i];
  const snapshot = snapshots[i];
  const entryWindow = bars.slice(i - entryChannelBars, i);
  const exitWindow = bars.slice(i - exitChannelBars, i);

  const entryHigh = max(entryWindow.map(x => x.high));
  const entryLow = min(entryWindow.map(x => x.low));
  const exitHigh = max(exitWindow.map(x => x.high));
  const exitLow = min(exitWindow.map(x => x.low));

  const channelBreakSide =
    bar.close > entryHigh
      ? "BUY"
      : bar.close < entryLow
        ? "SELL"
        : null;

  const bearishBos =
    snapshot?.event?.type === "BOS_BEARISH" &&
    snapshot?.event?.direction === "SELL";

  const range = bar.high - bar.low;
  const boundary =
    bearishBos
      ? Math.min(entryLow, Number(snapshot.event.level))
      : null;

  const closeLocation =
    range > 0 ? (bar.high - bar.close) / range : null;
  const bodyFraction =
    range > 0 ? Math.abs(bar.close - bar.open) / range : null;
  const displacementATR =
    bearishBos && snapshot.atr > 0
      ? (boundary - bar.close) / snapshot.atr
      : null;

  const quality = {
    closeLocation,
    bodyFraction,
    displacementATR,
    closeLocationMin,
    bodyFractionMin,
    displacementAtrMin,
    closeLocationPass:
      Number.isFinite(closeLocation) &&
      closeLocation >= closeLocationMin,
    bodyFractionPass:
      Number.isFinite(bodyFraction) &&
      bodyFraction >= bodyFractionMin,
    displacementPass:
      Number.isFinite(displacementATR) &&
      displacementATR >= displacementAtrMin
  };

  const side =
    channelBreakSide === "SELL" &&
    bearishBos &&
    quality.closeLocationPass &&
    quality.bodyFractionPass &&
    quality.displacementPass
      ? "SELL"
      : null;

  return {
    bar,
    atr: snapshot.atr,
    trend: snapshot.trend,
    latestHigh: snapshot.latestHigh,
    latestLow: snapshot.latestLow,
    structureEvent: snapshot.event,
    channelBreakSide,
    side,
    entryHigh,
    entryLow,
    exitHigh,
    exitLow,
    exitLong: bar.close < exitLow,
    exitShort: bar.close > exitHigh,
    boundary,
    quality
  };
}
