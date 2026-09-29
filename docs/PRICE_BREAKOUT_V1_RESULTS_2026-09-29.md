# Price Breakout + Channel Exit V1 — Results (2026-09-29)

## Decision

**Not eligible for promotion.** The fixed price-breakout candidate materially improved
held-forward base-cost performance versus `forex-trend-pullback-v1`, but it failed
the pre-registered stress and pair-concentration gates.

GitHub Actions run: `36529369578`  
Research commit: `33781242fd76976c5a61ad68742528497041d481`  
Frozen input hash: `61e9d2fae987acf428cb8034e04514d7f84ad01e9e1a2f03d606de09ea740c14`

## Strategy tested

- H1 close outside the prior 20-H1-bar channel.
- Next M15 open entry.
- 14-H1-bar ATR.
- Initial stop = 2.0 × ATR from actual entry.
- No fixed profit target.
- Opposite 10-H1-bar channel exit, executed next M15 open.
- USDCHF, EURUSD, GBPUSD.
- $200 starting balance, fixed 1% risk, one portfolio position, max 0.01 lot.
- Maximum two portfolio entries per UTC day.
- 07:00–16:00 UTC entry session.
- Strict reviewed macro blackout.
- Existing spread, cooldown and portfolio loss guards.
- Base costs: 2.0-pip spread + 0.2-pip slippage per side.
- Stress costs: 2.5-pip spread + 0.4-pip slippage per side.

Rules were frozen in `docs/PRICE_BREAKOUT_V1_PROTOCOL.md` before results were run.

## Held-forward result

| Metric | Breakout V1 |
|---|---:|
| Trades | 90 |
| Wins / losses | 29 / 61 |
| Win rate | 32.22% |
| Ending balance | $212.63 |
| Return | +6.31% |
| Profit factor | 1.125 |
| Expectancy | +0.0729R |
| Total R | +6.563R |
| Realized max drawdown | 8.47% |
| Long contribution | -7.600R |
| Short contribution | +14.163R |
| Minimum-lot skips | 807 |

The base-cost held-forward result passed trade-count, expectancy/PF and drawdown gates.

## Stress result

| Metric | Stress |
|---|---:|
| Trades | 42 |
| Ending balance | $183.75 |
| Return | -8.12% |
| Profit factor | 0.692 |
| Expectancy | -0.1975R |
| Total R | -8.295R |
| Realized max drawdown | 9.55% |
| Minimum-lot skips | 1,081 |

This fails the `STRESS_FRAGILE` gate. Higher modeled spread/slippage plus the broker
minimum lot changed the executable trade set substantially.

## Pair contribution — held-forward base costs

| Pair | Trades | Net contribution | PF | Expectancy | Total R |
|---|---:|---:|---:|---:|---:|
| USDCHF | 34 | +$26.37 | 1.801 | +0.441R | +15.001R |
| EURUSD | 49 | -$2.08 | 0.963 | -0.052R | -2.524R |
| GBPUSD | 7 | -$11.66 | 0.014 | -0.845R | -5.914R |

USDCHF supplied essentially all positive pair gains, causing
`PAIR_GAIN_CONCENTRATION`. Within USDCHF, shorts supplied +17.890R while longs
supplied -2.888R.

## Chronological held-forward windows

| Window | Trades | Return in window | PF | Expectancy | Total R |
|---|---:|---:|---:|---:|---:|
| 1 | 12 | +2.82% | 1.347 | +0.271R | +3.250R |
| 2 | 28 | +3.93% | 1.307 | +0.159R | +4.465R |
| 3 | 50 | -0.51% | 0.981 | -0.023R | -1.152R |

Two of three windows were positive, so window consistency itself passed.

## Regime split diagnostic

These splits are descriptive only and were not used to tune parameters.

| Segment | Trades | Return | PF | Expectancy | Max DD |
|---|---:|---:|---:|---:|---:|
| Before 2025-01-20 17:00Z | 80 | -14.70% | 0.667 | -0.204R | 19.67% |
| 2025-01-20 17:00Z forward | 114 | +7.34% | 1.110 | +0.0739R | 12.66% |

The candidate is therefore not robust across the two historical segments in this
dataset. The split is a market-regime observation, not a causal claim about political
leadership or policy.

## Comparison with original V1 held-forward base result

Original `forex-trend-pullback-v1`:
- 40 trades
- $197.57 ending balance
- -1.21% return
- PF 0.941
- expectancy -0.0523R
- 9.75% realized max drawdown

Price Breakout V1:
- 90 trades
- $212.63 ending balance
- +6.31% return
- PF 1.125
- expectancy +0.0729R
- 8.47% realized max drawdown

The architecture is a stronger base-cost research lead than V1, but it cannot be
promoted because its edge disappears under stressed execution and is concentrated
in one pair/direction.

## Next research implication

Do not tune the 20/10 channels, ATR multiple, session hours, pair list or direction
using this same outcome. Two clean next experiments remain:

1. Run the previously planned **Failed-Breakout Reversal in Quiet Markets** strategy
   as a separately preregistered architecture.
2. Independently, run a **$500 diagnostic only** on this frozen breakout architecture
   to measure how much the $200 broker minimum-lot constraint is changing the trade
   population. This is a sizing/mechanics diagnostic, not a route to qualify the
   $200 candidate.

Production execution remains unchanged. No orders were sent.
