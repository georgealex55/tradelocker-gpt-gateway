# Forex Strategy Plan

## Goal

Build a deterministic forex system that can be backtested and forward-tested
with roughly $150 of starting capital while remaining defensive around
scheduled political/economic events and unscheduled volatility shocks.

"Event resistant" means the system stops opening new positions when risk
conditions are abnormal. It does not try to predict election outcomes,
political statements, central-bank decisions, or headline direction.

## Q2 — candidate architectures

### A. H1 trend + M15 pullback/continuation

Use a completed 1H trend filter, then look for a 15-minute pullback and
confirmation in the trend direction.

Strengths:
- naturally selective
- works with fixed stops and targets
- easy to make event-aware
- suitable for next-candle-open backtesting
- less dependent on millisecond execution

Weaknesses:
- misses sudden V-shaped reversals
- can enter late after a strong move
- small accounts may skip many setups when 0.01 lot exceeds the risk cap

### B. London/New York breakout + retest

Trade a break of a defined session range only after a retest/confirmation.

Strengths:
- objective levels
- can catch directional expansion days
- easy to test

Weaknesses:
- false breakouts increase around news
- execution/spread quality matters more
- overnight/session definitions require careful DST handling

### C. Range mean reversion

Fade stretched moves back toward a mean when ADX is low and volatility is
stable.

Strengths:
- frequent opportunities in quiet markets
- tight stops can fit a small account

Weaknesses:
- most vulnerable architecture to policy/news shocks
- a range can become a trend quickly
- requires stronger emergency shutdown logic

### D. Regime router

Classify the market as trend/range/shock and route to A, B, or C.

Strengths:
- can adapt to different market conditions

Weaknesses:
- much more complex
- easier to overfit
- harder to diagnose with a small sample
- not appropriate as the first live version

## Q1 — selected Strategy V1

Start with Architecture A: completed H1 trend + M15 pullback/continuation.

### Initial universe

Use only TradeLocker instruments whose type is FOREX. Begin testing with USD
majors available on the connected account:

- EURUSD
- GBPUSD
- USDJPY
- USDCHF

Only one position may be open at a time. This also prevents the small account
from accidentally stacking correlated USD exposure.

### Capital and sizing

Baseline backtest/live starting capital: $150.

- maximum risk per trade: 1% of current equity
- at $150 that is $1.50
- maximum size in V1: 0.01 lot
- if TradeLocker's minimum lot risks more than the allowed amount, skip the
  setup
- maximum 2 trades per day
- stop after 2 consecutive losses
- daily loss ceiling: 2%
- weekly pause threshold: 5%
- no martingale, no averaging down, no grid
- no partial exits at 0.01 lot

The backtester must use broker lotSize/minLot/lotStep metadata rather than
pretending fractional micro-lots are available.

### H1 regime filter

Long bias requires all of:

1. H1 EMA50 > EMA200.
2. H1 close > EMA200.
3. H1 ADX14 >= 20.
4. H1 +DI > -DI.
5. No event-risk or volatility-shock block.

Short bias is the mirror image.

No trade when the 1H regime is mixed.

### M15 setup

Baseline long rules are fixed before testing:

1. M15 EMA20 > EMA50.
2. During the previous 3 completed bars, price comes within 0.25 ATR of the
   EMA20/EMA50 pullback zone without closing through the trend structure.
3. RSI14 resets into the 40-55 range during the pullback, then finishes back
   above 50.
4. MACD histogram crosses from zero-or-negative to positive.
5. The confirmation candle closes above the previous completed candle high.
6. Entry is the next M15 candle open.

Baseline short rules are the mirror:
- EMA20 < EMA50
- 3-bar pullback within 0.25 ATR
- RSI reset in the 45-60 range, then below 50
- MACD histogram crosses from zero-or-positive to negative
- confirmation closes below the previous candle low
- entry next candle open

These are baseline parameters, not claims that they are optimal. Changes are
allowed only after development/out-of-sample comparison.

### Session

Baseline entries are allowed from 07:00 through 16:00 UTC, Monday through
Friday. V1 uses a fixed UTC window specifically to avoid DST/session bugs.
Session logic can be refined after the baseline has been measured.

### Stop

Use structure first:

- recent 5-bar swing low/high
- plus a 0.20 ATR buffer

Reject a setup when the resulting 0.01-lot loss exceeds the account risk cap.

### Target

Initial fixed target: 1.8R.

Do not add break-even moves, trailing stops, or partial exits to V1. Test the
plain version first so later management changes can be measured independently.

### Event-risk layer

Scheduled high-impact events are a no-new-entry condition.

Default windows:
- normal high-impact macro: 60 minutes before through 30 minutes after
- FOMC-style event: 90 minutes before through 60 minutes after

The 2026 U.S. federal general election receives a wider USD blackout:
2026-11-02 17:00 UTC through 2026-11-04 17:00 UTC.

Unscheduled shock protection also blocks new entries when:
- spread exceeds the absolute cap
- spread is more than 2x its recent normal level
- ATR is more than 2x its recent median
- a single candle range exceeds 2.5x ATR

After a shock, wait at least four M15 bars and require conditions to normalize
before reopening entries.

### Test sequence

1. Pull TradeLocker 15m historical bars.
2. Build completed H1 candles from those same 15m bars.
3. Calculate the same indicators used live.
4. Run Strategy V1 with next-open entries.
5. Enforce actual TradeLocker min lot/lot step.
6. Include conservative spread and slippage.
7. Split results into development and out-of-sample periods.
8. Forward-test on demo before any live enablement.
