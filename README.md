# TradeLocker ↔ ChatGPT Gateway

A private Next.js gateway for TradeLocker REST execution with deterministic risk controls and durable trade lifecycle tracking.

## Current architecture

```text
Market / strategy input
        ↓
Risk engine
        ↓
Trade state machine
        ↓
Execution guard
        ↓
TradeLocker REST API
        ↓
Broker verification / reconciliation
        ↓
Neon/Postgres event history
```

The strategy layer is intentionally not implemented yet. The gateway currently accepts a structured order request and decides whether that request is safe to execute.

## Existing execution protection

The gateway currently includes:

- explicit TradeLocker account lock
- fail-closed kill switch
- `TRADING_ENABLED` dry-run switch
- approval-key protection
- symbol allow-list
- lot and unit caps
- broker min/max lot and lot-step validation
- required stop-loss and take-profit checks
- minimum risk/reward
- account-risk percentage cap
- spread guard
- stale-market-data guard
- maximum open positions
- maximum pending orders
- maximum daily trades
- idempotency key requirement
- TradeLocker strategy ID deduplication
- post-trade broker verification

## Durable trade state

The `trade-state-v1` layer adds a Postgres-backed lifecycle for every order.

Primary states include:

```text
SIGNAL_CREATED
  ↓
SIGNAL_VALIDATED
  ↓
RISK_APPROVED ───────────────→ DRY_RUN_COMPLETE
  ↓
ORDER_SUBMITTED
  ↓
ORDER_ACCEPTED
  ↓
ORDER_FILLED
  ↓
POSITION_OPEN
  ↓
POSITION_MANAGED
  ↓
CLOSE_REQUESTED
  ↓
POSITION_CLOSED
  ↓
RECONCILED
```

Failure/reconciliation states include:

```text
SIGNAL_REJECTED
RISK_REJECTED
ORDER_REJECTED
ORDER_TIMEOUT
PARTIAL_FILL
EXECUTION_UNKNOWN
POSITION_MISMATCH
EMERGENCY_CLOSE
```

The state machine rejects invalid transitions. An idempotency key is also persisted with a request fingerprint so the same key cannot be reused with different trade parameters.

## Database objects

Apply:

```text
db/migrations/001_trade_state.sql
```

It creates:

- `trade_runs` — canonical trade lifecycle record
- `trade_events` — append-only lifecycle/event history
- `account_snapshots` — account/risk snapshot captured during preview
- `trading_system_state` — reserved system/circuit-breaker state

The migration is additive and does not drop or alter existing tables.

## Environment variables

Copy the keys from `.env.example`.

TradeLocker:

```text
TRADELOCKER_ENV=demo
TRADELOCKER_EMAIL=
TRADELOCKER_PASSWORD=
TRADELOCKER_SERVER=
TRADELOCKER_ACCOUNT_ID=
TRADELOCKER_ACC_NUM=
EXPECTED_ACCOUNT_ID=
```

Database:

```text
DATABASE_URL=
TRADE_STATE_DB_ENABLED=true
```

Execution starts disabled:

```text
TRADING_ENABLED=false
```

Keep the TradeLocker credentials, approval key, and database URL server-side.

## Database activation sequence

1. Create/select the Neon Postgres project.
2. Apply `db/migrations/001_trade_state.sql`.
3. Add the Neon connection string as `DATABASE_URL` in Vercel.
4. Keep `TRADE_STATE_DB_ENABLED=true`.
5. Call `GET /api/trading/db-health` with the approval header.
6. Keep `TRADING_ENABLED=false` while testing lifecycle persistence.
7. Submit a dry-run order with a unique `idempotencyKey`.
8. Query `GET /api/trading/trades?idempotencyKey=...` and confirm the final state is `DRY_RUN_COMPLETE`.

If `DATABASE_URL` is absent, the current TradeLocker behavior remains available and database tracking is skipped. Once the database is configured, state persistence becomes part of the pre-execution safety path.

## Important endpoints

Read-only TradeLocker endpoints:

- `GET /api/tradelocker/account`
- `GET /api/tradelocker/account-readable`
- `GET /api/tradelocker/config`
- `GET /api/tradelocker/instruments`
- `GET /api/tradelocker/instrument-details`
- `GET /api/tradelocker/quote`
- `GET /api/tradelocker/positions`
- `GET /api/tradelocker/orders`
- `GET /api/tradelocker/verify-trade`

Risk / execution:

- `POST /api/tradelocker/risk-preview`
- `POST /api/tradelocker/order`
- `POST /api/tradelocker/close-position`

Durable state:

- `GET /api/trading/db-health`
- `GET /api/trading/trades`

The durable-state endpoints require:

```text
x-trade-approval-key: YOUR_SECRET
```

## Dry-run order

POST:

```text
/api/tradelocker/order
```

Example body:

```json
{
  "idempotencyKey": "usdchf-manual-test-001",
  "source": "manual",
  "symbol": "USDCHF",
  "side": "buy",
  "lots": 0.01,
  "tradableInstrumentId": 7876,
  "tradeRouteId": 540005,
  "infoRouteId": 540002,
  "stopLoss": 0.8100,
  "takeProfit": 0.8140
}
```

While `TRADING_ENABLED=false`, the request can run the risk checks and persist its state without submitting a live order.

## Execution semantics

Before live submission, the state record must successfully reach `ORDER_SUBMITTED` when durable state is enabled. This prevents an order from being sent when the system cannot persist its pre-submit state.

After TradeLocker returns a successful response, a database write failure is reported as `trackingWarning` rather than turning the broker success into an apparent failed request. This avoids encouraging an unsafe duplicate retry.

If the broker request itself errors after submission begins, the tracked state moves to `EXECUTION_UNKNOWN`. The next action should be broker verification/reconciliation, not blind resubmission.

## Instrument defaults

The current USDCHF defaults discovered for this account are:

```text
tradableInstrumentId = 7876
tradeRouteId         = 540005
infoRouteId          = 540002
```

These remain defaults only. Strategy selection and dynamic instrument discovery will be handled in the next phase.
