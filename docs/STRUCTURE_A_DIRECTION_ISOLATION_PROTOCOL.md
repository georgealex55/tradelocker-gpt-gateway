# Structure A Direction Isolation — $500 / 0.01 lot / 20% hard ceiling

Recorded before this experiment's historical results are inspected.

## Purpose

Determine whether the observed Structure A edge is direction-dependent.

All signal and execution rules remain unchanged. The only experimental split is
trade direction:

- BOTH: all qualifying Structure A signals.
- LONG_ONLY: BUY signals only.
- SHORT_ONLY: SELL signals only.

## Capital and risk

- Starting equity: $500.
- Position size: broker minimum 0.01 lot.
- Risk ceiling: 20% of current equity.
- If 0.01 lot would exceed the ceiling, skip the trade.
- Never size upward to consume unused risk budget.
- No target-risk compounding.

## Frozen Structure A rules

- USDCHF only.
- Completed H1 market structure.
- Confirmed 5-H1-bar pivots with two completed bars on each side.
- 20-H1 channel breakout.
- Same completed H1 bar must produce same-direction BOS.
- Entry at the next M15 open.
- Stop = 2×14-H1 ATR.
- Exit = opposite prior 10-H1 channel.
- Existing session, scheduled-news, spread, cooldown, loss, capacity, and
  daily-entry controls are unchanged.

## Costs

- Base: 2.0-pip spread + 0.2-pip slippage per side.
- Stress: 2.5-pip spread + 0.4-pip slippage per side.

## Data

- Frozen TradeLocker archive.
- Dataset hash:
  `61e9d2fae987acf428cb8034e04514d7f84ad01e9e1a2f03d606de09ea740c14`.
- Held-forward start:
  `2025-05-14T10:30:00.000Z`.
- Same three held-forward windows as prior Structure A research.

## Safety

Offline research only. No production strategy, live scanner, broker order,
TRADING_ENABLED state, kill switch, or Vercel environment variable is changed.
