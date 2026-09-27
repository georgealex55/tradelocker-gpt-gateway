-- Additive research-only migration. Test on a Neon branch before applying.
CREATE TABLE IF NOT EXISTS portfolio_backtest_runs (
  id text PRIMARY KEY,
  input_hash text NOT NULL,
  engine_version text NOT NULL,
  manifest_json jsonb NOT NULL,
  status text NOT NULL DEFAULT 'RUNNING' CHECK (status IN ('RUNNING','COMPLETED','COMPLETED_WITH_FAILURES','BLOCKED')),
  current_combo text,
  worker_id text,
  lease_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS portfolio_backtest_results (
  run_id text NOT NULL REFERENCES portfolio_backtest_runs(id),
  combo_id text NOT NULL CHECK (combo_id ~ '^C[0-9]{3}$'),
  status text NOT NULL CHECK (status IN ('COMPLETED','FAILED')),
  result_json jsonb,
  error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (run_id, combo_id)
);
CREATE INDEX IF NOT EXISTS portfolio_backtest_runs_created ON portfolio_backtest_runs(created_at DESC);
