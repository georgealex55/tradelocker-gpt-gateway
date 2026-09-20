import crypto from "crypto";
import { tlFetch, accountId } from "./tradelocker";

function containsExact(value, target) {
  if (value == null) return false;
  if (typeof value === "string" || typeof value === "number") {
    return String(value) === String(target);
  }
  if (Array.isArray(value)) return value.some(v => containsExact(v, target));
  if (typeof value === "object") return Object.values(value).some(v => containsExact(v, target));
  return false;
}

export function makeStrategyId(idempotencyKey) {
  if (!idempotencyKey) return null;
  const digest = crypto
    .createHash("sha256")
    .update(String(idempotencyKey))
    .digest("hex")
    .slice(0, 24);
  return `cg-${digest}`;
}

export async function assertExpectedAccount() {
  const raw = await tlFetch("/trade/accounts");
  const list = Array.isArray(raw?.d) ? raw.d : [];
  const configuredId = String(accountId());
  const expectedId = String(process.env.EXPECTED_ACCOUNT_ID || configuredId);

  const account =
    list.find(a => String(a?.id) === configuredId) ||
    list.find(a => String(a?.id) === expectedId) ||
    null;

  if (!account) {
    throw new Error("Unable to find configured TradeLocker account in /trade/accounts");
  }

  if (String(account.id) !== expectedId) {
    throw new Error(
      `Connected account ID ${account.id} does not match locked account ID ${expectedId}`
    );
  }

  return {
    id: String(account.id),
    type: account.type || null,
    currency: account.currency || null,
    status: account.status || null
  };
}

export async function findDuplicateStrategy(strategyId, tradableInstrumentId) {
  if (!strategyId) {
    return { duplicate: false, strategyId: null, locations: [] };
  }

  const hours = Number(process.env.DEDUPE_LOOKBACK_HOURS || "168");
  const from = Date.now() - Math.max(1, hours) * 60 * 60 * 1000;
  const to = Date.now();
  const instrumentQuery = tradableInstrumentId
    ? `&tradableInstrumentId=${Number(tradableInstrumentId)}`
    : "";

  const [orders, positions, history] = await Promise.all([
    tlFetch(`/trade/accounts/${accountId()}/orders`).catch(() => null),
    tlFetch(`/trade/accounts/${accountId()}/positions`).catch(() => null),
    tlFetch(
      `/trade/accounts/${accountId()}/ordersHistory?from=${from}&to=${to}${instrumentQuery}`
    ).catch(() => null)
  ]);

  const locations = [];
  if (containsExact(orders, strategyId)) locations.push("orders");
  if (containsExact(positions, strategyId)) locations.push("positions");
  if (containsExact(history, strategyId)) locations.push("ordersHistory");

  return {
    duplicate: locations.length > 0,
    strategyId,
    locations
  };
}
