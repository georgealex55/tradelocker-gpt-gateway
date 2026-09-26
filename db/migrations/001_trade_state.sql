-- Trade state persistence for tradelocker-gpt-gateway.
-- Additive only: no existing objects are dropped or altered.

create table if not exists trade_runs (
  id text primary key,
  idempotency_key text not null unique,
  request_hash text not null,
  strategy_id varchar(31),
  source text not null default 'manual',
  symbol text not null,
  side text not null,
  state text not null,
  dry_run boolean not null default true,
  account_id text,
  broker_order_id text,
  broker_position_id text,
  trade_route_id bigint,
  info_route_id bigint,
  tradable_instrument_id bigint,
  lots numeric(20, 8),
  units numeric(24, 8),
  entry_price numeric(24, 12),
  stop_loss numeric(24, 12),
  take_profit numeric(24, 12),
  risk_reward numeric(20, 8),
  risk_amount numeric(24, 8),
  risk_percent numeric(20, 8),
  request_json jsonb,
  preview_json jsonb,
  broker_response_json jsonb,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  closed_at timestamptz
);

create index if not exists trade_runs_strategy_id_idx
  on trade_runs (strategy_id);

create index if not exists trade_runs_broker_order_id_idx
  on trade_runs (broker_order_id);

create index if not exists trade_runs_broker_position_id_idx
  on trade_runs (broker_position_id);

create index if not exists trade_runs_state_created_at_idx
  on trade_runs (state, created_at desc);

create table if not exists trade_events (
  id bigserial primary key,
  trade_id text not null references trade_runs(id) on delete cascade,
  event_type text not null,
  from_state text,
  to_state text,
  payload_json jsonb,
  created_at timestamptz not null default now()
);

create index if not exists trade_events_trade_id_created_at_idx
  on trade_events (trade_id, created_at asc);

create table if not exists account_snapshots (
  id bigserial primary key,
  trade_id text references trade_runs(id) on delete set null,
  account_id text,
  equity numeric(24, 8),
  balance numeric(24, 8),
  open_positions integer,
  pending_orders integer,
  snapshot_json jsonb,
  created_at timestamptz not null default now()
);

create index if not exists account_snapshots_trade_id_created_at_idx
  on account_snapshots (trade_id, created_at desc);

create table if not exists trading_system_state (
  key text primary key,
  value_json jsonb not null,
  updated_at timestamptz not null default now()
);
