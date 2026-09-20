const env = (k) => {
  const v = process.env[k];
  if (!v) throw new Error(`Missing environment variable: ${k}`);
  return v;
};

export function baseUrl() {
  return process.env.TRADELOCKER_ENV === "live"
    ? "https://live.tradelocker.com/backend-api"
    : "https://demo.tradelocker.com/backend-api";
}

export async function login() {
  const res = await fetch(`${baseUrl()}/auth/jwt/token`, {
    method: "POST",
    headers: {"content-type":"application/json"},
    body: JSON.stringify({
      email: env("TRADELOCKER_EMAIL"),
      password: env("TRADELOCKER_PASSWORD"),
      server: env("TRADELOCKER_SERVER")
    }),
    cache: "no-store"
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`TradeLocker login failed ${res.status}: ${text}`);
  const data = JSON.parse(text);
  const token = data.accessToken || data.access_token;
  if (!token) throw new Error("TradeLocker did not return accessToken");
  return token;
}

export async function tlFetch(path, options={}) {
  const token = await login();
  const headers = {
    "content-type":"application/json",
    "Authorization": `Bearer ${token}`,
    "accNum": env("TRADELOCKER_ACC_NUM"),
    ...(process.env.TRADELOCKER_DEVELOPER_API_KEY
      ? {"developer-api-key": process.env.TRADELOCKER_DEVELOPER_API_KEY}
      : {}),
    ...(options.headers || {})
  };
  const res = await fetch(`${baseUrl()}${path}`, {...options, headers, cache:"no-store"});
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = {raw:text}; }
  if (!res.ok) throw new Error(`TradeLocker ${res.status}: ${text}`);
  return data;
}

export function accountId() { return env("TRADELOCKER_ACCOUNT_ID"); }

export function validateOrder(o) {
  const allowedSides = ["buy","sell"];
  if (!allowedSides.includes(String(o.side || "").toLowerCase())) throw new Error("side must be buy or sell");
  if (!(Number(o.qty) > 0)) throw new Error("qty must be > 0");
  if (!Number.isFinite(Number(o.routeId))) throw new Error("routeId required");
  if (!Number.isFinite(Number(o.tradableInstrumentId))) throw new Error("tradableInstrumentId required");

  const maxQty = Number(process.env.MAX_ORDER_QTY || "1");
  if (Number(o.qty) > maxQty) throw new Error(`qty exceeds MAX_ORDER_QTY (${maxQty})`);

  if (process.env.REQUIRE_STOP_LOSS !== "false" && o.stopLoss == null)
    throw new Error("stopLoss required by gateway");

  return {
    qty: Number(o.qty),
    routeId: Number(o.routeId),
    side: String(o.side).toLowerCase(),
    tradableInstrumentId: Number(o.tradableInstrumentId),
    type: o.type || "market",
    validity: o.validity || "IOC",
    price: Number(o.price || 0),
    ...(o.stopLoss != null ? {stopLoss:Number(o.stopLoss), stopLossType:o.stopLossType || "absolute"} : {}),
    ...(o.takeProfit != null ? {takeProfit:Number(o.takeProfit), takeProfitType:o.takeProfitType || "absolute"} : {})
  };
}
