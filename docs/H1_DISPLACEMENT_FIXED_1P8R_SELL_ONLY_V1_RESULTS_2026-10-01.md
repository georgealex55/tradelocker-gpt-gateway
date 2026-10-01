# H1 Displacement + Fixed 1.8R SELL-Only V1 — Results

Run date: 2026-10-01  
Workflow run: 36932232052  
Artifact: 11196461840  
Dataset hash: `61e9d2fae987acf428cb8034e04514d7f84ad01e9e1a2f03d606de09ea740c14`

## Frozen change

Only SELL signals were allowed. All other rules were unchanged from the preregistered parent strategy.

## Held-forward base

- Start: $500
- End: $479.3269539739322
- Return: -4.134609205213567%
- Trades: 185
- Wins / losses: 72 / 113
- Win rate: 38.91891891891892%
- Profit factor: 0.9346369291808672
- Expectancy: -0.022356083231249647R
- Total R: -4.135875397781184R
- Max drawdown: 8.399977691335167%
- Longest losing streak: 9
- Average planned risk: 0.5593659064582454%
- Max planned risk: 1.1083308343847436%
- Min-lot risk skips: 0

## Held-forward stress

- Start: $500
- End: $459.7353721156314
- Return: -8.052925576873728%
- Trades: 184
- Win rate: 38.58695652173913%
- Profit factor: 0.8771564780911676
- Expectancy: -0.06433846298676632R
- Total R: -11.838277189565003R
- Max drawdown: 11.547906980177547%

## Pair contribution — base

- USDCHF: 71 trades, -1.6486748698603881R, PF 0.8821861064460886, -2.9712377766419182%
- EURUSD: 67 trades, -14.426136631235543R, PF 0.6598174134808478, -7.889028571428574%
- GBPUSD: 47 trades, +11.938936103314752R, PF 1.453036951501134, +6.725657142856925%

## Chronological validation windows

1. 64 trades, -0.9208969689197765R, -2.25078394933866%
2. 59 trades, +1.2868181173552546R, -0.17521235664142315%
3. 62 trades, -4.501796546216664R, -1.7550651529573202%

## Decision

Not eligible.

Rejection reasons:
- WEAK_EXPECTANCY_OR_PF
- STRESS_FRAGILE
- INCONSISTENT_WINDOWS
- PAIR_GAIN_CONCENTRATION

The prior mixed-direction run's profitable SELL contribution did not reproduce when SELL trades were replayed standalone. Removing BUY trades changed portfolio capacity, cooldown/loss-guard state, and the sequence of admitted SELL trades: standalone SELL executed 185 validation trades versus 117 SELL trades embedded in the mixed portfolio.

GBPUSD SELL remained the only positive pair-level component and should be treated as a separately testable hypothesis, not as an adopted filter.

## Safety

Offline research only. Production and live-execution configuration were not modified.
