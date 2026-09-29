# Market Structure V1 Results — 2026-09-29

## Run record

- Workflow run: 36579389787
- Branch: `research/market-structure-v1`
- Head SHA: `a61ab4ebf8ba6c63dc1cdef6252456826c2941c5`
- Artifact: `market-structure-v1-results`
- Artifact ID: 11039665856
- Artifact digest: `sha256:7d12d7c7626dbdd6bb22c5dda8b22e33934f2190a91cafa6a3b36457cbb8dcf7`
- Frozen input hash: `61e9d2fae987acf428cb8034e04514d7f84ad01e9e1a2f03d606de09ea740c14`
- Held-forward start: `2025-05-14T10:30:00.000Z`
- Pair: USDCHF
- Primary capital/risk: $200 / 1%
- Live-feasibility diagnostic: $12 / max 27% / 0.01 lot
- Production modified: no
- Live execution: no

## Engine audit

The H1 structure engine processed 17,332 completed H1 bars and confirmed:

- 2,238 swing highs
- 2,380 swing lows
- 271 bullish BOS events
- 214 bearish BOS events
- 217 bullish CHoCH events
- 234 bearish CHoCH events
- 344 neutral bullish structure breaks
- 289 neutral bearish structure breaks

Regression tests covering pivot confirmation delay, HH/HL trend state, BOS,
CHoCH, one-break-per-pivot behavior, next-M15 retest execution, retest
invalidation, and CHoCH→BOS arming all passed before the historical run.

## Apples-to-apples USDCHF baseline

The corrected baseline is USDCHF-only Price Breakout V1 under the same
execution/risk/cost/held-forward frame.

### Base costs

- Trades: 34
- Wins / losses: 11 / 23
- Win rate: 32.35%
- Ending balance: $215.10
- Return: +7.55%
- Total R: +9.133R
- Profit factor: 1.375
- Expectancy: +0.269R/trade
- Max drawdown: 6.80%
- Long contribution: -5.562R across 21 trades
- Short contribution: +14.695R across 13 trades
- Positive held-forward windows: 3/3

### Stress costs

- Trades: 1
- Total R: -0.998R
- Return: -0.99%
- Expectancy: -0.998R/trade

The stress sample collapses primarily because the $200 / 1% / 0.01-lot
minimum-size constraint rejects most wider-stop entries.

### $12 / 27% feasibility

- Held-forward raw candidates: 888
- Candidates whose modeled 0.01-lot stop risk is <=27% of $12: 622
- Fit rate: 70.05%

## STRUCTURE_A — 20H channel breakout + same-bar BOS

### Setup diagnostics

- 20H channel breakouts: 1,837
- Same-bar BOS matches: 366
- Raw structure-filtered candidates: 366

### Base costs

- Trades: 15
- Wins / losses: 5 / 10
- Win rate: 33.33%
- Ending balance: $210.76
- Return: +5.38%
- Total R: +7.417R
- Profit factor: 1.650
- Expectancy: +0.494R/trade
- Max drawdown: 3.11%
- Long contribution: +0.350R across 8 trades
- Short contribution: +7.067R across 7 trades
- Positive held-forward windows: 2/3

### Stress costs

- Trades: 1
- Total R: +0.825R
- Return: +0.82%
- Expectancy: +0.825R/trade

The stress sample is only one trade and is not sufficient evidence of robustness.

### $12 / 27% feasibility

- Held-forward raw candidates: 173
- Candidates <=27% modeled risk at 0.01 lot: 130
- Fit rate: 75.14%
- Average modeled min-lot risk: 23.91% of $12
- Maximum modeled min-lot risk: 40.60%

### Gate result

Rejected for:
- Fewer than 20 held-forward trades.
- Insufficient stress sample.

Interpretation: Structure A materially increases selectivity. The observed base
sample has stronger profit factor, higher expectancy per trade, and lower
drawdown than the USDCHF-only breakout baseline, but it also cuts the trade
count from 34 to 15. It is therefore a promising filter, not a validated
replacement.

## STRUCTURE_B — HH/HL or LH/LL BOS + M15 retest

### Setup diagnostics

- BOS events evaluated: 485
- Retest READY: 174
- Retest INVALIDATED: 164
- Retest EXPIRED: 147
- Raw candidates: 174

### Base costs

- Trades: 3
- Wins / losses: 0 / 3
- Return: -2.64%
- Total R: -3.0R
- Profit factor: 0
- Expectancy: -1.0R/trade
- Max drawdown: 2.64%
- Positive held-forward windows: 0/3

### Stress costs

- Trades: 1
- Total R: -1.0R

### $12 / 27% feasibility

- Held-forward raw candidates: 83
- Candidates <=27% modeled risk: 63
- Fit rate: 75.90%
- Average modeled min-lot risk: 23.99%
- Maximum modeled min-lot risk: 49.09%

### Gate result

Rejected for sample size, negative expectancy/profit factor, stress fragility,
and inconsistent windows.

## STRUCTURE_C — CHoCH → BOS → M15 retest

### Setup diagnostics

- CHoCH→BOS confirmations evaluated: 177
- Retest READY: 53
- Retest INVALIDATED: 68
- Retest EXPIRED: 56
- Raw candidates: 53

### Base and stress

No held-forward trades survived the $200 / 1% / 0.01-lot execution constraints.

### $12 / 27% feasibility

- Held-forward raw candidates: 22
- Candidates <=27% modeled risk: 13
- Fit rate: 59.09%
- Average modeled min-lot risk: 26.62%
- Maximum modeled min-lot risk: 39.28%

### Gate result

Rejected for insufficient sample, no demonstrated positive expectancy, stress
fragility, and inconsistent windows.

## Conclusion

The market-structure engine itself is functioning and passed the no-lookahead
engineering tests.

Of the three frozen variants, only STRUCTURE_A produced a potentially useful
signal: combining the existing 20-H1 breakout with same-bar BOS produced a much
smaller but higher-quality base-cost sample. It does not qualify under the
pre-registered gates because the held-forward and stress samples are too small.

STRUCTURE_B and STRUCTURE_C do not justify promotion in their frozen forms.

The next defensible research step is not to tune A on the same sample. It is to
run a separately declared validation designed specifically to increase sample
size without changing the core BOS definition, such as evaluating the same
Structure A filter over additional historical data or on separately held-out
USDCHF data. A separate $12 / 27% execution replay can also test the actual
small-account minimum-lot behavior without changing the signal architecture.
