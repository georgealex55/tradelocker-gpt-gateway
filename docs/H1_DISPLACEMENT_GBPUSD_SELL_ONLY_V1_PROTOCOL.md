# H1 Displacement + Fixed 1.8R — GBPUSD SELL-Only V1

Recorded before this experiment's historical results were computed.

## Single experimental change

Relative to the preregistered three-pair SELL-only experiment, execution is restricted to:

- Symbol: GBPUSD
- Side: SELL only

No other strategy parameter changes are permitted.

## Frozen rules

- Corrected frozen M15 archive; GBPUSD history only is used for execution.
- Dataset hash: `61e9d2fae987acf428cb8034e04514d7f84ad01e9e1a2f03d606de09ea740c14`.
- Held-forward boundary: `2025-05-14T10:30:00.000Z`.
- Starting balance: $500.
- Completed-H1 signal; entry at next M15 open.
- Prior-20 H1 downside channel breakout.
- Favorable close location >= 0.75.
- Real-body fraction >= 0.50.
- Breakout displacement >= 0.10 ATR14.
- Stop: 2.0 x H1 ATR from actual entry.
- Target: fixed 1.8R.
- Conservative same-M15 ordering: stop wins if stop and target both touch.
- Fixed 0.01 lot.
- 20% hard risk ceiling only; never size upward.
- One position maximum.
- Maximum two entries per UTC day.
- Entry session 07:00 <= UTC hour < 16:00.
- STRICT_BLACKOUT frozen news calendar.
- Daily -2%, weekly -5%, two-loss stop, one-hour cooldown, weekend block,
  spread <=3 pips, and spread <=20% of stop remain unchanged.
- Base costs: 2.0-pip spread + 0.2-pip slippage per side.
- Stress costs: 2.5-pip spread + 0.4-pip slippage per side.

## Evaluation gates

Because this is intentionally a single-pair experiment, cross-pair distribution and
pair-concentration gates do not apply. All other held-forward gates remain:

- >=30 base trades.
- Base expectancy >0 and profit factor >1.10.
- Base realized max drawdown <=10%.
- Stress expectancy >0 and >=20 stress trades.
- At least two of three chronological held-forward windows positive.
- No single positive validation window supplies >75% of total positive window gains.

No threshold, hour, stop, target, cost assumption, or sizing rule may be changed after
seeing this run. Any follow-up adjustment is a new experiment.

## Safety

Offline research only. No production deployment, broker order call, database write,
live-trading change, or kill-switch change.
