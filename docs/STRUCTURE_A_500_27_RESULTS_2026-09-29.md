# Structure A — $500 / 27% Risk Replay Results

## Run record

- Workflow run: 36581280390
- Branch: `research/structure-a-500-27`
- Head SHA: `e01a16d852673213cfce96793041e37416f9b947`
- Artifact: `structure-a-500-27-results`
- Artifact ID: 11038479267
- Artifact digest: `sha256:126eb32be67731045211fa359e18e9470dd9e168f79d582d0b9d8d093c2a5fef`
- Frozen input hash: `61e9d2fae987acf428cb8034e04514d7f84ad01e9e1a2f03d606de09ea740c14`
- Starting equity: $500
- Signal architecture: frozen STRUCTURE_A
- Production modified: no
- Live execution: no

## Signal architecture

No Structure A rule changed.

- USDCHF only.
- 20-H1 channel breakout.
- Same completed H1 bar must also produce same-direction BOS.
- Confirmed 5-H1-bar non-repainting pivots.
- Entry at next M15 open.
- Stop = 2×14-H1 ATR.
- Exit = opposite prior 10-H1 channel.
- Existing session, macro, spread, cooldown, daily/weekly loss, and capacity controls preserved.

The frozen archive contained 1,837 channel breakouts and 366 same-bar BOS matches.

## TRUE_27_PERCENT — dynamic compounding risk

Position size was recalculated on every new entry to target no more than 27% of
current equity, rounded down to broker lot step and bounded by broker max lot.

### Held-forward base costs

- Starting balance: $500.00
- Ending balance: $20.29
- Return: -95.94%
- Trades: 60
- Wins / losses: 21 / 39
- Win rate: 35.00%
- Profit factor: 0.881
- Total R: +3.318R
- Expectancy: +0.055R/trade
- Max drawdown: 98.82%
- Longest losing streak: 6
- Long contribution: -1.797R across 30 trades
- Short contribution: +5.115R across 30 trades
- Positive held-forward windows: 2/3
- Minimum equity: $20.29
- Equity at or below zero: no

### Sizing diagnostics

- Minimum size: 0.02 lots
- Average size: 0.4472 lots
- Maximum size: 1.96 lots
- Average planned risk: 26.00% of pre-trade equity
- Maximum planned risk: 26.997%
- Largest realized single-trade loss: 26.95% of pre-trade equity
- Gap losses exceeding planned risk: 0

The positive total-R value alongside a severe dollar loss is a consequence of
dynamic compounding. R multiples weight each trade relative to that trade's
then-current risk budget. Large early dollar losses shrink future equity and
future dollar gains; later positive-R trades therefore cannot recover the same
absolute dollars lost at higher equity.

### Stress costs

- Ending balance: $15.31
- Return: -96.94%
- Trades: 56
- Wins / losses: 20 / 36
- Win rate: 35.71%
- Profit factor: 0.824
- Total R: -3.011R
- Expectancy: -0.054R/trade
- Max drawdown: 98.77%
- Minimum equity: $15.31
- Average planned risk: 25.64%
- Maximum planned risk: 26.998%
- Largest realized single-trade loss: 26.89%
- Gap losses exceeding planned risk: 0

## CAPPED_0_01 — current lot-cap diagnostic

The same $500 balance and 27% ceiling were used, but position size could never
exceed 0.01 lot.

### Held-forward base costs

- Ending balance: $499.62
- Return: -0.08%
- Trades: 69
- Wins / losses: 23 / 46
- Win rate: 33.33%
- Profit factor: 0.996
- Total R: +0.277R
- Expectancy: +0.004R/trade
- Max drawdown: 4.88%
- Minimum equity: $497.90
- Positive held-forward windows: 2/3

### Sizing diagnostics

- Position size: 0.01 lot on every executed trade
- Average planned risk: 0.526% of equity
- Maximum planned risk: 0.911%
- Largest realized single-trade loss: 0.720%

### Stress costs

- Ending balance: $488.79
- Return: -2.24%
- Trades: 65
- Profit factor: 0.890
- Expectancy: -0.097R/trade
- Max drawdown: 5.60%
- Minimum equity: $488.79
- Average planned risk: 0.569%
- Maximum planned risk: 0.948%

## Conclusion

STRUCTURE_A remains the signal architecture, but 27% true compounding risk is
not supported by this historical path. The account did not mathematically hit
zero, but base and stress runs both lost more than 95% of starting equity and
experienced nearly 99% peak-to-trough drawdown.

At $500 with a 0.01-lot cap, the nominal 27% ceiling is not approached. Actual
modeled planned risk stays below 1% per trade, producing a dramatically flatter
equity path but no demonstrated edge after costs in this replay.

These results are an offline risk experiment only and do not alter the live
gateway configuration.
