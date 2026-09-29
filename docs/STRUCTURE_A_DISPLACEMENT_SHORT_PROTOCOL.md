# Structure A Displacement + SHORT-only Replication

Recorded after the breakout-quality experiment identified DISPLACEMENT as the
strongest held-forward base-cost variant. Because this combination is selected
post-result, the held-forward period is treated as exploratory and the earlier
pre-validation period is reported as a separate replication check.

## Frozen strategy rules

- Pair: USDCHF only.
- Starting equity: $500.
- Position size: 0.01 lot.
- Risk model: 20% hard ceiling only. If 0.01 lot would exceed the ceiling,
  skip; never size upward to fill unused risk.
- Confirmed 5-H1-bar pivots, two completed bars each side.
- 20-H1 channel breakout.
- Same completed H1 bar must produce same-direction bearish BOS.
- SHORT signals only.
- Entry at next M15 open.
- Stop = 2×14-H1 ATR.
- Exit = opposite prior 10-H1 channel.
- Existing session, macro, spread, cooldown, loss, capacity, and daily-entry
  controls unchanged.

## Frozen displacement quality filter

For SELL:
- boundary = min(20-H1 channel trigger, broken structural low).
- closeLocation = (high - close) / (high - low) >= 0.75.
- bodyFraction = abs(close - open) / (high - low) >= 0.50.
- displacementATR = (boundary - close) / ATR14 >= 0.10.

Zero-range H1 bars fail the filter.

No quality threshold is changed in this run.

## Costs

- Base: 2.0-pip spread + 0.2-pip slippage per side.
- Stress: 2.5-pip spread + 0.4-pip slippage per side.

## Evaluation

Report separately:

1. Earlier pre-validation period: from the frozen research start through
   `2025-05-14T10:30:00Z`.
2. Held-forward period: from `2025-05-14T10:30:00Z` through the frozen end.

For both base and stress costs report trade count, return, PF, expectancy,
total R, max drawdown, losing streak, and sizing diagnostics.

This run is research-only and does not authorize Production changes.

## Data

Frozen TradeLocker archive.
Dataset hash:
`61e9d2fae987acf428cb8034e04514d7f84ad01e9e1a2f03d606de09ea740c14`.

## Safety

No live scanner, broker order, TRADING_ENABLED state, kill switch, Production
code, or Vercel environment variable is modified.
