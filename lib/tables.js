function findConfigSection(obj, target) {
  if (!obj || typeof obj !== "object") return null;

  for (const [key, value] of Object.entries(obj)) {
    if (key.toLowerCase() === target.toLowerCase()) return value;
  }

  for (const value of Object.values(obj)) {
    const found = findConfigSection(value, target);
    if (found) return found;
  }

  return null;
}

function columnNames(section) {
  if (!section) return [];

  const raw = Array.isArray(section)
    ? section
    : Array.isArray(section.columns)
    ? section.columns
    : [];

  return raw.map(x => {
    if (typeof x === "string") return x;
    if (x && typeof x === "object") {
      return x.id || x.name || x.field || x.key || x.column || x.label || null;
    }
    return null;
  }).filter(Boolean);
}

function findRows(raw, keys = []) {
  if (raw == null) return [];

  if (Array.isArray(raw)) {
    if (!raw.length) return [];
    if (Array.isArray(raw[0]) || (raw[0] && typeof raw[0] === "object")) return raw;
    return [];
  }

  if (typeof raw !== "object") return [];

  for (const key of keys) {
    if (Array.isArray(raw[key])) return raw[key];
  }

  if (raw.d != null) {
    const fromD = findRows(raw.d, keys);
    if (fromD.length) return fromD;
  }

  for (const value of Object.values(raw)) {
    const found = findRows(value, keys);
    if (found.length) return found;
  }

  return [];
}

function rowToObject(row, columns) {
  if (row && typeof row === "object" && !Array.isArray(row)) return row;
  if (!Array.isArray(row) || !columns.length) return null;

  const out = {};
  for (let i = 0; i < Math.min(row.length, columns.length); i++) {
    out[columns[i]] = row[i];
  }
  return out;
}

export function decodeTradeTable(raw, config, configKey, dataKeys = []) {
  const section = findConfigSection(config, configKey);
  const columns = columnNames(section);
  const rows = findRows(raw, dataKeys);

  return rows
    .map(row => rowToObject(row, columns))
    .filter(Boolean);
}

export function matchRows(rows, { orderId, positionId, strategyId }) {
  return rows.filter(row => {
    if (orderId != null && String(row.orderId ?? row.id ?? "") === String(orderId)) return true;
    if (positionId != null && String(row.positionId ?? row.id ?? "") === String(positionId)) return true;
    if (strategyId && String(row.strategyId ?? "") === String(strategyId)) return true;
    return false;
  });
}
