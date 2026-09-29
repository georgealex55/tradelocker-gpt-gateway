# Structure A Direction Isolation Results — 2026-09-29

## Run record

- Workflow run: 36601421148
- Branch: `research/structure-a-direction-isolation`
- Head SHA: `0de58f154a62d2def883c197e859b21623e703da`
- Frozen input hash: `61e9d2fae987acf428cb8034e04514d7f84ad01e9e1a2f03d606de09ea740c14`
- Starting equity: $500
- Position size: 0.01 lot
- Risk model: 20% hard ceiling only
- Production modified: no
- Live execution: no

## BOTH

Base:
- Ending balance: $499.62
- Return: -0.08%
- Trades: 69
- Profit factor: 0.996
- Expectancy: +0.004R
- Max drawdown: 4.88%
- Long contribution: -3.727R
- Short contribution: +4.004R
- Positive held-forward windows: 2/3

Stress:
- Ending balance: $488.79
- Return: -2.24%
- Profit factor: 0.890
- Expectancy: -0.097R

## LONG_ONLY

Base:
- Ending balance: $497.32
- Return: -0.54%
- Trades: 37
- Wins/losses: 13/24
- Profit factor: 0.952
- Expectancy: -0.101R
- Max drawdown: 3.34%
- Positive held-forward windows: 0/3

Stress:
- Ending balance: $496.12
- Return: -0.78%
- Trades: 35
- Profit factor: 0.929
- Expectancy: -0.100R

## SHORT_ONLY

Base:
- Ending balance: $502.31
- Return: +0.46%
- Trades: 32
- Wins/losses: 10/22
- Win rate: 31.25%
- Profit factor: 1.049
- Expectancy: +0.125R
- Max drawdown: 4.35%
- Longest losing streak: 10
- Positive held-forward windows: 2/3

Stress:
- Ending balance: $492.67
- Return: -1.47%
- Trades: 30
- Profit factor: 0.846
- Expectancy: -0.093R
- Max drawdown: 4.66%

## Interpretation

Long-only Structure A is negative in both base and stress conditions over the
held-forward sample. Short-only is positive under base costs but loses under
stress costs. The short-side edge is therefore directionally stronger but too
cost-sensitive to qualify as a robust standalone strategy on this evidence.

The next diagnostic is entry-hour decomposition of the frozen Structure A
trades. Any time-of-day pattern found there is exploratory and must be validated
on separate held-out data before being used as a trading rule.
