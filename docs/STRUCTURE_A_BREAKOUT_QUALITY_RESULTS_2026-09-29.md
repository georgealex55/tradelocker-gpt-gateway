# Structure A Breakout Quality Results — 2026-09-29

## Run record

- Workflow run: 36601949334
- Branch: `research/structure-a-breakout-quality`
- Head SHA: `96cdca12c923af0edb2762aee0d18979a64a665f`
- Artifact: `structure-a-breakout-quality-results`
- Artifact ID: 11048754756
- Artifact digest: `sha256:9258e14f041fd3c89b628958b04bca1e7532173fe51760dde9adf668991515e3`
- Frozen input hash: `61e9d2fae987acf428cb8034e04514d7f84ad01e9e1a2f03d606de09ea740c14`
- Starting equity: $500
- Position size: 0.01 lot
- Risk model: 20% hard ceiling only
- Production modified: no
- Live execution: no

## Held-forward comparison

### BASELINE

Base:
- Ending balance: $499.62
- Return: -0.08%
- Trades: 69
- Profit factor: 0.996
- Expectancy: +0.004R
- Max drawdown: 4.88%
- Long: -3.727R
- Short: +4.004R

Stress:
- Ending balance: $488.79
- Return: -2.24%
- Profit factor: 0.890
- Expectancy: -0.097R

### CLOSE_LOCATION

Base:
- Ending balance: $491.03
- Return: -1.79%
- Trades: 58
- Profit factor: 0.902
- Expectancy: -0.043R
- Max drawdown: 4.80%

Stress:
- Ending balance: $479.54
- Return: -4.09%
- Profit factor: 0.778
- Expectancy: -0.173R

### BODY_LOCATION

Base:
- Ending balance: $496.19
- Return: -0.76%
- Trades: 49
- Profit factor: 0.952
- Expectancy: +0.001R
- Max drawdown: 4.15%

Stress:
- Ending balance: $483.89
- Return: -3.22%
- Profit factor: 0.800
- Expectancy: -0.164R

### DISPLACEMENT

Base:
- Ending balance: $507.76
- Return: +1.55%
- Trades: 44
- Wins / losses: 16 / 28
- Win rate: 36.36%
- Profit factor: 1.116
- Total R: +4.792R
- Expectancy: +0.109R
- Max drawdown: 3.19%
- Long contribution: -1.941R
- Short contribution: +6.733R
- Positive held-forward windows: 2/3

Stress:
- Ending balance: $496.03
- Return: -0.79%
- Trades: 42
- Profit factor: 0.942
- Total R: -2.958R
- Expectancy: -0.070R
- Max drawdown: 3.74%
- Long contribution: -2.275R
- Short contribution: -0.684R

## Interpretation

The DISPLACEMENT filter is the only preregistered breakout-quality variant that
improved held-forward base performance over Structure A while reducing
drawdown. The improvement is still not stress-robust. Direction contribution
again shows longs as the main drag, while shorts carry the base-cost edge.

The next test isolates DISPLACEMENT + SHORT-only under the same $500 / 0.01-lot /
20%-ceiling framework. Because that combination is selected after observing
this run, its held-forward result is exploratory; the earlier pre-validation
period must also be reported as a separate replication check.
