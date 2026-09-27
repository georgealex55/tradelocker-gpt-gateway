import { neon } from "@neondatabase/serverless";

let client = null;

export function tradeStateDbConfigured() {
  return Boolean(process.env.DATABASE_URL);
}

export function tradeStateDbEnabled() {
  const flag = String(process.env.TRADE_STATE_DB_ENABLED || "true").toLowerCase();
  return tradeStateDbConfigured() && flag !== "false";
}

function getClient() {
  if (!tradeStateDbEnabled()) return null;
  if (!client) client = neon(process.env.DATABASE_URL);
  return client;
}

export async function dbQuery(text, params = []) {
  const sql = getClient();
  if (!sql) return [];
  return sql.query(text, params);
}

export async function dbHealth() {
  if (!tradeStateDbConfigured()) {
    return {
      configured: false,
      enabled: false,
      ok: false,
      reason: "DATABASE_URL is not configured"
    };
  }

  if (!tradeStateDbEnabled()) {
    return {
      configured: true,
      enabled: false,
      ok: false,
      reason: "TRADE_STATE_DB_ENABLED=false"
    };
  }

  try {
    const rows = await dbQuery(
      "select current_database() as database, now() as checked_at"
    );
    return {
      configured: true,
      enabled: true,
      ok: true,
      database: rows?.[0]?.database || null,
      checkedAt: rows?.[0]?.checked_at || null
    };
  } catch (error) {
    return {
      configured: true,
      enabled: true,
      ok: false,
      reason: error.message
    };
  }
}


function jsonValue(value) {
  return value == null ? null : JSON.stringify(value);
}

export async function recordSignalObservation({
  signal,
  riskEstimate = null,
  execution = null
} = {}) {
  if (!tradeStateDbEnabled() || !signal) return null;

  const candleTime = Number(signal.time);
  if (!Number.isFinite(candleTime)) return null;

  const rows = await dbQuery(
    `insert into signal_observations (
      strategy,
      strategy_version,
      symbol,
      candle_time,
      status,
      action,
      side,
      reference_entry,
      stop_loss,
      take_profit,
      target_r,
      spread_pips,
      regime_bias,
      risk_budget,
      min_lot_risk,
      min_lot_risk_percent,
      tradeable_within_budget,
      execution_status,
      execution_reason,
      checks_json,
      blocks_json,
      signal_json
    ) values (
      $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,
      $20::jsonb,$21::jsonb,$22::jsonb
    )
    on conflict (strategy, strategy_version, symbol, candle_time)
    do update set
      status = excluded.status,
      action = excluded.action,
      side = excluded.side,
      reference_entry = excluded.reference_entry,
      stop_loss = excluded.stop_loss,
      take_profit = excluded.take_profit,
      target_r = excluded.target_r,
      spread_pips = excluded.spread_pips,
      regime_bias = excluded.regime_bias,
      risk_budget = excluded.risk_budget,
      min_lot_risk = excluded.min_lot_risk,
      min_lot_risk_percent = excluded.min_lot_risk_percent,
      tradeable_within_budget = excluded.tradeable_within_budget,
      execution_status = excluded.execution_status,
      execution_reason = excluded.execution_reason,
      checks_json = excluded.checks_json,
      blocks_json = excluded.blocks_json,
      signal_json = excluded.signal_json,
      updated_at = now()
    returning *`,
    [
      signal.strategy,
      signal.version,
      signal.symbol,
      candleTime,
      signal.status,
      signal.action,
      signal.side || null,
      signal.referenceEntry ?? null,
      signal.stopLoss ?? null,
      signal.takeProfit ?? null,
      signal.targetR ?? null,
      signal.spreadPips ?? null,
      signal.regime?.bias || null,
      riskEstimate?.riskBudget ?? null,
      riskEstimate?.minLotRisk ?? null,
      riskEstimate?.minLotRiskPercent ?? null,
      riskEstimate?.tradeableWithinBudget ?? null,
      execution?.status || null,
      execution?.reason || null,
      jsonValue(signal.checks || {}),
      jsonValue(signal.blocks || []),
      jsonValue(signal)
    ]
  );

  return rows?.[0] || null;
}

export async function listRecentSignalObservations(limit = 100) {
  if (!tradeStateDbEnabled()) return [];

  const safeLimit = Math.min(500, Math.max(1, Number(limit) || 100));

  return dbQuery(
    `select *
     from signal_observations
     order by candle_time desc
     limit $1`,
    [safeLimit]
  );
}
