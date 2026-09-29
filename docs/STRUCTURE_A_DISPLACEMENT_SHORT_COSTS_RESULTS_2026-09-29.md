# Structure A Displacement + SHORT Cost Sensitivity Results — 2026-09-29

## Frozen candidate

- USDCHF SHORT-only.
- Structure A 20-H1 breakout + same-bar bearish BOS.
- Close in bottom 25% of H1 range.
- H1 body >= 50% of range.
- Displacement >= 0.10 ATR below the stronger broken boundary.
- $500 start.
- 0.01 lot.
- 20% hard risk ceiling only.
- 2×ATR stop and opposite 10-H1 channel exit unchanged.

## Held-forward cost sensitivity

| Profile | Spread | Slip/side | Modeled round-trip cost | Trades | Return | PF | Expectancy R | Max DD | Positive windows |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| LIVE_LIKE | 1.8 | 0.2 | 2.2 | 19 | +1.42% | 1.244 | +0.372 | 3.78% | 2/3 |
| BASE | 2.0 | 0.2 | 2.4 | 19 | +1.33% | 1.225 | +0.354 | 3.82% | 2/3 |
| MODERATE_22 | 2.2 | 0.2 | 2.6 | 18 | -0.37% | 0.938 | -0.005 | 3.92% | 2/3 |
| MODERATE_24 | 2.4 | 0.3 | 3.0 | 18 | -0.55% | 0.909 | -0.024 | 4.00% | 2/3 |
| STRESS | 2.5 | 0.4 | 3.3 | 18 | -0.69% | 0.888 | -0.038 | 4.07% | 2/3 |
| HEAVY | 2.8 | 0.4 | 3.6 | 17 | -0.38% | 0.935 | +0.004 | 3.70% | 2/3 |
| MAX_ALLOWED_SPREAD | 3.0 | 0.5 | 4.0 | 14 | -1.70% | 0.674 | -0.188 | 4.89% | 1/3 |

The non-monotonic HEAVY result occurs because the existing spread-to-stop guard
blocks additional narrow-stop trades as spread rises, changing the trade set.
It should not be interpreted as higher costs improving the same trades.

## Earlier pre-validation replication

The candidate stayed positive across all tested cost profiles in the earlier
period, ranging from approximately +0.63% to +2.59%, with positive expectancy
and PF above 1.08 in every profile.

## Interpretation

The held-forward edge is viable around the LIVE_LIKE and BASE profiles but
disappears around a 2.2-pip spread with 0.2-pip slippage per side. This makes
execution quality a first-order constraint. The existing 3-pip spread ceiling
is too loose to describe the cost region where this candidate retained a
held-forward edge.

This is research-only. No live spread cap or Production setting is changed by
this result.
