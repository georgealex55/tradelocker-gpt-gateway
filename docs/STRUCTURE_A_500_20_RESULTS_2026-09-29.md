# Structure A — $500 / 20% Risk Replay Results

## Run record

- Workflow run: 36591304967
- Branch: `research/structure-a-500-20`
- Head SHA: `0575064f52399d4b68b81fabb306b010b827b327`
- Artifact: `structure-a-500-20-results`
- Artifact ID: 11043897677
- Artifact digest: `sha256:b293a3d7086087c22b0af4a34a09c032297f6e631c2997ac6bf1f454fa295039`
- Frozen input hash: `61e9d2fae987acf428cb8034e04514d7f84ad01e9e1a2f03d606de09ea740c14`
- Starting equity: $500
- Signal architecture: frozen STRUCTURE_A
- Production modified: no
- Live execution: no

## TRUE_20_PERCENT

### Held-forward base costs

- Ending balance: $88.44
- Return: -82.31%
- Trades: 60
- Wins / losses: 21 / 39
- Win rate: 35.00%
- Profit factor: 0.891
- Total R: +3.318R
- Expectancy: +0.055R/trade
- Max drawdown: 94.09%
- Longest losing streak: 6
- Long contribution: -1.797R across 30 trades
- Short contribution: +5.115R across 30 trades
- Positive held-forward windows: 2/3
- Minimum equity: $88.44
- Equity at or below zero: no

### Sizing

- Minimum size: 0.08 lots
- Average size: 0.4132 lots
- Maximum size: 1.27 lots
- Average planned risk: 19.66%
- Maximum planned risk: 19.99%
- Largest realized single-trade loss: 19.97%
- Gap losses exceeding planned risk: 0

### Stress costs

- Ending balance: $44.84
- Return: -91.03%
- Trades: 57
- Wins / losses: 20 / 37
- Win rate: 35.09%
- Profit factor: 0.808
- Total R: -4.010R
- Expectancy: -0.070R/trade
- Max drawdown: 95.75%
- Minimum equity: $44.84
- Average planned risk: 19.47%
- Maximum planned risk: 20.00%
- Largest realized single-trade loss: 19.96%

## CAPPED_0_01

### Base costs

- Ending balance: $499.62
- Return: -0.08%
- Trades: 69
- Win rate: 33.33%
- Profit factor: 0.996
- Expectancy: +0.004R/trade
- Max drawdown: 4.88%
- Average planned risk: 0.526%
- Maximum planned risk: 0.911%

### Stress costs

- Ending balance: $488.79
- Return: -2.24%
- Trades: 65
- Profit factor: 0.890
- Expectancy: -0.097R/trade
- Max drawdown: 5.60%
- Average planned risk: 0.569%
- Maximum planned risk: 0.948%

## Comparison with the prior 27% replay

Reducing true target risk from 27% to 20% improved survivability materially,
but it did not make this risk level acceptable historically.

- 27% base ending balance: $20.29 (-95.94%).
- 20% base ending balance: $88.44 (-82.31%).
- 27% base max drawdown: 98.82%.
- 20% base max drawdown: 94.09%.
- 27% stress ending balance: $15.31 (-96.94%).
- 20% stress ending balance: $44.84 (-91.03%).

The Structure A signal path remains unchanged. The result shows that 20% true
compounding risk is still far above what this historical trade sequence can
tolerate.

These results are offline research only and do not modify live trading settings.
