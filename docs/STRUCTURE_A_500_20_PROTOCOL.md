# Structure A — $500 / 20% Risk Replay Protocol

Recorded before this experiment's historical outcomes are computed.

## Purpose

Replay the already-frozen STRUCTURE_A signal architecture at a $500 starting
balance with a 20% target risk per new trade.

STRUCTURE_A itself is unchanged:
- USDCHF only.
- Completed H1 structure.
- Confirmed 5-H1-bar pivots with two bars on each side.
- HH/HL or LH/LL established structure.
- Existing 20-H1 channel breakout.
- Same completed H1 bar must also print a same-direction BOS.
- Entry at the next M15 open.
- Initial stop = 2.0 × 14-H1 ATR from the actual entry open.
- Exit = next M15 open after the completed H1 opposite 10-H1 channel exit.
- Strict news/session/spread/cooldown/loss guards remain unchanged.

No signal, stop, exit, BOS, pivot, session, spread, or macro parameter is tuned.

## Frozen data

- TradeLocker frozen archive only.
- Dataset hash:
  `61e9d2fae987acf428cb8034e04514d7f84ad01e9e1a2f03d606de09ea740c14`.
- Held-forward start:
  `2025-05-14T10:30:00.000Z`.
- Pair: USDCHF.
- Same three held-forward windows used by Market Structure V1.

## Capital and risk

### Primary replay — TRUE_20_PERCENT

- Starting equity: $500.
- Risk target: 20% of current equity per new trade.
- Risk compounds with current equity after each realized trade.
- Position size is rounded DOWN to the broker lot step.
- Broker minimum lot and broker maximum lot from frozen USDCHF metadata apply.
- The prior research-only 0.01-lot cap is removed for this primary replay.
- Transaction costs are included in the sizing risk budget exactly as in the
  prior engine.
- Position sizing may risk less than 20% after lot-step rounding.
- Adverse gaps through the stop may realize more than the planned risk budget;
  those are preserved and reported, never clipped.

### Diagnostic replay — CAPPED_0_01

Run the exact same signals and controls, but cap size at 0.01 lot.

This diagnostic shows how the $500 account behaves under the current live-test
lot ceiling. It is not described as a 20% realized-risk test because the cap
will normally keep actual risk far below 20%.

## Shared execution controls

- Entry session: 07:00 <= UTC hour < 16:00.
- Weekend entries blocked.
- Strict scheduled-news blackout.
- One USDCHF position maximum.
- Maximum two entries per UTC day.
- Daily realized-loss guard: -2% of that UTC day's starting equity.
- Weekly realized-loss guard: -5% of that week's starting equity.
- Stop after two consecutive realized losses.
- One-hour post-trade cooldown.
- Spread <= 3 pips.
- Spread <= 20% of stop distance.
- Base costs: 2.0-pip spread + 0.2-pip slippage per side.
- Stress costs: 2.5-pip spread + 0.4-pip slippage per side.
- No martingale, grid, averaging down, or stop widening.

The existing daily/weekly guards are deliberately left unchanged even though
they are much smaller than a 20% single-trade risk target. This preserves the
Structure A execution policy rather than weakening safety gates to improve the
result.

## Reports

For TRUE_20_PERCENT and CAPPED_0_01, report:

- Held-forward base and stress performance.
- Ending balance and return.
- Trade count, wins/losses, win rate.
- Profit factor and expectancy in R.
- Max drawdown.
- Longest losing streak.
- Long/short contribution.
- Three held-forward windows.
- Average/min/max lots.
- Average planned risk percent and max planned risk percent.
- Largest realized single-trade loss as % of pre-trade equity.
- Count of gap losses exceeding planned risk.
- Minimum equity reached.
- Whether equity ever reached or fell below zero.

## Safety

Offline historical research only.
No production strategy, Vercel environment variable, live scanner, kill switch,
TRADING_ENABLED state, order route, or broker account is modified.
