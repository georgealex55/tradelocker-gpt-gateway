-- Research-only resumable TradeLocker history collection.
CREATE TABLE IF NOT EXISTS research_history_collections (
  id text PRIMARY KEY,
  source text NOT NULL CHECK (source = 'tradelocker'),
  requested_from bigint NOT NULL,
  requested_to bigint NOT NULL,
  warmup_from bigint NOT NULL,
  status text NOT NULL DEFAULT 'COLLECTING'
    CHECK (status IN ('COLLECTING','READY','FAILED')),
  current_symbol text,
  next_from bigint,
  metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  calendar_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  safety_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS research_history_chunks (
  collection_id text NOT NULL REFERENCES research_history_collections(id) ON DELETE CASCADE,
  symbol text NOT NULL CHECK (symbol IN ('USDCHF','EURUSD','GBPUSD')),
  chunk_from bigint NOT NULL,
  chunk_to bigint NOT NULL,
  candle_count integer NOT NULL CHECK (candle_count >= 0 AND candle_count <= 2000),
  candles_json jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (collection_id, symbol, chunk_from)
);

CREATE INDEX IF NOT EXISTS research_history_chunks_lookup
  ON research_history_chunks(collection_id, symbol, chunk_from);
