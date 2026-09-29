# Structure A — $500 Minimum-Lot / 20% Ceiling Results

## Run record

- Workflow run: 36601079919
- Branch: `research/structure-a-500-minlot-20cap`
- Head SHA: `f4f31f693c7abdb54d32f7b6802ada9c64c5745f`
- Frozen input hash: `61e9d2fae987acf428cb8034e04514d7f84ad01e9e1a2f03d606de09ea740c14`
- Starting equity: $500
- Position size rule: 0.01 lot if modeled stop risk <= 20% of current equity; otherwise skip.
- Structure A signal rules unchanged.
- Production modified: no.
- Live execution: no.

## Held-forward base costs

- Ending balance: $499.62
- Return: -0.08%
- Trades: 69
- Wins / losses: 23 / 46
- Win rate: 33.33%
- Profit factor: 0.996
- Total R: +0.277R
- Expectancy: +0.004R/trade
- Max drawdown: 4.88%
- Longest losing streak: 6
- Minimum equity: $497.90
- Positive held-forward windows: 2/3

### Risk actually used

- Position size: 0.01 lot on every executed trade.
- Average planned risk: 0.526% of current equity.
- Maximum planned risk: 0.911%.
- Largest realized single-trade loss: 0.720% of pre-trade equity.
- Trades skipped because 0.01 lot exceeded the 20% ceiling: 0.

## Stress costs

- Ending balance: $488.79
- Return: -2.24%
- Trades: 65
- Wins / losses: 22 / 43
- Win rate: 33.85%
- Profit factor: 0.890
- Total R: -6.286R
- Expectancy: -0.097R/trade
- Max drawdown: 5.60%
- Minimum equity: $488.79
- Average planned risk: 0.569%
- Maximum planned risk: 0.948%
- Largest realized single-trade loss: 0.752%

## Interpretation

This run confirms the intended ceiling model behaves very differently from
target-risk compounding. The 20% value acts only as a safety cap. With $500
equity and 0.01 lot, the actual modeled risk never approached the ceiling, so
no trade was enlarged to consume unused risk budget and no trade was rejected
for exceeding the 20% ceiling.

The base-cost result is effectively flat after costs; the stress-cost result is
negative. These findings are research-only and do not change live settings.
