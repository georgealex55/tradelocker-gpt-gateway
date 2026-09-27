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

Strategy V1 is implemented as a read-only signal and backtest layer. It is currently restricted to USDCHF. The existing risk engine, state machine, kill switch, and TradeLocker execution path remain authoritative, and live autonomous execution is still disabled.

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

These remain defaults only. Strategy V1 now uses dynamic TradeLocker instrument discovery and is currently restricted to USDCHF.

## Indicator engine

The gateway now uses the pinned `trading-signals@8.3.0` package behind our own adapter in:

```text
lib/indicators.js
```

The library never talks directly to TradeLocker and does not control execution.

Default indicator set:

```text
EMA 20
EMA 50
EMA 200
RSI 14
ATR 14
ADX 14 (+DI / -DI)
MACD 12 / 26 / 9
```

The periods are configurable. The adapter normalizes candles first, then exposes one serializable snapshot format for both live strategy evaluation and historical backtests.

Protected calculation endpoint:

```text
POST /api/trading/indicators
x-trade-approval-key: YOUR_SECRET
```

Body:

```json
{
  "candles": [
    {
      "time": 1,
      "open": 0.8100,
      "high": 0.8110,
      "low": 0.8095,
      "close": 0.8107
    }
  ],
  "indicatorConfig": {
    "emaPeriods": [20, 50, 200],
    "rsiPeriod": 14,
    "atrPeriod": 14,
    "adxPeriod": 14,
    "macd": {
      "fast": 12,
      "slow": 26,
      "signal": 9
    }
  }
}
```

## Thin backtesting engine

The strategy-neutral replay engine lives in:

```text
lib/backtest.js
```

It deliberately does not contain Strategy V1 rules. A strategy function receives the normalized candle, the same indicator snapshot used by live logic, current simulated position state, equity, and previous trades.

Backtest protections:

- signals execute at the **next candle open** to reduce look-ahead bias
- every entry requires a stop loss and take profit
- one simulated position is open at a time
- risk is modeled as a percentage of current simulated equity
- spread and slippage can be deducted in pips
- if stop and target are both touched in one candle, the default is **stop-first**
- final open positions close at the end of the dataset
- metrics include win rate, R multiples, expectancy, profit factor, return, and max drawdown

Protected strategy-neutral replay endpoint:

```text
POST /api/trading/backtest
x-trade-approval-key: YOUR_SECRET
```

For infrastructure tests, the endpoint accepts explicit signals instead of embedding a strategy:

```json
{
  "candles": [
    {
      "time": 1,
      "open": 0.8100,
      "high": 0.8110,
      "low": 0.8095,
      "close": 0.8107
    },
    {
      "time": 2,
      "open": 0.8108,
      "high": 0.8130,
      "low": 0.8105,
      "close": 0.8125
    }
  ],
  "signals": [
    {
      "index": 0,
      "action": "BUY",
      "stopLoss": 0.8098,
      "takeProfit": 0.8128
    }
  ],
  "options": {
    "startingBalance": 10000,
    "riskPercent": 1,
    "pipSize": 0.0001,
    "spreadPips": 1.5,
    "slippagePips": 0.2
  }
}
```

Those explicit signals are only for validating the replay engine. Strategy V1 now uses a strategy function that evaluates the same indicator snapshots.

### Intended Strategy V1 flow

```text
TradeLocker historical/live candles
        ↓
lib/indicators.js
        ↓
Strategy V1
        ↓
      ┌───────────────┐
      ↓               ↓
lib/backtest.js   existing risk engine
 historical           ↓
 simulation       state machine
                      ↓
                  TradeLocker
```

This keeps indicator calculations and strategy rules shared between testing and live execution while leaving TradeLocker as the only live execution platform.

## Forex historical data and broker-constrained backtests

The branch now connects the backtester directly to TradeLocker historical bars.

Protected endpoints:

```text
GET  /api/trading/forex-universe
POST /api/trading/history
POST /api/trading/backtest
```

`/api/trading/forex-universe` filters the connected TradeLocker account to
`FOREX` instruments and returns each symbol's tradable instrument ID plus its
INFO and TRADE route IDs.

`/api/trading/history` calls TradeLocker's `/trade/history` endpoint and
normalizes OHLCV bars. Supported resolutions are:

```text
1m 5m 15m 30m 1H 4H 1D 1W 1M
```

The adapter chunks large requests below TradeLocker's 20,000-bar per-request
limit and de-duplicates timestamps.

The backtest endpoint can now receive a `marketData` object instead of a
pre-built candle array:

```json
{
  "marketData": {
    "symbol": "USDCHF",
    "tradableInstrumentId": 7876,
    "infoRouteId": 540002,
    "tradeRouteId": 540005,
    "resolution": "15m",
    "from": "2026-01-01T00:00:00Z",
    "to": "2026-09-01T00:00:00Z",
    "accountCurrency": "USD",
    "maxLots": 0.01
  },
  "higherTimeframe": {
    "resolution": "1H"
  },
  "options": {
    "startingBalance": 150,
    "riskPercent": 1,
    "spreadPips": 1.8,
    "slippagePips": 0.2
  }
}
```

When `tradeRouteId` is provided, the backtester also loads the broker's
`lotSize`, `minLot`, `lotStep`, currencies, and pip size. If the broker's
minimum tradable lot would exceed the configured dollar risk, the simulator
records the setup under `skippedSignals` instead of pretending a smaller
position could be traded.

Higher-timeframe filters are generated from completed lower-timeframe candles.
For example, a 15-minute backtest with a 1-hour regime filter does not expose
the current unfinished 1-hour candle to the strategy.

## Forex Strategy V1 decision

The selected first architecture is documented in:

```text
docs/FOREX_STRATEGY_V1.md
```

Configuration lives in:

```text
lib/forexStrategyV1Config.js
```

The initial design is a completed-1H trend filter with 15-minute
pullback/continuation entries, one position at a time, fixed-risk stops and a
1.8R target. It is designed for roughly $150 starting capital and enforces the
broker's 0.01-lot floor.

Event-risk helpers live in:

```text
lib/eventRisk.js
```

They support scheduled no-trade windows and abnormal spread/ATR/candle-range
shutdown rules. Strategy direction is never based on predicting a political
event.



## Current USDCHF-only research scope

Strategy V1 is currently restricted to:

```text
USDCHF
```

The live/default research configuration remains:

```text
Starting capital: $150
Default risk ceiling: 1%
Maximum size: 0.01 lot
Entry timeframe: M15
Regime timeframe: H1
Target: 1.8R
```

The robustness research page at `/backtests` evaluates the unchanged Strategy
V1 rules from 2024-01-01 through 2026-09-25 with warm-up data beginning
2023-12-15. It compares 1%, 1.5%, and 2% risk ceilings strictly as research
scenarios. The live/default risk setting remains 1%.

The research report includes long/short performance, month, UTC entry hour,
stop-distance statistics, broker minimum-lot skips, and risk-guard skips.


## Neon durable persistence status

The dedicated Neon database `tradelocker_gateway` is provisioned and the
trade-state migration has been applied. Preview deployments should provide
`DATABASE_URL` and keep `TRADE_STATE_DB_ENABLED=true`. Database activation
does not enable live trading; `TRADING_ENABLED=false` and the kill switch
remain authoritative.
