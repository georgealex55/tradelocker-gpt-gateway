# H1 Displacement + Fixed 1.8R V1 — Pre-registered research protocol

Recorded before this strategy's historical results were computed.

## Purpose

Test the rule set used for the latest conditional trade setups as a reproducible system:
completed-H1 price breakout, strong displacement confirmation, next-M15 execution,
a volatility stop, and a fixed 1.8R profit target.

This is an offline research candidate only. It does not change production or live-trading state.

## Frozen dataset

- Existing corrected three-pair M15 research archive.
- Pairs: USDCHF, EURUSD, GBPUSD.
- USDJPY is excluded because it is not present in the frozen archive; no synthetic or substituted history is allowed.
- Dataset SHA-256: `61e9d2fae987acf428cb8034e04514d7f84ad01e9e1a2f03d606de09ea740c14`.
- Held-forward validation begins `2025-05-14T10:30:00.000Z`.

## Frozen strategy

- ID: `h1-displacement-fixed-1p8r-v1`.
- Starting balance: $500.
- Signal timeframe: completed H1 built from M15.
- Breakout channel: prior 20 completed H1 bars.
- Long signal: completed H1 close above prior-20 highest high.
- Short signal: completed H1 close below prior-20 lowest low.
- ATR: 14 completed H1 bars.
- Strong-displacement confirmation, all required:
  - favorable close location >= 0.75 of the H1 candle range;
  - H1 real-body fraction >= 0.50 of the candle range;
  - close clears the breakout boundary by >= 0.10 x ATR14.
- Zero-range candles fail the quality filter.
- Entry: next M15 open after the completed H1 signal.
- Initial stop: 2.0 x H1 ATR from the actual entry price.
- Profit target: 1.8 x actual entry-to-stop distance.
- No channel exit and no trailing stop.
- If stop and target are both touched inside the same M15 candle, stop is assumed first.
- One portfolio position maximum.
- Maximum two portfolio entries per UTC day.
- Entry session: 07:00 <= UTC hour < 16:00.
- Scheduled-news policy: STRICT_BLACKOUT using the frozen calendar.
- Existing daily -2%, weekly -5%, two-loss stop, one-hour post-trade cooldown,
  weekend block, spread <=3 pips, and spread <=20% of stop distance remain in force.

## Sizing

- Fixed lot: 0.01.
- 20% is a hard risk ceiling, not a sizing target.
- Never size above 0.01 to consume available risk.
- If the modeled 0.01-lot loss including modeled costs exceeds 20% of current equity,
  skip the trade.
- No martingale, grid, averaging, or risk escalation.

## Costs

- Base: 2.0-pip spread + 0.2-pip slippage per side.
- Stress: 2.5-pip spread + 0.4-pip slippage per side.
- Commission and financing are not modeled.
- Same OHLC execution proxy as the prior research suite.

## Evaluation

Primary decision uses the same held-forward region and three chronological windows.

Eligibility gates:

- >=30 held-forward base trades.
- Base expectancy >0 and profit factor >1.10.
- Base realized max drawdown <=10%.
- Stress expectancy >0 and >=20 stress trades.
- At least two of three chronological held-forward windows positive.
- Every included pair has >=5 held-forward trades.
- No pair supplies >75% of positive pair gains.
- No single validation window supplies >75% of positive window gains.

Also report full-period descriptive results, pair contribution, direction contribution,
base/stress metrics, and sizing skips.

No threshold, channel length, ATR multiple, direction, pair, hour, target,
or quality threshold may be changed after this run. Any change is a new experiment.

## Safety

The runner is offline-only and reads the frozen artifact. It imports no broker order client,
does not write to the database, does not alter Vercel, and does not modify production
`tradingEnabled` or kill-switch state.
