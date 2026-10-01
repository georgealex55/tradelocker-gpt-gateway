# Strategy Solutions Suite V1 — Results and interpretation

Run date: 2026-10-01  
Corrected attribution run: 36940476260  
Artifact: 11199184773  
Dataset hash: `61e9d2fae987acf428cb8034e04514d7f84ad01e9e1a2f03d606de09ea740c14`

## Executive finding

Of the five tested solutions, only the **10-H1 channel exit architecture** materially improved the strategy and remained positive under both base and stress transaction-cost assumptions.

The fixed-1.8R architecture continues to fail. Static candle-strength tightening and a simple USD-breadth confirmation did not create a durable edge.

The channel-exit version is promising but does not yet pass the frozen research gates because its positive gains remain concentrated in one validation window.

---

## Baseline — SELL-only fixed 1.8R

Held-forward base:
- 185 trades
- $500 -> $479.33
- Return: -4.13%
- PF: 0.935
- Expectancy: -0.022R
- Max DD: 8.40%

Stress:
- $500 -> $459.74
- Return: -8.05%
- PF: 0.877
- Expectancy: -0.064R
- Max DD: 11.55%

Conclusion: no durable edge.

---

## 1. Attribution / rejection analysis

GBPUSD inside the three-pair portfolio:
- 47 trades
- +11.94R
- PF 1.453
- Expectancy +0.254R
- Win rate 48.94%

GBPUSD standalone:
- 88 trades
- -1.07R
- PF 0.918
- Expectancy -0.012R
- Win rate 38.64%

The most important subset:

GBPUSD trades executed in both the portfolio and standalone replay:
- 42 trades
- +14.34R
- PF 1.628
- Expectancy +0.341R
- Win rate 52.38%

GBPUSD trades newly admitted when the pair ran alone:
- 46 trades
- -15.41R
- PF 0.507
- Expectancy -0.335R
- Win rate 26.09%

Of those 46 newly admitted trades, 45 had been blocked in the portfolio by existing position capacity and 1 by the loss guard.

The newly admitted losing group did **not** have weaker-looking breakout candles:
- Portfolio-executed avg displacement: 0.837 ATR
- Newly admitted avg displacement: 0.966 ATR
- Portfolio-executed avg close location: 0.907
- Newly admitted avg close location: 0.922
- Portfolio-executed avg body fraction: 0.784
- Newly admitted avg body fraction: 0.805
- Portfolio-executed avg USD breadth count: 2.62
- Newly admitted avg USD breadth count: 2.85

Interpretation: stronger candle/displacement/breadth values do not explain the profitable subset. Portfolio occupancy itself is acting as a meaningful timing/state filter.

---

## 2. Replace fixed 1.8R with opposite 10-H1 channel exit

Held-forward base:
- 158 trades
- $500 -> $535.69
- Return: +7.14%
- +23.74R
- PF 1.149
- Expectancy +0.150R
- Max DD 6.98%

Stress:
- 158 trades
- $500 -> $512.99
- Return: +2.60%
- +10.91R
- PF 1.052
- Expectancy +0.069R
- Max DD 8.91%

Pair contributions, base:
- USDCHF: +17.05R, PF 1.300
- EURUSD: -12.31R, PF 0.628
- GBPUSD: +19.00R, PF 1.589

Stress:
- USDCHF: +7.91R, PF 1.140
- EURUSD: -14.05R, PF 0.584
- GBPUSD: +17.04R, PF 1.519

Validation windows:
1. +3.49R, dollar return -0.92%
2. +17.70R, dollar return +7.47%
3. +2.56R, dollar return +0.62%

Frozen gate result: **not yet eligible**, with only `WINDOW_GAIN_CONCENTRATION` remaining.

Interpretation: the entry architecture appears much better suited to a trend-following exit than a fixed 1.8R cap.

---

## 3. Pre-validation selectivity test

Five quality profiles were selected strictly using pre-validation history.

All five training profiles had negative aggregate expectancy:
- BASE: -0.0269R
- D15: -0.0183R
- D20: -0.0250R
- STRONG_CANDLE: -0.0189R
- STRONG_ALL: -0.0155R

The preregistered rule selected STRONG_ALL as the least-bad training candidate.

Held-forward STRONG_ALL:
- Base return: -7.38%
- PF 0.868
- Expectancy -0.0679R
- Max DD 11.28%
- Stress return: -11.06%
- Expectancy -0.1127R

Conclusion: tightening the candle/displacement thresholds does not solve the fixed-target strategy and shows classic instability between training and held-forward data.

---

## 4. Cross-pair USD breadth confirmation

Rule: >=2 of 3 four-H1 USD-strength votes, with at least one vote from another pair.

Base:
- 117 trades
- Return -0.76%
- PF 0.980
- Expectancy -0.0070R
- Max DD 5.43%

Stress:
- 116 trades
- Return -2.52%
- PF 0.936
- Expectancy -0.0336R
- Max DD 6.16%

Pair behavior:
- GBPUSD remained positive
- limited USDCHF sample remained positive
- EURUSD remained strongly negative

Conclusion: breadth improved the fixed-target baseline substantially, especially drawdown, but did not cross into durable profitability.

---

## 5. Transaction-cost robustness

### Fixed 1.8R baseline
- Optimistic: +0.031R expectancy
- Base: -0.022R
- Mid: -0.052R
- Stress: -0.064R
- Heavy: -0.091R

Not robust.

### Channel exit
- Optimistic: +0.218R
- Base: +0.150R
- Mid: +0.083R
- Stress: +0.069R
- Heavy: +0.010R

This is the only tested architecture that remained positive in R expectancy through the full cost grid and met the suite's BASE+STRESS robustness definition.

Dollar P&L at HEAVY costs was -2.24%, so the extreme-cost case still deserves caution despite slightly positive R expectancy.

### Pre-validation-selected quality
Negative at every cost level.

### USD breadth confirmation
Positive only under optimistic costs; negative at base and above.

---

## Overall conclusion

The strongest evidence points to **exit architecture**, not entry-strength tuning.

The fixed 1.8R target appears to be suppressing the value of breakout/displacement entries. Replacing it with the opposite 10-H1 channel exit changed the same basic entries from:
- Base: -4.13% / -0.022R expectancy
to:
- Base: +7.14% / +0.150R expectancy

and from:
- Stress: -8.05% / -0.064R
to:
- Stress: +2.60% / +0.069R.

The channel-exit strategy is therefore the primary research candidate.

It is **not ready for production**, because gains are still chronologically concentrated and EURUSD remains a consistent drag.

## Highest-information next experiments

1. Pre-register a channel-exit replay on **USDCHF + GBPUSD only**, with EURUSD removed because it was negative under both base and stress channel-exit results.
2. Separately test the same channel-exit architecture on earlier/pre-validation history and a later genuinely unseen data extension when enough new data accumulates.
3. Analyze holding-time and winner-size distributions for channel-exit trades to verify that profitability truly comes from a small number of extended trends rather than an execution artifact.
4. Preserve the current 0.01-lot / hard-ceiling sizing. Sizing was not the source of failure.
5. Do not further tune candle-body/displacement thresholds based on these held-forward results.

## Safety

All tests were offline historical research. Production, live trading, Vercel runtime state, and kill-switch state were not modified.
