import { tlFetch } from "./tradelocker";

export const TRADELOCKER_RESOLUTIONS = Object.freeze([
  "1m",
  "5m",
  "15m",
  "30m",
  "1H",
  "4H",
  "1D",
  "1W",
  "1M"
]);

const FIXED_RESOLUTION_MS = Object.freeze({
  "1m": 60 * 1000,
  "5m": 5 * 60 * 1000,
  "15m": 15 * 60 * 1000,
  "30m": 30 * 60 * 1000,
  "1H": 60 * 60 * 1000,
  "4H": 4 * 60 * 60 * 1000,
  "1D": 24 * 60 * 60 * 1000,
  "1W": 7 * 24 * 60 * 60 * 1000,
  // Used only for safe request chunk sizing. TradeLocker defines 1M bars by
  // calendar month, so the returned timestamps remain authoritative.
  "1M": 28 * 24 * 60 * 60 * 1000
});

const MAX_BARS_PER_REQUEST = 19000;
const DEFAULT_MAX_TOTAL_BARS = 50000;
const HARD_MAX_TOTAL_BARS = 100000;

function positiveInteger(value, name) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return parsed;
}

function epochMs(value, name) {
  if (value instanceof Date) {
    const time = value.getTime();
    if (!Number.isFinite(time)) throw new Error(`${name} is invalid`);
    return time;
  }

  if (typeof value === "string" && value.trim() !== "") {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) {
      return numeric < 100000000000 ? numeric * 1000 : numeric;
    }

    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
  }

  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric > 0) {
    return numeric < 100000000000 ? numeric * 1000 : numeric;
  }

  throw new Error(`${name} must be an ISO date or Unix timestamp`);
}

function finiteNumber(value, name) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`${name} must be numeric`);
  }
  return parsed;
}

function normalizeTradeLockerBar(bar) {
  if (!bar || typeof bar !== "object") {
    throw new Error("TradeLocker returned an invalid bar");
  }

  return {
    time: epochMs(bar.t ?? bar.time ?? bar.timestamp, "bar.time"),
    open: finiteNumber(bar.o ?? bar.open, "bar.open"),
    high: finiteNumber(bar.h ?? bar.high, "bar.high"),
    low: finiteNumber(bar.l ?? bar.low, "bar.low"),
    close: finiteNumber(bar.c ?? bar.close, "bar.close"),
    volume:
      bar.v == null && bar.volume == null
        ? null
        : finiteNumber(bar.v ?? bar.volume, "bar.volume")
  };
}

function extractBars(raw) {
  const candidates = [
    raw?.d?.barDetails,
    raw?.barDetails,
    raw?.d?.bars,
    raw?.bars
  ];

  const rows = candidates.find(Array.isArray) || [];
  return rows.map(normalizeTradeLockerBar);
}

function normalizeResolution(value) {
  const raw = String(value || "15m");
  const canonical =
    TRADELOCKER_RESOLUTIONS.find(
      resolution => resolution.toLowerCase() === raw.toLowerCase()
    ) || null;

  if (!canonical) {
    throw new Error(
      `resolution must be one of: ${TRADELOCKER_RESOLUTIONS.join(", ")}`
    );
  }

  return canonical;
}

export async function fetchTradeLockerHistory({
  symbol = "USDCHF",
  tradableInstrumentId = 7876,
  infoRouteId = 540002,
  resolution = "15m",
  from,
  to = Date.now(),
  maxBars = DEFAULT_MAX_TOTAL_BARS
} = {}) {
  const normalizedResolution = normalizeResolution(resolution);
  const instrumentId = positiveInteger(
    tradableInstrumentId,
    "tradableInstrumentId"
  );
  const routeId = positiveInteger(infoRouteId, "infoRouteId");

  const fromMs = epochMs(from, "from");
  const toMs = epochMs(to, "to");

  if (toMs <= fromMs) {
    throw new Error("to must be later than from");
  }

  const requestedMaxBars = Math.min(
    positiveInteger(maxBars, "maxBars"),
    HARD_MAX_TOTAL_BARS
  );

  const resolutionMs = FIXED_RESOLUTION_MS[normalizedResolution];
  const chunkSpanMs = resolutionMs * MAX_BARS_PER_REQUEST;

  let cursor = fromMs;
  const byTime = new Map();
  const chunks = [];

  while (cursor <= toMs && byTime.size < requestedMaxBars) {
    const chunkTo = Math.min(toMs, cursor + chunkSpanMs - resolutionMs);

    const path =
      `/trade/history?routeId=${routeId}` +
      `&tradableInstrumentId=${instrumentId}` +
      `&resolution=${encodeURIComponent(normalizedResolution)}` +
      `&from=${cursor}&to=${chunkTo}`;

    const raw = await tlFetch(path);
    const status = String(raw?.s || raw?.status || "ok").toLowerCase();
    const bars = extractBars(raw);

    for (const bar of bars) {
      if (bar.time >= fromMs && bar.time <= toMs) {
        byTime.set(bar.time, bar);
        if (byTime.size >= requestedMaxBars) break;
      }
    }

    chunks.push({
      from: cursor,
      to: chunkTo,
      status,
      bars: bars.length
    });

    // A no-data chunk is not an execution error. Advance across the requested
    // range without inventing candles.
    cursor = chunkTo + resolutionMs;
  }

  const candles = [...byTime.values()]
    .sort((a, b) => a.time - b.time)
    .slice(0, requestedMaxBars);

  return {
    source: "tradelocker",
    symbol: String(symbol).toUpperCase(),
    tradableInstrumentId: instrumentId,
    infoRouteId: routeId,
    resolution: normalizedResolution,
    from: fromMs,
    to: toMs,
    maxBars: requestedMaxBars,
    returnedBars: candles.length,
    truncated: byTime.size >= requestedMaxBars && cursor <= toMs,
    chunks,
    candles
  };
}
