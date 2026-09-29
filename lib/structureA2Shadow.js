import {
  fetchTradeLockerHistory,
  fetchTradeLockerInstrumentSizing
} from "./marketData";
import { normalizeQuote, readAccountMetrics } from "./risk";
import { tlFetch } from "./tradelocker";
import { isInsideBlackout } from "./eventRisk";
import {
  buildCompletedH1,
  evaluateStructureA2
} from "./structureA2Core.mjs";

const M15 = 15 * 60 * 1000;
const DAY = 24 * 60 * 60 * 1000;

export const STRUCTURE_A2_SHADOW_CONFIG = Object.freeze({
  name: "structure-a2-displacement-short-shadow",
  version: "1.0.0-shadow",
  symbol: "USDCHF",
  entryChannelBars: 20,
  exitChannelBars: 10,
  atrBars: 14,
  atrStopMultiple: 2,
  pivotLeft: 2,
  pivotRight: 2,
  closeLocationMin: 0.75,
  bodyFractionMin: 0.5,
  displacementAtrMin: 0.1,
  maxLots: 0.01,
  riskCeilingPercent: 20,
  maxEntriesPerUtcDay: 2,
  entryHourUtcStart: 7,
  entryHourUtcEndExclusive: 16,
  maxSpreadPips: 2,
  maxSpreadAsStopFraction: 0.2,
  slippagePipsPerSide: 0.2,
  lookbackDays: 21
});

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
  equity,
  spreadPips
}) {
  if (!(entryPrice > 0) || !(stopLoss > 0) || !(equity > 0)) return null;

  const lots = Number(sizing.minLot);
  const units = lots * Number(sizing.lotSize);
  const stopDistance = Math.abs(entryPrice - stopLoss);
  const modeledCostPips =
    Math.max(0, Number(spreadPips) || 0) +
    2 * STRUCTURE_A2_SHADOW_CONFIG.slippagePipsPerSide;
  const modeledCostPrice = modeledCostPips * Number(sizing.pipSize);
  const quoteRisk = units * (stopDistance + modeledCostPrice);

  let riskAmount = null;

  if (sizing.accountCurrency === sizing.quotingCurrency) {
    riskAmount = quoteRisk;
  } else if (sizing.accountCurrency === sizing.baseCurrency) {
    riskAmount = quoteRisk / entryPrice;
  }

  if (riskAmount == null) return null;

  const ceiling = STRUCTURE_A2_SHADOW_CONFIG.riskCeilingPercent;
  const riskPercent = (riskAmount / equity) * 100;

  return {
    capital: equity,
    riskPercent: ceiling,
    riskBudget: equity * (ceiling / 100),
    minLot: lots,
    units,
    modeledCostPips,
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
    hour < STRUCTURE_A2_SHADOW_CONFIG.entryHourUtcStart ||
    hour >= STRUCTURE_A2_SHADOW_CONFIG.entryHourUtcEndExclusive
  ) {
    return "OUTSIDE_SESSION";
  }

  return null;
}

function candidateStage(setup) {
  if (!setup) return "INSUFFICIENT_HISTORY";
  if (setup.channelBreakSide !== "SELL") return "WAITING_FOR_BEARISH_CHANNEL_BREAK";
  if (setup.structureEvent?.type !== "BOS_BEARISH") return "WAITING_FOR_BEARISH_BOS";
  if (!setup.quality?.closeLocationPass) return "WEAK_CLOSE_LOCATION";
  if (!setup.quality?.bodyFractionPass) return "WEAK_BODY";
  if (!setup.quality?.displacementPass) return "WEAK_DISPLACEMENT";
  return "A2_SETUP";
}

export async function scanStructureA2Shadow({
  instrument,
  asOf = Date.now(),
  scheduledBlackouts = []
} = {}) {
  if (!instrument) throw new Error("instrument is required");

  if (
    String(instrument.symbol || "").toUpperCase() !==
    STRUCTURE_A2_SHADOW_CONFIG.symbol
  ) {
    throw new Error("STRUCTURE_A2_USDCHF_ONLY");
  }

  const currentM15Open = Math.floor(Number(asOf) / M15) * M15;
  const completedThrough = currentM15Open - 1;

  const sizing = await fetchTradeLockerInstrumentSizing({
    tradableInstrumentId: instrument.tradableInstrumentId,
    tradeRouteId: instrument.tradeRouteId,
    accountCurrency: "USD",
    maxLots: STRUCTURE_A2_SHADOW_CONFIG.maxLots
  });

  const history = await fetchTradeLockerHistory({
    symbol: instrument.symbol,
    tradableInstrumentId: instrument.tradableInstrumentId,
    infoRouteId: instrument.infoRouteId,
    resolution: "15m",
    from:
      completedThrough -
      STRUCTURE_A2_SHADOW_CONFIG.lookbackDays * DAY,
    to: completedThrough,
    maxBars: 5000
  });

  const bars = buildCompletedH1(history.candles);
  const setup = evaluateStructureA2(bars, STRUCTURE_A2_SHADOW_CONFIG);
  const quote = await currentQuote(instrument, sizing.pipSize);
  const acct = await readAccountMetrics();
  const equity = acct.equity ?? acct.balance ?? null;

  if (!setup) {
    const time = history.candles.at(-1)?.time ?? completedThrough;

    return {
      strategy: STRUCTURE_A2_SHADOW_CONFIG.name,
      version: STRUCTURE_A2_SHADOW_CONFIG.version,
      instrument,
      sizing,
      quote,
      account: { equity, balance: acct.balance ?? null },
      completedThrough,
      signal: {
        strategy: STRUCTURE_A2_SHADOW_CONFIG.name,
        version: STRUCTURE_A2_SHADOW_CONFIG.version,
        symbol: instrument.symbol,
        time,
        status: "WATCHING",
        action: "HOLD",
        side: null,
        freshForEntry: false,
        candidateStage: "INSUFFICIENT_HISTORY",
        spreadPips: quote.spreadPips ?? null,
        blocks: ["INSUFFICIENT_H1_HISTORY"],
        checks: {
          readOnly: true,
          shortOnly: true,
          riskCeilingPercent:
            STRUCTURE_A2_SHADOW_CONFIG.riskCeilingPercent,
          maxLots: STRUCTURE_A2_SHADOW_CONFIG.maxLots
        }
      },
      riskEstimate: null,
      execution: {
        status: "SHADOW_ONLY",
        reason: "READ_ONLY_SHADOW"
      }
    };
  }

  const signalTime = Number(setup.bar.lastM15Time);
  const expectedEntryTime = signalTime + M15;
  const freshForEntry = currentM15Open === expectedEntryTime;
  const stage = candidateStage(setup);
  const rawSide = setup.side;
  const blocks = [];

  let action = rawSide || "HOLD";
  let status = rawSide ? "SETUP_FORMING" : "WATCHING";

  if (rawSide) {
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

  if (rawSide) {
    const openProxy = freshForEntry
      ? await entryOpenProxy({
          instrument,
          entryTime: expectedEntryTime,
          asOf
        })
      : null;

    entryPrice = openProxy ?? quote.bid;

    if (entryPrice > 0) {
      stopLoss =
        entryPrice +
        STRUCTURE_A2_SHADOW_CONFIG.atrStopMultiple * setup.atr;
      stopPips =
        Math.abs(entryPrice - stopLoss) / Number(sizing.pipSize);

      if (
        Number.isFinite(Number(quote.spreadPips)) &&
        quote.spreadPips >
          STRUCTURE_A2_SHADOW_CONFIG.maxSpreadPips
      ) {
        blocks.push("SPREAD_ABSOLUTE_A2");
      }

      if (
        Number.isFinite(Number(quote.spreadPips)) &&
        stopPips > 0
      ) {
        spreadAsStopFraction = quote.spreadPips / stopPips;

        if (
          spreadAsStopFraction >
          STRUCTURE_A2_SHADOW_CONFIG.maxSpreadAsStopFraction
        ) {
          blocks.push("SPREAD_TO_STOP");
        }
      }

      riskEstimate = estimatedMinLotRisk({
        entryPrice,
        stopLoss,
        sizing,
        equity,
        spreadPips: quote.spreadPips
      });

      if (riskEstimate && !riskEstimate.tradeableWithinBudget) {
        blocks.push("MIN_LOT_EXCEEDS_20_PERCENT_RISK_CEILING");
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
    strategy: STRUCTURE_A2_SHADOW_CONFIG.name,
    version: STRUCTURE_A2_SHADOW_CONFIG.version,
    symbol: instrument.symbol,
    time: signalTime,
    h1Time: setup.bar.time,
    expectedEntryTime,
    freshForEntry,
    status,
    action,
    side: rawSide,
    candidateStage: stage,
    referenceEntry: entryPrice,
    stopLoss,
    takeProfit: null,
    targetR: null,
    stopPips,
    spreadPips: quote.spreadPips ?? null,
    spreadAsStopFraction,
    atr: setup.atr,
    structureTrend: setup.trend,
    latestHigh: setup.latestHigh,
    latestLow: setup.latestLow,
    structureEvent: setup.structureEvent,
    entryChannelHigh: setup.entryHigh,
    entryChannelLow: setup.entryLow,
    exitChannelHigh: setup.exitHigh,
    exitChannelLow: setup.exitLow,
    exitLong: setup.exitLong,
    exitShort: setup.exitShort,
    displacementBoundary: setup.boundary,
    breakoutQuality: setup.quality,
    blocks,
    checks: {
      readOnly: true,
      shortOnly: true,
      completedH1Bars: bars.length,
      entryChannelBars: STRUCTURE_A2_SHADOW_CONFIG.entryChannelBars,
      exitChannelBars: STRUCTURE_A2_SHADOW_CONFIG.exitChannelBars,
      atrBars: STRUCTURE_A2_SHADOW_CONFIG.atrBars,
      atrStopMultiple:
        STRUCTURE_A2_SHADOW_CONFIG.atrStopMultiple,
      closeLocationMin:
        STRUCTURE_A2_SHADOW_CONFIG.closeLocationMin,
      bodyFractionMin:
        STRUCTURE_A2_SHADOW_CONFIG.bodyFractionMin,
      displacementAtrMin:
        STRUCTURE_A2_SHADOW_CONFIG.displacementAtrMin,
      riskCeilingPercent:
        STRUCTURE_A2_SHADOW_CONFIG.riskCeilingPercent,
      maxLots: STRUCTURE_A2_SHADOW_CONFIG.maxLots,
      maxSpreadPips:
        STRUCTURE_A2_SHADOW_CONFIG.maxSpreadPips,
      maxSpreadAsStopFraction:
        STRUCTURE_A2_SHADOW_CONFIG.maxSpreadAsStopFraction
    }
  };

  return {
    strategy: STRUCTURE_A2_SHADOW_CONFIG.name,
    version: STRUCTURE_A2_SHADOW_CONFIG.version,
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
