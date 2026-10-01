# H1 Displacement + Fixed 1.8R — GBPUSD SELL-Only V1 Results

Run date: 2026-10-01  
Workflow run: 36932824106  
Artifact: 11196647469  
Dataset hash: `61e9d2fae987acf428cb8034e04514d7f84ad01e9e1a2f03d606de09ea740c14`

## Frozen hypothesis

Execute only GBPUSD SELL signals. All breakout, displacement, stop, target, sizing,
session, news, loss-guard, spread, and cost rules were held constant.

## Held-forward base

- Start: $500
- End: $485.9945714285705
- Return: -2.801085714285895%
- Trades: 88
- Wins / losses: 34 / 54
- Win rate: 38.63636363636363%
- Profit factor: 0.9183819244409616
- Expectancy: -0.012119505425096518R
- Total R: -1.0665164774084936R
- Max drawdown: 6.988629911939951%
- Longest losing streak: 5
- Average stop: 28.491071428571534 pips
- Average planned risk: 0.628198568179524%
- Max planned risk: 1.2257264595961377%
- Min-lot risk skips: 0

## Held-forward stress

- Start: $500
- End: $478.07457142857055
- Return: -4.385085714285894%
- Trades: 88
- Wins / losses: 34 / 54
- Win rate: 38.63636363636363%
- Profit factor: 0.8757464378238299
- Expectancy: -0.04304714833472992R
- Total R: -3.788149053456233R
- Max drawdown: 7.869022944905871%

## Chronological validation windows

1. 29 trades, -0.5155041350610259R, -0.06811428571443319%
2. 31 trades, -2.900844190791962R, -3.7427779378866406%
3. 28 trades, +2.349831848444495R, +1.0471356589283014%

## Decision

Not eligible.

Rejection reasons:
- WEAK_EXPECTANCY_OR_PF
- STRESS_FRAGILE
- INCONSISTENT_WINDOWS
- WINDOW_GAIN_CONCENTRATION

The positive GBPUSD contribution seen inside the three-pair SELL-only portfolio did not
survive a standalone GBPUSD replay. Removing the other pairs changed capacity,
cooldown/loss-guard sequencing, and which GBPUSD opportunities were admitted.

## Safety

Offline historical research only. Production and live-execution configuration were not modified.
