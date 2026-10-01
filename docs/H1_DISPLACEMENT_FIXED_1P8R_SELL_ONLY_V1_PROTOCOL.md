# H1 Displacement + Fixed 1.8R SELL-Only V1 — Pre-registered protocol

Recorded before this experiment's results were computed.

## Single experimental change

Relative to `h1-displacement-fixed-1p8r-v1`, the only strategy change is:

- Execute **SELL signals only**.
- BUY signals are ignored before portfolio capacity, cooldown, loss guards, and sizing are evaluated.

This requires a standalone replay because removing BUY trades can change subsequent portfolio capacity, cooldowns, loss-guard state, and equity.

## Rules held constant

- Frozen corrected M15 archive: USDCHF, EURUSD, GBPUSD.
- Dataset hash: `61e9d2fae987acf428cb8034e04514d7f84ad01e9e1a2f03d606de09ea740c14`.
- Held-forward boundary: `2025-05-14T10:30:00.000Z`.
- Starting balance: $500.
- Completed H1 signals; next-M15-open execution.
- Prior-20 H1 channel breakout.
- Close location >= 0.75.
- Real-body fraction >= 0.50.
- Breakout displacement >= 0.10 ATR14.
- Stop = 2.0 x H1 ATR from actual entry.
- Target = fixed 1.8R.
- Conservative same-M15 ordering: if stop and target both touch, stop wins.
- Fixed 0.01 lot.
- 20% hard risk ceiling only; never size upward.
- One portfolio position maximum.
- Maximum two portfolio entries per UTC day.
- Entry session 07:00 <= UTC hour < 16:00.
- STRICT_BLACKOUT frozen news calendar.
- Existing daily -2%, weekly -5%, two-loss stop, one-hour cooldown, weekend block,
  spread <=3 pips, and spread <=20% of stop remain unchanged.
- Base costs: 2.0-pip spread + 0.2-pip slippage per side.
- Stress costs: 2.5-pip spread + 0.4-pip slippage per side.

## Evaluation gates

Unchanged from the parent experiment:

- >=30 held-forward base trades.
- Base expectancy >0 and PF >1.10.
- Base realized max drawdown <=10%.
- Stress expectancy >0 and >=20 stress trades.
- At least two of three held-forward chronological windows positive.
- Every included pair has >=5 held-forward trades.
- No pair supplies >75% of positive pair gains.
- No single held-forward window supplies >75% of positive window gains.

No pair, hour, target, stop, displacement, candle-quality, cost, or sizing threshold
may be changed after seeing this run. Any further change is a new experiment.

## Safety

Offline historical research only. No broker order client, no production deployment,
no database write, and no change to live-trading or kill-switch state.
