# Market Structure V1 — Pre-registered research protocol

Recorded before this experiment's historical results are computed.

## Purpose

Test whether explicit non-repainting market structure improves the existing
USDCHF price-breakout architecture. This experiment adds HH/HL/LH/LL,
BOS, CHoCH, and retest logic without changing Production V1 or the live
Breakout V1 shadow scanner.

## Data and comparison frame

- Frozen TradeLocker portfolio-144 archive only.
- Frozen dataset hash:
  `61e9d2fae987acf428cb8034e04514d7f84ad01e9e1a2f03d606de09ea740c14`.
- Pair: USDCHF only.
- Primary starting balance: $200.
- Primary risk: 1.00% per trade.
- Broker minimum and maximum for this experiment: 0.01 lot.
- Same held-forward boundary as corrected portfolio-144:
  `2025-05-14T10:30:00.000Z`.
- Same three chronological held-forward windows.
- Same base and stress cost assumptions as Price Breakout V1.
- No parameter is changed after seeing the results.

## H1 structure engine

Structure uses completed H1 candles built from the frozen common M15 timeline.

### Confirmed swings

A swing uses a 5-H1-bar pivot with two completed H1 bars on each side.

- Swing high at H1 bar `i`: its high is strictly greater than the highs of
  bars `i-2`, `i-1`, `i+1`, and `i+2`.
- Swing low at H1 bar `i`: its low is strictly less than the lows of those
  four neighboring bars.
- The pivot is not available to the strategy until bar `i+2` closes.
- Equal highs/lows do not create a pivot. This avoids ambiguous tie handling.

Each newly confirmed swing high is labeled:
- HH if above the prior confirmed swing high.
- LH if below the prior confirmed swing high.
- EQH if exactly equal to the prior confirmed swing high; EQH leaves trend neutral.

Each newly confirmed swing low is labeled:
- HL if above the prior confirmed swing low.
- LL if below the prior confirmed swing low.
- EQL if exactly equal to the prior confirmed swing low; EQL leaves trend neutral.

The first confirmed high/low is labeled FIRST_HIGH/FIRST_LOW and does not by
itself establish trend.

### Trend state

- BULLISH only when the latest confirmed high is HH and latest confirmed low is HL.
- BEARISH only when the latest confirmed high is LH and latest confirmed low is LL.
- Otherwise NEUTRAL.

### BOS and CHoCH

Breaks require a completed H1 close, never a wick.

A structural level may produce only one break event. A later recross of the
same already-broken pivot is not another BOS.

- Bullish BOS: BULLISH trend and H1 close breaks above the latest unbroken
  confirmed swing high.
- Bearish BOS: BEARISH trend and H1 close breaks below the latest unbroken
  confirmed swing low.
- Bullish CHoCH: BEARISH trend and H1 close breaks above the latest unbroken
  confirmed swing high.
- Bearish CHoCH: BULLISH trend and H1 close breaks below the latest unbroken
  confirmed swing low.
- Breaks from NEUTRAL structure are recorded as neutral structure breaks but
  do not qualify as BOS or CHoCH entries.

## Volatility, stop, and exit

- ATR: 14 completed H1 bars, same true-range definition as Breakout V1.
- Initial stop: 2.0 × the BOS H1 ATR from the actual M15 entry open.
- No fixed take-profit.
- Exit: next M15 open after a completed H1 close crosses the opposite prior
  10-H1 channel, exactly as in Price Breakout V1.
- Intrabar stop and adverse opening gap handling remain stop-first.

## Retest definition

For variants requiring a retest:

- The structural break level is the broken confirmed pivot price.
- Search the next 8 completed M15 candles after the BOS H1 closes.
- Long retest: M15 low touches or trades below the broken level and that M15
  closes back above the level.
- Short retest: M15 high touches or trades above the broken level and that M15
  closes back below the level.
- Entry is the following M15 open.
- Before a valid retest occurs, an M15 close on the wrong side of the broken
  level invalidates that setup.
- A setup expires after 8 M15 bars.
- No penetration tolerance or discretionary zone is used.

## Frozen variants

### STRUCTURE_A — Channel breakout + same-bar BOS

Use the existing 20-H1 price channel breakout. Enter next M15 open only when
the same completed H1 bar also produces a same-direction BOS from an
established trend.

### STRUCTURE_B — Trend BOS + M15 retest

Ignore the 20-H1 entry trigger. Use a BULLISH/Bearish BOS from established
HH/HL or LH/LL structure, then require the frozen 8-M15-bar retest above.

### STRUCTURE_C — CHoCH → BOS → M15 retest

Arm a reversal direction when CHoCH occurs. The first later same-direction BOS
from an established new trend confirms the reversal. Then require the same
8-M15-bar retest. An opposite CHoCH before the confirming BOS replaces the
armed reversal direction.

## Shared execution/risk controls

- Entry session: 07:00 <= UTC hour < 16:00.
- Weekend entries blocked.
- Strict scheduled-news blackout. For retest variants, any blackout overlapping
  the interval from BOS close through entry blocks the setup.
- One USDCHF position maximum.
- Maximum two entries per UTC day.
- Daily loss guard: -2%.
- Weekly loss guard: -5%.
- Stop after two consecutive losses.
- One-hour post-trade cooldown.
- Spread <= 3 pips.
- Spread <= 20% of stop distance.
- No averaging down, martingale, or grid.

## Costs

- Base: 2.0-pip spread + 0.2-pip slippage per side.
- Stress: 2.5-pip spread + 0.4-pip slippage per side.

## Evaluation

Each variant reports full-period descriptive, held-forward base, held-forward
stress, three chronological held-forward windows, direction contribution,
structure-event counts, setup/retest diagnostics, and trade list.

Single-pair research gates:

- >= 20 held-forward base trades.
- Positive held-forward expectancy.
- Held-forward profit factor > 1.10.
- Held-forward max drawdown <= 10%.
- Positive stress expectancy with >= 15 stress trades.
- At least two of three held-forward windows have positive total R.

These gates are diagnostic only and are not changed after results are seen.

## $12 / 27% live-test feasibility diagnostic

The primary strategy comparison remains normalized at $200 / 1% so signal
quality is comparable to prior research. Separately, for every held-forward
entry candidate, calculate the modeled 0.01-lot loss-to-stop including base
costs as a percentage of $12. Report how many candidates are <= 27%.

This feasibility diagnostic does not change entries, stops, or primary results.

## Safety

Offline research only. No broker order client, live execution path, Vercel
environment variable, production scanner, kill switch, or trading-enabled
setting is modified by this experiment.
