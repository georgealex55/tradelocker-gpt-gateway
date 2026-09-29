# Structure A Displacement + SHORT Cost Sensitivity

The signal architecture is frozen. This experiment changes only modeled execution costs.

## Frozen strategy
- USDCHF SHORT-only
- Structure A 20-H1 breakout + same-bar bearish BOS
- Breakout close in bottom 25% of H1 range
- H1 body >= 50% of range
- Close displacement >= 0.10 ATR below the stronger broken boundary
- Entry next M15 open
- Stop = 2×14-H1 ATR
- Exit = opposite prior 10-H1 channel
- $500 starting equity
- 0.01 lot
- 20% hard risk ceiling only
- Existing session, macro, spread-ratio, cooldown, loss, capacity, and daily-entry controls unchanged

## Cost profiles
- LIVE_LIKE: 1.8-pip spread, 0.2-pip slippage per side
- BASE: 2.0 spread, 0.2 slippage per side
- MODERATE_22: 2.2 spread, 0.2 slippage per side
- MODERATE_24: 2.4 spread, 0.3 slippage per side
- STRESS: 2.5 spread, 0.4 slippage per side
- HEAVY: 2.8 spread, 0.4 slippage per side
- MAX_ALLOWED_SPREAD: 3.0 spread, 0.5 slippage per side

For each profile, report held-forward and earlier pre-validation results.
No cost threshold is selected or changed after outcomes are viewed.

## Safety
Offline research only. No Production or live settings are modified.
