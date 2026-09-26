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
