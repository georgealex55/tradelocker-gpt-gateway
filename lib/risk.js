import { tlFetch, accountId } from "./tradelocker";

function numEnv(name, fallback) {
  const raw = process.env[name];
  if (raw == null || raw === "") return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

function boolEnv(name, fallback = false) {
  const raw = process.env[name];
  if (raw == null || raw === "") return fallback;
  return String(raw).toLowerCase() === "true";
}

function listEnv(name, fallback = []) {
  const raw = process.env[name];
  if (!raw) return fallback;
  return raw.split(",").map(x => x.trim().toUpperCase()).filter(Boolean);
}

function deepFindNumber(value, names) {
  if (value == null) return null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = deepFindNumber(item, names);
      if (found != null) return found;
    }
    return null;
  }
  if (typeof value !== "object") return null;

  for (const [key, val] of Object.entries(value)) {
    if (names.includes(key.toLowerCase())) {
      const n = Number(val);
      if (Number.isFinite(n)) return n;
    }
  }
  for (const val of Object.values(value)) {
    const found = deepFindNumber(val, names);
    if (found != null) return found;
  }
  return null;
}

export function normalizeQuote(raw) {
  const bid = deepFindNumber(raw, ["bid", "bidprice", "bid_price", "bestbid", "bp"]);
  const ask = deepFindNumber(raw, ["ask", "askprice", "ask_price", "bestask", "ap"]);
  return {
    bid,
    ask,
    mid: bid != null && ask != null ? (bid + ask) / 2 : null,
    spread: bid != null && ask != null ? ask - bid : null
  };
}

function deepFindArray(value, preferredKeys = []) {
  if (value == null) return [];
  if (typeof value !== "object") return [];

  if (!Array.isArray(value)) {
    for (const key of preferredKeys) {
      if (Array.isArray(value[key])) return value[key];
    }
    for (const val of Object.values(value)) {
      const found = deepFindArray(val, preferredKeys);
      if (found.length) return found;
    }
    return [];
  }

  return value;
}

function configColumns(config, wantedKey) {
  function walk(obj) {
    if (!obj || typeof obj !== "object") return null;
    for (const [k, v] of Object.entries(obj)) {
      if (k.toLowerCase() === wantedKey.toLowerCase() && Array.isArray(v)) return v;
    }
    for (const v of Object.values(obj)) {
      const found = walk(v);
      if (found) return found;
    }
    return null;
  }

  const rows = walk(config) || [];
  return rows.map(x => {
    if (typeof x === "string") return x;
    if (x && typeof x === "object") return x.name || x.field || x.key || x.column || null;
    return null;
  }).filter(Boolean);
}

function tableToObject(row, columns) {
  if (!Array.isArray(row) || !columns.length) return null;
  const out = {};
  for (let i = 0; i < Math.min(row.length, columns.length); i++) out[columns[i]] = row[i];
  return out;
}

function metric(obj, candidates) {
  if (!obj || typeof obj !== "object") return null;
  const normalized = {};
  for (const [k, v] of Object.entries(obj)) {
    normalized[k.toLowerCase().replace(/[^a-z0-9]/g, "")] = v;
  }
  for (const name of candidates) {
    const key = name.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (key in normalized) {
      const n = Number(normalized[key]);
      if (Number.isFinite(n)) return n;
    }
  }
  return null;
}

async function accountMetrics() {
  const [state, config] = await Promise.all([
    tlFetch(`/trade/accounts/${accountId()}/state`),
    tlFetch("/trade/config")
  ]);

  const row = state?.d?.accountDetailsData || state?.accountDetailsData || null;
  const columns = configColumns(config, "accountDetailsConfig");
  const readable = tableToObject(row, columns);

  return {
    readable,
    equity: metric(readable, ["equity", "accountEquity", "currentEquity"]),
    balance: metric(readable, ["balance", "accountBalance", "cashBalance"]),
    pnl: metric(readable, ["pnl", "profitLoss", "profitAndLoss", "dailyPnl", "netPnl"])
  };
}

function aligned(value, step) {
  if (!(step > 0)) return true;
  const q = value / step;
  return Math.abs(q - Math.round(q)) < 1e-8;
}

function estimatedRiskAmount({ units, entry, stopLoss, baseCurrency, quotingCurrency, accountCurrency }) {
  if (!(units > 0) || !(entry > 0) || !(stopLoss > 0)) return null;
  const quoteRisk = units * Math.abs(entry - stopLoss);
  if (accountCurrency === quotingCurrency) return quoteRisk;
  if (accountCurrency === baseCurrency) return quoteRisk / entry;
  return null;
}

export async function buildRiskPreview(input) {
  const checks = [];
  const warnings = [];
  const pass = (name, detail) => checks.push({ name, ok: true, detail });
  const fail = (name, detail) => checks.push({ name, ok: false, detail });

  const symbol = String(input.symbol || "USDCHF").toUpperCase();
  const tradableInstrumentId = Number(input.tradableInstrumentId || 7876);
  const tradeRouteId = Number(input.tradeRouteId || input.routeId || 540005);
  const infoRouteId = Number(input.infoRouteId || 540002);
  const side = String(input.side || "").toLowerCase();
  const type = String(input.type || "market").toLowerCase();
  const validity = input.validity || (type === "market" ? "IOC" : "GTC");

  if (boolEnv("KILL_SWITCH", false)) fail("kill_switch", "KILL_SWITCH=true");
  else pass("kill_switch", "off");

  const allowed = listEnv("ALLOWED_SYMBOLS", ["USDCHF"]);
  if (!allowed.includes(symbol)) fail("allowed_symbol", `${symbol} is not allowed`);
  else pass("allowed_symbol", symbol);

  if (!["buy", "sell"].includes(side)) fail("side", "Use buy or sell");
  else pass("side", side);

  if (!["market", "limit", "stop"].includes(type)) fail("order_type", "Use market, limit, or stop");
  else pass("order_type", type);

  if (type === "market" && validity !== "IOC") fail("validity", "Market orders require IOC");
  else if (type !== "market" && validity !== "GTC") fail("validity", "Limit/stop orders require GTC");
  else pass("validity", validity);

  const detailRaw = await tlFetch(`/trade/instruments/${tradableInstrumentId}?routeId=${tradeRouteId}`);
  const detail = detailRaw?.d || detailRaw;

  const lotSize = Number(detail?.lotSize);
  const lotStep = Number(detail?.lotStep);
  const minLot = Number(detail?.minLot);
  const brokerMaxLot = Number(detail?.maxLot);
  const tickSize = Array.isArray(detail?.tickSize)
    ? Number(detail.tickSize[0]?.tickSize)
    : Number(detail?.tickSize);

  const baseCurrency = String(detail?.baseCurrency || "").toUpperCase();
  const quotingCurrency = String(detail?.quotingCurrency || "").toUpperCase();

  let lots = input.lots != null ? Number(input.lots) : null;
  let units = input.qty != null ? Number(input.qty) : null;
  if (lots == null && units != null && lotSize > 0) lots = units / lotSize;
  if (units == null && lots != null && lotSize > 0) units = Math.round(lots * lotSize);

  if (!(lots > 0) || !(units > 0)) fail("quantity", "Provide lots or qty");
  else pass("quantity", `${lots} lots = ${units} units`);

  if (lots != null && minLot > 0 && lots < minLot) fail("broker_min_lot", `${lots} < ${minLot}`);
  else if (lots != null && minLot > 0) pass("broker_min_lot", minLot);

  if (lots != null && brokerMaxLot > 0 && lots > brokerMaxLot) fail("broker_max_lot", `${lots} > ${brokerMaxLot}`);
  else if (lots != null && brokerMaxLot > 0) pass("broker_max_lot", brokerMaxLot);

  if (lots != null && lotStep > 0 && !aligned(lots, lotStep)) fail("lot_step", `${lots} is not aligned to ${lotStep}`);
  else if (lots != null && lotStep > 0) pass("lot_step", lotStep);

  const maxLots = numEnv("MAX_LOTS_PER_TRADE", 0.01);
  if (lots != null && lots > maxLots) fail("max_lots_per_trade", `${lots} > ${maxLots}`);
  else if (lots != null) pass("max_lots_per_trade", maxLots);

  const maxUnits = numEnv("MAX_ORDER_UNITS", 1000);
  if (units != null && units > maxUnits) fail("max_order_units", `${units} > ${maxUnits}`);
  else if (units != null) pass("max_order_units", maxUnits);

  const quoteRaw = await tlFetch(`/trade/quotes?routeId=${infoRouteId}&tradableInstrumentId=${tradableInstrumentId}`);
  const quote = normalizeQuote(quoteRaw);
  const strictQuote = boolEnv("STRICT_QUOTE_CHECK", true);

  if (quote.bid == null || quote.ask == null) {
    if (strictQuote) fail("quote_available", "Quote returned, but bid/ask parser could not identify both prices");
    else warnings.push("Quote returned, but bid/ask parser could not identify both prices.");
  } else {
    pass("quote_available", `bid=${quote.bid}, ask=${quote.ask}`);
  }

  const pipSize = tickSize > 0 ? tickSize * 10 : 0.0001;
  const spreadPips = quote.spread != null ? quote.spread / pipSize : null;
  const maxSpreadPips = numEnv("MAX_SPREAD_PIPS", 3);
  if (spreadPips != null && spreadPips > maxSpreadPips) fail("max_spread", `${spreadPips.toFixed(2)} pips > ${maxSpreadPips}`);
  else if (spreadPips != null) pass("max_spread", `${spreadPips.toFixed(2)} pips`);

  let entryPrice = Number(input.entryPrice);
  if (!(entryPrice > 0) && type === "market") entryPrice = side === "buy" ? quote.ask : quote.bid;
  if (!(entryPrice > 0) && type === "limit") entryPrice = Number(input.price);
  if (!(entryPrice > 0) && type === "stop") entryPrice = Number(input.stopPrice);

  if (!(entryPrice > 0)) fail("entry_price", "Unable to determine entry price");
  else pass("entry_price", entryPrice);

  const stopLoss = input.stopLoss != null ? Number(input.stopLoss) : null;
  const takeProfit = input.takeProfit != null ? Number(input.takeProfit) : null;

  if (boolEnv("REQUIRE_STOP_LOSS", true) && !(stopLoss > 0)) fail("stop_loss_required", "stopLoss required");
  else if (stopLoss > 0) pass("stop_loss_required", stopLoss);

  if (boolEnv("REQUIRE_TAKE_PROFIT", true) && !(takeProfit > 0)) fail("take_profit_required", "takeProfit required");
  else if (takeProfit > 0) pass("take_profit_required", takeProfit);

  if (entryPrice > 0 && stopLoss > 0) {
    const good = (side === "buy" && stopLoss < entryPrice) || (side === "sell" && stopLoss > entryPrice);
    if (!good) fail("stop_loss_direction", "Stop loss is on the wrong side of entry");
    else pass("stop_loss_direction", "valid");
  }

  if (entryPrice > 0 && takeProfit > 0) {
    const good = (side === "buy" && takeProfit > entryPrice) || (side === "sell" && takeProfit < entryPrice);
    if (!good) fail("take_profit_direction", "Take profit is on the wrong side of entry");
    else pass("take_profit_direction", "valid");
  }

  const stopDistance = entryPrice > 0 && stopLoss > 0 ? Math.abs(entryPrice - stopLoss) : null;
  const rewardDistance = entryPrice > 0 && takeProfit > 0 ? Math.abs(takeProfit - entryPrice) : null;
  const rr = stopDistance > 0 && rewardDistance > 0 ? rewardDistance / stopDistance : null;
  const minRR = numEnv("MIN_RISK_REWARD", 1.5);

  if (rr != null && rr < minRR) fail("min_risk_reward", `${rr.toFixed(2)} < ${minRR}`);
  else if (rr != null) pass("min_risk_reward", rr.toFixed(2));

  const stopPips = stopDistance != null ? stopDistance / pipSize : null;
  const maxStopPips = numEnv("MAX_STOP_PIPS", 0);
  if (maxStopPips > 0 && stopPips != null && stopPips > maxStopPips) fail("max_stop_pips", `${stopPips.toFixed(1)} > ${maxStopPips}`);
  else if (maxStopPips > 0 && stopPips != null) pass("max_stop_pips", stopPips.toFixed(1));

  const [positionsRaw, ordersRaw, acct] = await Promise.all([
    tlFetch(`/trade/accounts/${accountId()}/positions`),
    tlFetch(`/trade/accounts/${accountId()}/orders`),
    accountMetrics()
  ]);

  const positions = deepFindArray(positionsRaw, ["positions", "positionsData"]);
  const orders = deepFindArray(ordersRaw, ["orders", "ordersData"]);

  const maxOpen = numEnv("MAX_OPEN_POSITIONS", 1);
  if (positions.length >= maxOpen) fail("max_open_positions", `${positions.length} >= ${maxOpen}`);
  else pass("max_open_positions", `${positions.length}/${maxOpen}`);

  const maxPending = numEnv("MAX_PENDING_ORDERS", 1);
  if (orders.length >= maxPending) fail("max_pending_orders", `${orders.length} >= ${maxPending}`);
  else pass("max_pending_orders", `${orders.length}/${maxPending}`);

  let dailyOrders = [];
  try {
    const now = new Date();
    const from = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    const historyRaw = await tlFetch(`/trade/accounts/${accountId()}/ordersHistory?from=${from}&to=${Date.now()}`);
    dailyOrders = deepFindArray(historyRaw, ["ordersHistory", "ordersHistoryData"]);
  } catch (e) {
    warnings.push(`Daily order-history check unavailable: ${e.message}`);
  }

  const maxDaily = numEnv("MAX_DAILY_TRADES", 5);
  if (dailyOrders.length >= maxDaily) fail("max_daily_trades", `${dailyOrders.length} >= ${maxDaily}`);
  else pass("max_daily_trades", `${dailyOrders.length}/${maxDaily}`);

  const accountCurrency = String(process.env.ACCOUNT_CURRENCY || baseCurrency || "USD").toUpperCase();
  const equityOverride = numEnv("ACCOUNT_EQUITY_OVERRIDE", 0);
  const equity = acct.equity ?? acct.balance ?? (equityOverride > 0 ? equityOverride : null);

  const riskAmount = estimatedRiskAmount({
    units, entry: entryPrice, stopLoss, baseCurrency, quotingCurrency, accountCurrency
  });

  const maxRiskPercent = numEnv("MAX_RISK_PERCENT", 1);
  let riskPercent = null;
  if (riskAmount != null && equity != null && equity > 0) {
    riskPercent = riskAmount / equity * 100;
    if (riskPercent > maxRiskPercent) fail("max_risk_percent", `${riskPercent.toFixed(2)}% > ${maxRiskPercent}%`);
    else pass("max_risk_percent", `${riskPercent.toFixed(2)}%`);
  } else if (boolEnv("STRICT_RISK_PERCENT_CHECK", true)) {
    fail("max_risk_percent", "Could not calculate account risk percentage");
  } else {
    warnings.push("Risk percentage could not be calculated.");
  }

  const maxRiskAmount = numEnv("MAX_RISK_AMOUNT", 0);
  if (maxRiskAmount > 0 && riskAmount != null && riskAmount > maxRiskAmount) fail("max_risk_amount", `${riskAmount.toFixed(4)} > ${maxRiskAmount} ${accountCurrency}`);
  else if (maxRiskAmount > 0 && riskAmount != null) pass("max_risk_amount", `${riskAmount.toFixed(4)} ${accountCurrency}`);

  const maxDailyLoss = numEnv("MAX_DAILY_LOSS_AMOUNT", 0);
  if (maxDailyLoss > 0 && acct.pnl != null && acct.pnl <= -Math.abs(maxDailyLoss)) fail("daily_loss_limit", `${acct.pnl} <= -${Math.abs(maxDailyLoss)}`);
  else if (maxDailyLoss > 0 && acct.pnl != null) pass("daily_loss_limit", acct.pnl);
  else if (maxDailyLoss > 0 && boolEnv("STRICT_DAILY_LOSS_CHECK", false)) fail("daily_loss_limit", "PnL field unavailable");

  const ok = checks.every(x => x.ok);

  const order = {
    qty: units,
    routeId: tradeRouteId,
    side,
    tradableInstrumentId,
    type,
    validity,
    price: type === "market" ? 0 : Number(input.price || 0),
    ...(type === "stop" ? { stopPrice: Number(input.stopPrice) } : {}),
    ...(stopLoss > 0 ? { stopLoss, stopLossType: input.stopLossType || "absolute" } : {}),
    ...(takeProfit > 0 ? { takeProfit, takeProfitType: input.takeProfitType || "absolute" } : {}),
    strategyId: String(input.strategyId || "chatgpt-gateway").slice(0, 31)
  };

  return {
    ok,
    symbol,
    instrument: {
      tradableInstrumentId,
      tradeRouteId,
      infoRouteId,
      lotSize,
      lotStep,
      minLot,
      maxLot: brokerMaxLot,
      tickSize,
      pipSize,
      baseCurrency,
      quotingCurrency
    },
    sizing: {
      lots,
      units,
      entryPrice,
      stopLoss,
      takeProfit,
      stopPips,
      riskReward: rr,
      accountCurrency,
      equity,
      estimatedRiskAmount: riskAmount,
      estimatedRiskPercent: riskPercent
    },
    quote: { ...quote, spreadPips },
    exposure: {
      openPositions: positions.length,
      pendingOrders: orders.length,
      finalOrdersTodayUTC: dailyOrders.length
    },
    checks,
    warnings,
    order
  };
}