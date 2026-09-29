import { neon } from "@neondatabase/serverless";

let client = null;

const DEFAULT_TRADE_STATE_DATABASE = "tradelocker_gateway";

function tradeStateDatabaseUrl() {
  const raw = process.env.TRADE_STATE_DATABASE_URL || process.env.DATABASE_URL;
  if (!raw) return null;

  try {
    const url = new URL(raw);
    const databaseName =
      process.env.TRADE_STATE_DATABASE_NAME ||
      DEFAULT_TRADE_STATE_DATABASE;

    url.pathname = `/${databaseName}`;
    return url.toString();
  } catch {
    return raw;
  }
}

export function tradeStateDbConfigured() {
  return Boolean(tradeStateDatabaseUrl());
}

export function tradeStateDbEnabled() {
  const flag = String(process.env.TRADE_STATE_DB_ENABLED || "true").toLowerCase();
  return tradeStateDbConfigured() && flag !== "false";
}

function getClient() {
  if (!tradeStateDbEnabled()) return null;

  if (!client) {
    const url = tradeStateDatabaseUrl();
    if (!url) return null;
    client = neon(url);
  }

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
      reason: "Trade-state database URL is not configured"
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
      `select
         current_database() as database,
         now() as checked_at,
         to_regclass('public.trade_runs') as trade_runs,
         to_regclass('public.trade_events') as trade_events,
         to_regclass('public.account_snapshots') as account_snapshots,
         to_regclass('public.trading_system_state') as trading_system_state,
         to_regclass('public.signal_observations') as signal_observations`
    );

    const row = rows?.[0] || {};
    const tables = {
      tradeRuns: Boolean(row.trade_runs),
      tradeEvents: Boolean(row.trade_events),
      accountSnapshots: Boolean(row.account_snapshots),
      tradingSystemState: Boolean(row.trading_system_state),
      signalObservations: Boolean(row.signal_observations)
    };
    const schemaReady = Object.values(tables).every(Boolean);

    return {
      configured: true,
      enabled: true,
      ok: schemaReady,
      connected: true,
      schemaReady,
      database: row.database || null,
      checkedAt: row.checked_at || null,
      tables,
      reason: schemaReady
        ? null
        : "Database connected but trade-state migration is incomplete"
    };
  } catch (error) {
    return {
      configured: true,
      enabled: true,
      ok: false,
      connected: false,
      schemaReady: false,
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
  if (!signal) {
    console.info("[trade-state] signal persistence skipped", {
      reason: "NO_SIGNAL"
    });
    return null;
  }

  if (!tradeStateDbEnabled()) {
    console.info("[trade-state] signal persistence skipped", {
      reason: tradeStateDbConfigured()
        ? "DB_DISABLED"
        : "DATABASE_URL_MISSING",
      configured: tradeStateDbConfigured(),
      enabled: tradeStateDbEnabled()
    });
    return null;
  }

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
    where not (
      coalesce(
        (signal_observations.signal_json->>'freshForEntry')::boolean,
        false
      )
      and not coalesce(
        (excluded.signal_json->>'freshForEntry')::boolean,
        false
      )
    )
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

  let saved = rows?.[0] || null;
  let preservedFresh = false;

  // The conditional UPSERT intentionally returns no row when an existing
  // fresh entry-window observation wins over a later stale re-scan. Fetch the
  // preserved row so callers still see persistence as successful.
  if (!saved) {
    const existing = await dbQuery(
      `select *
       from signal_observations
       where strategy = $1
         and strategy_version = $2
         and symbol = $3
         and candle_time = $4
       limit 1`,
      [signal.strategy, signal.version, signal.symbol, candleTime]
    );

    const preserved = existing?.[0] || null;
    if (
      preserved &&
      preserved.signal_json?.freshForEntry === true &&
      signal.freshForEntry !== true
    ) {
      saved = preserved;
      preservedFresh = true;
    }
  }

  console.info("[trade-state] signal persistence result", {
    configured: tradeStateDbConfigured(),
    enabled: tradeStateDbEnabled(),
    saved: Boolean(saved),
    preservedFresh,
    symbol: signal.symbol,
    candleTime
  });

  return saved;
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
