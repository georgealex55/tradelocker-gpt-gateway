import { fetchTradeLockerHistory, fetchTradeLockerInstrumentSizing } from "./marketData";
import { normalizeQuote, readAccountMetrics } from "./risk";
import { tlFetch } from "./tradelocker";
import { isInsideBlackout } from "./eventRisk";
import { effectiveMaxRiskPercent } from "./liveRiskPolicy";

const M15 = 15 * 60 * 1000;
const H1 = 60 * 60 * 1000;
const DAY = 24 * 60 * 60 * 1000;

export const PRICE_BREAKOUT_SHADOW_CONFIG = Object.freeze({
  name: "price-breakout-channel-v1-shadow",
  version: "1.0.0-shadow",
  entryChannelBars: 20,
  exitChannelBars: 10,
  atrBars: 14,
  atrStopMultiple: 2,
  maxLots: 0.01,
  maxEntriesPerUtcDay: 2,
  entryHourUtcStart: 7,
  entryHourUtcEndExclusive: 16,
  maxSpreadPips: 3,
  maxSpreadAsStopFraction: 0.2,
  lookbackDays: 21
});

function max(rows) {
  return Math.max(...rows);
}

function min(rows) {
  return Math.min(...rows);
}

function completedH1(candles) {
  const groups = new Map();

  for (const candle of candles) {
    const hour = Math.floor(Number(candle.time) / H1) * H1;
    if (!groups.has(hour)) groups.set(hour, []);
    groups.get(hour).push(candle);
  }

  const bars = [];

  for (const [hour, rows] of [...groups.entries()].sort((a, b) => a[0] - b[0])) {
    const ordered = rows.sort((a, b) => a.time - b.time);
    if (ordered.length !== 4) continue;

    const expected = [0, 1, 2, 3].map(i => hour + i * M15);
    if (!expected.every((t, i) => Number(ordered[i]?.time) === t)) continue;

    bars.push({
      time: hour,
      lastM15Time: ordered[3].time,
      open: ordered[0].open,
      high: max(ordered.map(x => x.high)),
      low: min(ordered.map(x => x.low)),
      close: ordered[3].close
    });
  }

  return bars;
}

function latestSetup(bars) {
  const i = bars.length - 1;
  const needed = Math.max(
    PRICE_BREAKOUT_SHADOW_CONFIG.entryChannelBars,
    PRICE_BREAKOUT_SHADOW_CONFIG.exitChannelBars,
    PRICE_BREAKOUT_SHADOW_CONFIG.atrBars - 1
  );

  if (i < needed) return null;

  const trueRanges = bars.map((bar, index) => {
    const priorClose = index ? bars[index - 1].close : bar.close;
    return Math.max(
      bar.high - bar.low,
      Math.abs(bar.high - priorClose),
      Math.abs(bar.low - priorClose)
    );
  });

  const bar = bars[i];
  const atrRows = trueRanges.slice(
    i - PRICE_BREAKOUT_SHADOW_CONFIG.atrBars + 1,
    i + 1
  );
  const atr = atrRows.reduce((n, x) => n + x, 0) / atrRows.length;

  const entryWindow = bars.slice(
    i - PRICE_BREAKOUT_SHADOW_CONFIG.entryChannelBars,
    i
  );
  const exitWindow = bars.slice(
    i - PRICE_BREAKOUT_SHADOW_CONFIG.exitChannelBars,
    i
  );

  const entryHigh = max(entryWindow.map(x => x.high));
  const entryLow = min(entryWindow.map(x => x.low));
  const exitHigh = max(exitWindow.map(x => x.high));
  const exitLow = min(exitWindow.map(x => x.low));

  let side = null;
  if (bar.close > entryHigh) side = "BUY";
  else if (bar.close < entryLow) side = "SELL";

  return {
    bar,
    atr,
    side,
    entryHigh,
    entryLow,
    exitHigh,
    exitLow,
    exitLong: bar.close < exitLow,
    exitShort: bar.close > exitHigh
  };
}

async function currentQuote(instrument, pipSize) {
  const raw = await tlFetch(
    `/trade/quotes?routeId=${instrument.infoRouteId}` +
    `&tradableInstrumentId=${instrument.tradableInstrumentId}`
  );
  const quote = normalizeQuote(raw);
  return {
    ...quote,
    spreadPips:
      quote.spread != null && pipSize > 0
        ? quote.spread / pipSize
        : null
  };
}

async function entryOpenProxy({ instrument, entryTime, asOf }) {
  if (!(entryTime > 0) || asOf <= entryTime) return null;

  try {
    const history = await fetchTradeLockerHistory({
      symbol: instrument.symbol,
      tradableInstrumentId: instrument.tradableInstrumentId,
      infoRouteId: instrument.infoRouteId,
      resolution: "1m",
      from: entryTime,
      to: Math.min(asOf, entryTime + 5 * 60 * 1000),
      maxBars: 10
    });
    return history.candles[0]?.open ?? null;
  } catch {
    return null;
  }
}

function estimatedMinLotRisk({
  entryPrice,
  stopLoss,
  sizing,
  equity
}) {
  if (!(entryPrice > 0) || !(stopLoss > 0) || !(equity > 0)) return null;

  const lots = Number(sizing.minLot);
  const units = lots * Number(sizing.lotSize);
  const quoteRisk = units * Math.abs(entryPrice - stopLoss);

  let riskAmount = null;
  if (sizing.accountCurrency === sizing.quotingCurrency) {
    riskAmount = quoteRisk;
  } else if (sizing.accountCurrency === sizing.baseCurrency) {
    riskAmount = quoteRisk / entryPrice;
  }

  if (riskAmount == null) return null;

  const riskPercent = (riskAmount / equity) * 100;
  const ceiling = effectiveMaxRiskPercent();

  return {
    capital: equity,
    riskPercent: ceiling,
    riskBudget: equity * (ceiling / 100),
    minLot: lots,
    units,
    minLotRisk: riskAmount,
    minLotRiskPercent: riskPercent,
    tradeableWithinBudget: riskPercent <= ceiling + 1e-9
  };
}

function sessionBlock(entryTime) {
  const date = new Date(entryTime);
  const hour = date.getUTCHours();

  if ([0, 6].includes(date.getUTCDay())) return "WEEKEND";
  if (
    hour < PRICE_BREAKOUT_SHADOW_CONFIG.entryHourUtcStart ||
    hour >= PRICE_BREAKOUT_SHADOW_CONFIG.entryHourUtcEndExclusive
  ) {
    return "OUTSIDE_SESSION";
  }
  return null;
}

export async function scanPriceBreakoutShadow({
  instrument,
  asOf = Date.now(),
  scheduledBlackouts = []
} = {}) {
  if (!instrument) throw new Error("instrument is required");

  const currentM15Open = Math.floor(Number(asOf) / M15) * M15;
  const completedThrough = currentM15Open - 1;

  const sizing = await fetchTradeLockerInstrumentSizing({
    tradableInstrumentId: instrument.tradableInstrumentId,
    tradeRouteId: instrument.tradeRouteId,
    accountCurrency: "USD",
    maxLots: PRICE_BREAKOUT_SHADOW_CONFIG.maxLots
  });

  const history = await fetchTradeLockerHistory({
    symbol: instrument.symbol,
    tradableInstrumentId: instrument.tradableInstrumentId,
    infoRouteId: instrument.infoRouteId,
    resolution: "15m",
    from: completedThrough - PRICE_BREAKOUT_SHADOW_CONFIG.lookbackDays * DAY,
    to: completedThrough,
    maxBars: 5000
  });

  const bars = completedH1(history.candles);
  const setup = latestSetup(bars);
  const quote = await currentQuote(instrument, sizing.pipSize);
  const acct = await readAccountMetrics();
  const equity = acct.equity ?? acct.balance ?? null;

  if (!setup) {
    return {
      strategy: PRICE_BREAKOUT_SHADOW_CONFIG.name,
      version: PRICE_BREAKOUT_SHADOW_CONFIG.version,
      instrument,
      sizing,
      quote,
      account: { equity, balance: acct.balance ?? null },
      completedThrough,
      signal: {
        strategy: PRICE_BREAKOUT_SHADOW_CONFIG.name,
        version: PRICE_BREAKOUT_SHADOW_CONFIG.version,
        symbol: instrument.symbol,
        time: history.candles.at(-1)?.time ?? completedThrough,
        status: "WATCHING",
        action: "HOLD",
        blocks: ["INSUFFICIENT_H1_HISTORY"],
        spreadPips: quote.spreadPips ?? null
      },
      riskEstimate: null,
      execution: { status: "SHADOW_ONLY", reason: "READ_ONLY_SHADOW" }
    };
  }

  const signalTime = Number(setup.bar.lastM15Time);
  const expectedEntryTime = signalTime + M15;
  const freshForEntry = currentM15Open === expectedEntryTime;
  const blocks = [];

  let action = setup.side || "HOLD";
  let status = setup.side ? "SETUP_FORMING" : "WATCHING";

  if (setup.side) {
    if (!freshForEntry) blocks.push("STALE_ENTRY_WINDOW");

    const sessionReason = sessionBlock(expectedEntryTime);
    if (sessionReason) blocks.push(sessionReason);

    const signalBlackout = isInsideBlackout({
      symbol: instrument.symbol,
      time: signalTime,
      blackouts: scheduledBlackouts
    });
    const entryBlackout = isInsideBlackout({
      symbol: instrument.symbol,
      time: expectedEntryTime,
      blackouts: scheduledBlackouts
    });

    if (signalBlackout.blocked || entryBlackout.blocked) {
      blocks.push("SCHEDULED_BLACKOUT");
    }
  }

  let entryPrice = null;
  let stopLoss = null;
  let stopPips = null;
  let spreadAsStopFraction = null;
  let riskEstimate = null;

  if (setup.side) {
    const openProxy = freshForEntry
      ? await entryOpenProxy({ instrument, entryTime: expectedEntryTime, asOf })
      : null;

    entryPrice =
      openProxy ??
      (setup.side === "BUY" ? quote.ask : quote.bid);

    if (entryPrice > 0) {
      stopLoss =
        entryPrice +
        (setup.side === "BUY" ? -1 : 1) *
          PRICE_BREAKOUT_SHADOW_CONFIG.atrStopMultiple *
          setup.atr;

      stopPips = Math.abs(entryPrice - stopLoss) / sizing.pipSize;

      if (
        Number.isFinite(Number(quote.spreadPips)) &&
        quote.spreadPips > PRICE_BREAKOUT_SHADOW_CONFIG.maxSpreadPips
      ) {
        blocks.push("SPREAD_ABSOLUTE");
      }

      if (
        Number.isFinite(Number(quote.spreadPips)) &&
        stopPips > 0
      ) {
        spreadAsStopFraction = quote.spreadPips / stopPips;
        if (
          spreadAsStopFraction >
          PRICE_BREAKOUT_SHADOW_CONFIG.maxSpreadAsStopFraction
        ) {
          blocks.push("SPREAD_TO_STOP");
        }
      }

      riskEstimate = estimatedMinLotRisk({
        entryPrice,
        stopLoss,
        sizing,
        equity
      });

      if (riskEstimate && !riskEstimate.tradeableWithinBudget) {
        blocks.push("MIN_LOT_EXCEEDS_27_PERCENT_RISK_BUDGET");
      }
    } else {
      blocks.push("ENTRY_PRICE_UNAVAILABLE");
    }

    if (blocks.length === 0) {
      status = "SIGNAL_READY";
    } else {
      status = "BLOCKED";
      action = "HOLD";
    }
  }

  const signal = {
    strategy: PRICE_BREAKOUT_SHADOW_CONFIG.name,
    version: PRICE_BREAKOUT_SHADOW_CONFIG.version,
    symbol: instrument.symbol,
    time: signalTime,
    h1Time: setup.bar.time,
    expectedEntryTime,
    freshForEntry,
    status,
    action,
    side: setup.side,
    referenceEntry: entryPrice,
    stopLoss,
    takeProfit: null,
    targetR: null,
    stopPips,
    spreadPips: quote.spreadPips ?? null,
    spreadAsStopFraction,
    atr: setup.atr,
    entryChannelHigh: setup.entryHigh,
    entryChannelLow: setup.entryLow,
    exitChannelHigh: setup.exitHigh,
    exitChannelLow: setup.exitLow,
    exitLong: setup.exitLong,
    exitShort: setup.exitShort,
    blocks,
    checks: {
      completedH1Bars: bars.length,
      entryChannelBars: PRICE_BREAKOUT_SHADOW_CONFIG.entryChannelBars,
      exitChannelBars: PRICE_BREAKOUT_SHADOW_CONFIG.exitChannelBars,
      atrBars: PRICE_BREAKOUT_SHADOW_CONFIG.atrBars,
      atrStopMultiple: PRICE_BREAKOUT_SHADOW_CONFIG.atrStopMultiple,
      maxRiskPercent: effectiveMaxRiskPercent(),
      maxLots: PRICE_BREAKOUT_SHADOW_CONFIG.maxLots
    }
  };

  return {
    strategy: PRICE_BREAKOUT_SHADOW_CONFIG.name,
    version: PRICE_BREAKOUT_SHADOW_CONFIG.version,
    instrument,
    sizing,
    quote,
    account: {
      equity,
      balance: acct.balance ?? null
    },
    completedThrough,
    latestH1: setup.bar,
    signal,
    riskEstimate,
    execution: {
      status: "SHADOW_ONLY",
      reason: "READ_ONLY_SHADOW"
    }
  };
}
