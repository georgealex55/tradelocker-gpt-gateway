# Experiment 002 results

Canonical full-config SHA-256: `1555de44077967dd0f2e3f3ceed45999fd52aaeff595788fe6db1c76b3f10f6f`

Conceptual change: opposite H1 channel exit extended from 10 bars to 12 bars; all other Experiment 001 settings frozen.

Base: 132 trades, +5.0843% return, +0.2059R expectancy, PF 1.1111, max drawdown 8.7935%.
Stress: 132 trades, +1.0172% return, +0.1159R expectancy, PF 1.0214, max drawdown 9.6122%.

Chronological windows: +5.7659R, +14.6777R, +6.7327R.
Pair contribution: USDCHF 59 trades / +16.0548R; GBPUSD 73 trades / +11.1215R.

Result: FAIL. The only failed frozen gate is pair-gain concentration: USDCHF supplied about 89.66% of positive pair dollar gains, above the 75% maximum.

Offline historical research only; no production or live execution paths were changed.
