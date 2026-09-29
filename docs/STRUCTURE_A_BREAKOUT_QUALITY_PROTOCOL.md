# Structure A Breakout Quality Experiment — Pre-registered

Recorded before this experiment's historical outcomes are computed.

## Purpose

Test whether completed-H1 breakout quality can improve frozen STRUCTURE_A
without changing its core market-structure logic or risk model.

## Frozen baseline

- Pair: USDCHF only.
- Starting equity: $500.
- Position size: 0.01 lot.
- Risk model: 20% hard ceiling only. If 0.01 lot would exceed the ceiling,
  skip; never size upward to fill unused risk.
- Confirmed 5-H1-bar pivots, two bars each side.
- 20-H1 channel breakout.
- Same completed H1 bar must also print a same-direction BOS.
- Entry at next M15 open.
- Stop = 2×14-H1 ATR.
- Exit = opposite prior 10-H1 channel.
- Existing session, macro, spread, cooldown, loss, capacity, and daily-entry
  guards remain unchanged.
- Base costs: 2.0-pip spread + 0.2-pip slippage per side.
- Stress costs: 2.5-pip spread + 0.4-pip slippage per side.

## Breakout-quality measurements

All measurements use only the completed H1 breakout candle and levels already
known at that close.

For BUY:
- boundary = max(20-H1 channel trigger, broken structural high).
- closeLocation = (close - low) / (high - low).
- displacementATR = (close - boundary) / ATR14.

For SELL:
- boundary = min(20-H1 channel trigger, broken structural low).
- closeLocation = (high - close) / (high - low).
- displacementATR = (boundary - close) / ATR14.

For both:
- bodyFraction = abs(close - open) / (high - low).

Zero-range H1 candles fail all quality filters.

## Frozen variants

### BASELINE
Unmodified STRUCTURE_A.

### CLOSE_LOCATION
Require closeLocation >= 0.75.
This requires the breakout candle to finish in the favorable outer quarter
of its H1 range.

### BODY_LOCATION
Require:
- closeLocation >= 0.75, and
- bodyFraction >= 0.50.

### DISPLACEMENT
Require:
- closeLocation >= 0.75,
- bodyFraction >= 0.50, and
- displacementATR >= 0.10.

No threshold is changed after results are observed.

## Evaluation

Report held-forward base and stress:
- trades, wins/losses, win rate;
- ending balance and return;
- profit factor;
- total R and expectancy R;
- max drawdown;
- long/short contribution;
- positive held-forward windows;
- number of raw Structure A candidates surviving each quality filter.

This is a research comparison, not authorization to modify Production or live
execution. A promising variant still requires separate validation.

## Data

Frozen TradeLocker archive only.
Dataset hash:
`61e9d2fae987acf428cb8034e04514d7f84ad01e9e1a2f03d606de09ea740c14`.
Held-forward start:
`2025-05-14T10:30:00.000Z`.

## Safety

Offline research only. No broker orders, Production code, live scanner,
TRADING_ENABLED state, kill switch, or Vercel environment variables are changed.
