# Price Breakout + Channel Exit V1 — Pre-registered research protocol

Recorded before this strategy's historical results were computed.

## Purpose

Test a materially different, price-led architecture after `forex-trend-pullback-v1`
failed the portfolio matrix and entry-ablation checks. This is a fixed-rule research
candidate, not a production strategy and not an optimization sweep.

## Frozen strategy

- ID: `price-breakout-channel-v1`
- Pairs: USDCHF, EURUSD, GBPUSD.
- Starting balance: $200 per simulation.
- Signal timeframe: completed H1 bars built from the frozen common M15 timeline.
- Entry: next M15 open after a completed H1 signal.
- Long trigger: completed H1 close is above the highest high of the prior 20 completed H1 bars.
- Short trigger: completed H1 close is below the lowest low of the prior 20 completed H1 bars.
- Volatility: 14-bar H1 ATR using completed bars only.
- Initial stop: 2.0 × H1 ATR from the actual next-M15-open entry price.
- Profit target: none.
- Channel exit: at the next M15 open after a completed H1 close crosses the opposite
  10-bar channel (long exits below prior-10 low; short exits above prior-10 high).
- One portfolio position maximum.
- Fixed 1.00% risk per trade, broker minimum sizing, 0.01 lot maximum.
- Maximum two portfolio entries per UTC day.
- Entry session: 07:00 <= UTC hour < 16:00.
- Strict scheduled-news blackout using the already reviewed frozen macro calendar.
- Existing daily/weekly loss guards, two-loss stop, one-hour post-trade cooldown,
  weekend block, spread <=3 pips, and spread <=20% of stop distance remain in force.

## Costs

- Base: 2.0-pip spread + 0.2-pip slippage per side.
- Stress: 2.5-pip spread + 0.4-pip slippage per side.
- Same existing OHLC price/cost proxy and broker metadata as portfolio-144.

## Evaluation

Primary comparison uses the same held-forward start recorded by the corrected
portfolio-144 archive. Eligibility gates remain unchanged for a three-pair portfolio:

- >=30 held-forward trades.
- positive expectancy and profit factor >1.10.
- realized max drawdown <=10%.
- stress expectancy positive and >=20 stress trades.
- at least two of three chronological held-forward windows positive.
- no pair supplies >75% of positive pair gains.
- each pair has >=5 held-forward trades.
- no held-forward window supplies >75% of positive window gains.

Also report, without using them for parameter tuning:

- full-period descriptive result;
- pre-January-20-2025 and January-20-2025-forward regime splits;
- pair/direction contributions;
- base and stress results.

No threshold, pair, direction, hour, ATR multiple, or channel length is to be changed
after seeing this run. Any follow-up alteration is a new separately declared experiment.

## Safety

This experiment imports no broker order client and sends no orders. It reads only the
frozen historical artifact. Production modules, environment variables, cron schedules,
`tradingEnabled`, and kill-switch state are not modified.
