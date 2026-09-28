-- Virtual shadow-trade ledger for V2 forward validation.
-- Additive only. Never used for broker order execution.

create table if not exists shadow_virtual_trades (
  id bigserial primary key,
  strategy text not null,
  strategy_version text not null,
  symbol text not null,
  signal_time bigint not null,
  side text not null,
  state text not null default 'PENDING_ENTRY',
  signal_reference_entry numeric(24, 12),
  entry_time bigint,
  entry_price numeric(24, 12),
  stop_loss numeric(24, 12) not null,
  take_profit numeric(24, 12),
  target_r numeric(20, 8) not null,
  lots numeric(20, 8),
  units numeric(24, 8),
  pip_size numeric(24, 12),
  risk_amount_usd numeric(24, 8),
  risk_percent numeric(20, 8),
  outcome text,
  exit_time bigint,
  exit_price numeric(24, 12),
  r_multiple numeric(20, 8),
  pnl_usd numeric(24, 8),
  mfe_pips numeric(20, 8) not null default 0,
  mae_pips numeric(20, 8) not null default 0,
  last_candle_time bigint,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  closed_at timestamptz,
  unique (strategy, strategy_version, symbol, signal_time)
);

create index if not exists shadow_virtual_trades_state_time_idx
  on shadow_virtual_trades (state, signal_time desc);

create index if not exists shadow_virtual_trades_symbol_time_idx
  on shadow_virtual_trades (symbol, signal_time desc);
