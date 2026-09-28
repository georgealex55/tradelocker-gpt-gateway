import { dbQuery, tradeStateDbEnabled } from '../db';

export const RESEARCH_COLLECTION_ID = 'portfolio-144-tradelocker-2024-2026-v1';
const SYMBOLS = ['USDCHF','EURUSD','GBPUSD'];

function enabled() {
  if (!tradeStateDbEnabled()) throw new Error('RESEARCH_DATABASE_UNAVAILABLE');
}

export async function loadHistoryCollection() {
  enabled();
  const runs = await dbQuery(
    'SELECT * FROM research_history_collections WHERE id=$1',
    [RESEARCH_COLLECTION_ID]
  );
  if (!runs.length) return { collection: null, chunks: [], progress: { chunks: 0, bars: 0 } };
  const collection = runs[0];
  const counts = await dbQuery(
    `SELECT symbol, count(*)::int AS chunks, coalesce(sum(candle_count),0)::int AS bars,
            min(chunk_from) AS first_from, max(chunk_to) AS last_to
       FROM research_history_chunks
      WHERE collection_id=$1
      GROUP BY symbol
      ORDER BY symbol`,
    [RESEARCH_COLLECTION_ID]
  );
  return {
    collection,
    progress: {
      chunks: counts.reduce((n, row) => n + Number(row.chunks || 0), 0),
      bars: counts.reduce((n, row) => n + Number(row.bars || 0), 0),
      bySymbol: counts
    }
  };
}

export async function ensureHistoryCollection({ requestedFrom, requestedTo, warmupFrom, calendar, safety }) {
  enabled();
  await dbQuery(
    `INSERT INTO research_history_collections
      (id,source,requested_from,requested_to,warmup_from,status,current_symbol,next_from,calendar_json,safety_json)
     VALUES($1,'tradelocker',$2,$3,$4,'COLLECTING',$5,$4,$6::jsonb,$7::jsonb)
     ON CONFLICT(id) DO NOTHING`,
    [RESEARCH_COLLECTION_ID, requestedFrom, requestedTo, warmupFrom, SYMBOLS[0], JSON.stringify(calendar), JSON.stringify(safety)]
  );
  const rows = await dbQuery('SELECT * FROM research_history_collections WHERE id=$1', [RESEARCH_COLLECTION_ID]);
  const row = rows[0];
  if (!row || Number(row.requested_from) !== requestedFrom || Number(row.requested_to) !== requestedTo || Number(row.warmup_from) !== warmupFrom) {
    throw new Error('RESEARCH_COLLECTION_RANGE_MISMATCH');
  }
  return row;
}

export async function saveHistoryMetadata(symbol, metadata) {
  enabled();
  if (!SYMBOLS.includes(symbol)) throw new Error('INVALID_RESEARCH_SYMBOL');
  await dbQuery(
    `UPDATE research_history_collections
        SET metadata_json = metadata_json || jsonb_build_object($2::text,$3::jsonb),
            updated_at=now()
      WHERE id=$1 AND status='COLLECTING'`,
    [RESEARCH_COLLECTION_ID, symbol, JSON.stringify(metadata)]
  );
}

export async function saveHistoryChunk({ symbol, chunkFrom, chunkTo, candles }) {
  enabled();
  if (!SYMBOLS.includes(symbol) || !Array.isArray(candles) || candles.length > 2000) throw new Error('INVALID_RESEARCH_CHUNK');
  await dbQuery(
    `INSERT INTO research_history_chunks(collection_id,symbol,chunk_from,chunk_to,candle_count,candles_json)
     VALUES($1,$2,$3,$4,$5,$6::jsonb)
     ON CONFLICT(collection_id,symbol,chunk_from)
     DO UPDATE SET chunk_to=excluded.chunk_to,candle_count=excluded.candle_count,candles_json=excluded.candles_json`,
    [RESEARCH_COLLECTION_ID, symbol, chunkFrom, chunkTo, candles.length, JSON.stringify(candles)]
  );
}

export async function advanceHistoryCollection({ currentSymbol, nextFrom, ready = false }) {
  enabled();
  if (currentSymbol != null && !SYMBOLS.includes(currentSymbol)) throw new Error('INVALID_RESEARCH_SYMBOL');
  await dbQuery(
    `UPDATE research_history_collections
        SET current_symbol=$2,
            next_from=$3,
            status=CASE WHEN $4 THEN 'READY' ELSE 'COLLECTING' END,
            error_code=NULL,
            updated_at=now()
      WHERE id=$1`,
    [RESEARCH_COLLECTION_ID, currentSymbol, nextFrom, ready]
  );
}

export async function markHistoryCollectionFailed(errorCode) {
  enabled();
  await dbQuery(
    `UPDATE research_history_collections
        SET status='FAILED',error_code=$2,updated_at=now()
      WHERE id=$1`,
    [RESEARCH_COLLECTION_ID, String(errorCode || 'COLLECTION_FAILED').slice(0,100)]
  );
}

export async function loadHistoryDataset() {
  enabled();
  const rows = await dbQuery('SELECT * FROM research_history_collections WHERE id=$1', [RESEARCH_COLLECTION_ID]);
  const collection = rows[0];
  if (!collection || collection.status !== 'READY') throw new Error('RESEARCH_COLLECTION_NOT_READY');
  const chunks = await dbQuery(
    `SELECT symbol,chunk_from,chunk_to,candles_json
       FROM research_history_chunks
      WHERE collection_id=$1
      ORDER BY symbol,chunk_from`,
    [RESEARCH_COLLECTION_ID]
  );
  const pairs = Object.fromEntries(SYMBOLS.map(symbol => [symbol, {
    metadata: collection.metadata_json?.[symbol],
    candles: [],
    truncated: false
  }]));
  for (const chunk of chunks) {
    const target = pairs[chunk.symbol];
    if (!target) continue;
    for (const candle of chunk.candles_json || []) target.candles.push(candle);
  }
  for (const symbol of SYMBOLS) {
    const byTime = new Map(pairs[symbol].candles.map(c => [c.time, c]));
    pairs[symbol].candles = [...byTime.values()].sort((a,b) => a.time-b.time);
  }
  return {
    source: collection.source,
    requestedFrom: new Date(Number(collection.requested_from)).toISOString(),
    requestedTo: new Date(Number(collection.requested_to)).toISOString(),
    collectedAt: collection.updated_at,
    safety: collection.safety_json,
    calendar: collection.calendar_json,
    pairs
  };
}
