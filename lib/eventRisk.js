function epochMs(value) {
  const parsed =
    typeof value === "number" ? value : Date.parse(String(value));

  if (!Number.isFinite(parsed)) {
    throw new Error("Invalid event-risk timestamp");
  }

  return parsed;
}

function symbolCurrencies(symbol) {
  const normalized = String(symbol || "").toUpperCase();
  if (normalized.length < 6) return [];
  return [normalized.slice(0, 3), normalized.slice(3, 6)];
}

export function isInsideBlackout({
  symbol,
  time,
  blackouts = []
}) {
  const now = epochMs(time);
  const currencies = new Set(symbolCurrencies(symbol));

  for (const blackout of blackouts) {
    const from = epochMs(blackout.from);
    const to = epochMs(blackout.to);
    const scopedCurrencies = Array.isArray(blackout.currencies)
      ? blackout.currencies.map(x => String(x).toUpperCase())
      : [];

    const applies =
      scopedCurrencies.length === 0 ||
      scopedCurrencies.some(currency => currencies.has(currency));

    if (applies && now >= from && now <= to) {
      return {
        blocked: true,
        reason: "SCHEDULED_BLACKOUT",
        name: blackout.name || null,
        from,
        to
      };
    }
  }

  return {
    blocked: false,
    reason: null
  };
}

export function evaluateMarketShock({
  spreadPips = null,
  medianSpreadPips = null,
  atr = null,
  medianAtr = null,
  candleRange = null,
  maxSpreadPipsAbsolute = 3,
  spreadShockMultiple = 2,
  atrShockMultiple = 2,
  candleRangeShockMultiple = 2.5
} = {}) {
  const reasons = [];

  if (
    Number.isFinite(Number(spreadPips)) &&
    Number(spreadPips) > Number(maxSpreadPipsAbsolute)
  ) {
    reasons.push("ABSOLUTE_SPREAD");
  }

  if (
    Number.isFinite(Number(spreadPips)) &&
    Number.isFinite(Number(medianSpreadPips)) &&
    Number(medianSpreadPips) > 0 &&
    Number(spreadPips) >
      Number(medianSpreadPips) * Number(spreadShockMultiple)
  ) {
    reasons.push("SPREAD_SHOCK");
  }

  if (
    Number.isFinite(Number(atr)) &&
    Number.isFinite(Number(medianAtr)) &&
    Number(medianAtr) > 0 &&
    Number(atr) > Number(medianAtr) * Number(atrShockMultiple)
  ) {
    reasons.push("ATR_SHOCK");
  }

  if (
    Number.isFinite(Number(candleRange)) &&
    Number.isFinite(Number(atr)) &&
    Number(atr) > 0 &&
    Number(candleRange) >
      Number(atr) * Number(candleRangeShockMultiple)
  ) {
    reasons.push("CANDLE_RANGE_SHOCK");
  }

  return {
    blocked: reasons.length > 0,
    reasons
  };
}
