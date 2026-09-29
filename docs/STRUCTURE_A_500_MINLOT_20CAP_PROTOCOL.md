# Structure A — $500 Minimum-Lot / 20% Ceiling Replay

Recorded before this dedicated replay's result is inspected.

## Purpose

Run the frozen STRUCTURE_A strategy using the intended ceiling interpretation:

- Starting equity: $500.
- Risk limit: 20% of current equity, used only as a hard maximum.
- Position size: always the broker minimum 0.01 lot when that minimum-lot
  stop risk fits under the 20% ceiling.
- If 0.01 lot would exceed the 20% ceiling, skip the trade.
- Never size upward to consume unused risk budget.
- No target-risk compounding.

## Signal architecture

Unchanged from frozen STRUCTURE_A:

- USDCHF only.
- Completed H1 market structure.
- Confirmed 5-H1-bar pivots with two completed bars on each side.
- 20-H1 channel breakout.
- Same completed H1 bar must also produce same-direction BOS.
- Entry at next M15 open.
- Stop = 2×14-H1 ATR.
- Exit = opposite prior 10-H1 channel.
- Existing session, macro, spread, cooldown, daily/weekly loss, and capacity
  controls remain unchanged.

## Costs

- Base: 2.0-pip spread + 0.2-pip slippage per side.
- Stress: 2.5-pip spread + 0.4-pip slippage per side.

## Data

- Frozen TradeLocker archive.
- Dataset hash:
  `61e9d2fae987acf428cb8034e04514d7f84ad01e9e1a2f03d606de09ea740c14`.
- Held-forward start:
  `2025-05-14T10:30:00.000Z`.

## Safety

Offline research only. No production settings, live scanner, kill switch,
TRADING_ENABLED state, broker orders, or Vercel environment variables are changed.
