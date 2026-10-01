# Strategy Solutions Suite V1 — Pre-registered protocol

Recorded before this suite's historical results are computed.

## Purpose

Investigate five specific explanations/solutions revealed by the H1 displacement tests without tuning rules after results are seen.

Frozen dataset:
- Corrected M15 archive for USDCHF, EURUSD, GBPUSD.
- Dataset hash: `61e9d2fae987acf428cb8034e04514d7f84ad01e9e1a2f03d606de09ea740c14`.
- Held-forward validation boundary: `2025-05-14T10:30:00.000Z`.
- Starting balance: $500.
- Fixed size: 0.01 lot, only when modeled loss stays <=20% of current equity.
- Entry session: 07:00 <= UTC hour < 16:00.
- One position maximum; max two entries per UTC day.
- Frozen news blackout, -2% daily guard, -5% weekly guard, two-loss stop, one-hour cooldown, weekend block.
- Spread <=3 pips and <=20% of stop distance.
- Base costs: 2.0-pip spread + 0.2-pip slippage per side.
- Stress costs: 2.5-pip spread + 0.4-pip slippage per side.

Frozen entry architecture:
- SELL signals only.
- Completed H1 closes below the prior 20-H1 lowest low.
- ATR14 from completed H1 bars.
- Close location >=0.75 in the favorable lower portion of the H1 candle.
- Real-body fraction >=0.50.
- Breakout displacement >=0.10 ATR.
- Enter next M15 open.
- Stop = 2.0 x H1 ATR from actual entry.

## Experiment 1 — Attribution / rejection analysis

Replay:
A. Three-pair SELL-only fixed-1.8R portfolio.
B. GBPUSD-only SELL fixed-1.8R.

For every qualifying GBPUSD signal, record whether it was executed or rejected and the first rejection reason:
outside session, news, capacity, daily limit, loss guard, cooldown, spread, sizing, or executed.

Compare:
- GBPUSD trades executed in the three-pair portfolio.
- GBPUSD trades newly admitted when GBPUSD runs alone.
- Signals rejected in both.
- Entry features: close location, body fraction, displacement ATR, ATR/stop size, UTC hour, and USD breadth state.
- Realized trade metrics for executed groups.

No attribution result is allowed to automatically create a new rule inside this suite.

## Experiment 2 — Exit architecture

Keep the frozen three-pair SELL-only displacement entry unchanged.

Compare:
- Parent fixed 1.8R target.
- No fixed TP; instead exit at the next M15 open after a completed H1 close above the prior 10 completed-H1 high.
- Initial 2xATR stop remains.

No trailing stop or other exit is added.

## Experiment 3 — Pre-validation quality selection

Use pre-validation data only to select among exactly these five entry-quality variants:

1. BASE: close >=0.75, body >=0.50, displacement >=0.10 ATR.
2. D15: close >=0.75, body >=0.50, displacement >=0.15 ATR.
3. D20: close >=0.75, body >=0.50, displacement >=0.20 ATR.
4. STRONG_CANDLE: close >=0.80, body >=0.60, displacement >=0.10 ATR.
5. STRONG_ALL: close >=0.80, body >=0.60, displacement >=0.15 ATR.

All use the three-pair SELL-only fixed-1.8R architecture.

Selection rule:
- Candidate must have >=30 pre-validation trades.
- Select highest pre-validation expectancy R.
- Tie-break by profit factor, then lower max drawdown.
- If no candidate has >=30 trades, retain BASE.

Then evaluate only the selected candidate on the held-forward region under base and stress costs.

Important limitation: the held-forward region has already been inspected in prior related experiments, so this is not pristine out-of-sample evidence. The selection itself, however, uses pre-validation data only.

## Experiment 4 — Cross-pair USD confirmation

Use frozen BASE quality and fixed-1.8R exit.

At the completed H1 signal time, calculate 4-H1 USD breadth:
- USDCHF votes USD-strong if its completed H1 close > its close 4 completed H1 bars earlier.
- EURUSD votes USD-strong if its completed H1 close < its close 4 completed H1 bars earlier.
- GBPUSD votes USD-strong if its completed H1 close < its close 4 completed H1 bars earlier.

A SELL entry qualifies only when:
- at least 2 of 3 pairs vote USD-strong, and
- at least one confirming vote comes from a pair other than the target symbol.

No threshold sweep is allowed.

## Experiment 5 — Transaction-cost robustness

Replay these four held-forward strategies across the same fixed cost grid:
- BASE fixed-1.8R three-pair SELL-only.
- CHANNEL_EXIT three-pair SELL-only.
- PREVALIDATION_SELECTED quality strategy.
- USD_BREADTH_CONFIRM strategy.

Cost grid:
- OPTIMISTIC: spread 1.0 pip, slippage 0.1 pip/side.
- BASE: spread 2.0, slippage 0.2/side.
- MID: spread 2.25, slippage 0.3/side.
- STRESS: spread 2.5, slippage 0.4/side.
- HEAVY: spread 3.0, slippage 0.5/side.

The normal spread guards remain active, so higher-cost scenarios can change the admitted trade set.

A strategy is called cost-robust in this suite only if held-forward expectancy is positive under both BASE and STRESS costs with >=20 STRESS trades.

## Common evaluation

For the three-pair strategy experiments:
- >=30 held-forward base trades.
- Base expectancy >0 and PF >1.10.
- Base max realized drawdown <=10%.
- Stress expectancy >0 and >=20 stress trades.
- At least 2 of 3 held-forward windows positive.
- Every active pair has >=5 held-forward trades.
- No pair supplies >75% of positive pair gains.
- No single held-forward window supplies >75% of positive positive-window gains.

## Safety

Offline historical research only. No broker order client, production deployment, database write, live-trading change, or kill-switch change.
