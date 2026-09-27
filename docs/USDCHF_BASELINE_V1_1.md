# USDCHF Strategy V1.1 Locked Baseline

Locked on 2026-09-26 after the 2024-01-01 through 2026-09-25 robustness run.

## Configuration

- Instrument: USDCHF only
- Starting capital: $150
- Risk ceiling: 1%
- Maximum size: 0.01 lot
- Entry timeframe: M15
- Regime timeframe: completed H1
- Target: 1.8R
- Spread assumption: 2.0 pips
- Slippage assumption: 0.2 pips
- Maximum 2 trades per day
- 2% daily realized-loss stop
- 5% weekly realized-loss pause
- stop after 2 consecutive losses
- 4-bar post-trade cooldown
- 4-bar volatility-shock cooldown

## Locked robustness result before historical macro blackouts

- Bars: 69,202
- Trades: 36
- Win rate: 50.00%
- Profit factor: 1.22
- Expectancy: +0.14R
- Total: +5.05R
- Return: +4.98%
- Maximum drawdown: 4.77%
- Ending balance: $157.47
- Minimum-lot skips: 77
- Longs: 17 trades, 52.94% win rate, +3.74R
- Shorts: 19 trades, 47.37% win rate, +1.31R
- Median stop: 9.48 pips
- Average stop: 9.58 pips

This result is the reference baseline. Historical macro-event filtering must be
measured against it without modifying the strategy rules.

## Risk-ceiling research conclusion

The 1.5% and 2% research scenarios are not approved as live/default settings.

The live/default risk ceiling remains 1%.
