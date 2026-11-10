# XMI 2.0 — EURUSD user-supplied TradeLocker instrument specification capture

Recorded: 2026-11-09 UTC (review date; **actual market quote timestamp not displayed**). Research branch only: `research/xmi-amd-seven-pair-fxcm-replay-20261107`.
Evidence: user-supplied screenshots in ChatGPT conversation titled `Screenshot 2026-11-08 221451.png`, `Screenshot 2026-11-08 221442.png`, and `Screenshot 2026-11-08 221432.png`, plus an earlier instrument-watchlist screenshot. Images remain in user conversation; **no screenshots or account-identifying data uploaded to the public repository**. User identifies these as their GatesFX / TradeLocker account screens. This is user-provided, platform-displayed instrument evidence, not a signed broker statement or actual execution record.

## EURUSD platform-displayed contract values

| Field | Displayed observation | Verification boundary |
| --- | --- | --- |
| Symbol | EURUSD | User-provided instrument details view |
| Group | ForexMajors | Displayed |
| Lot size | 100,000.00 | Base currency units per 1 lot, standard interpretation |
| Minimum lot size | 0.01 | Displayed; **lot increment/step not shown** |
| Margin requirement | 0.20% | Displayed, corresponds to 1:500 notional leverage |
| Leverage | 500 | Displayed for EURUSD instrument |
| Opening fee per lot | $0.00 | Displayed; other fees not shown |
| Swap buy per lot | $0.00* | Displayed, asterisk explanation not supplied; **historical swap not verified** |
| Swap sell per lot | $0.00* | Displayed, asterisk explanation not supplied; **historical swap not verified** |
| Bid/ask, later screenshot | 1.11536 / 1.11555 | 19 points = 1.9 pips (5 decimal quote) |
| Spread, other EURUSD spec capture | 18 points | Different live instant; **not a fixed spread** |
| Trading-hours timezone label | UTC+2 | Broker platform display; DST seasonal behavior **not yet proven** |
| Trading hours | Sun/Sat closed; Mon 00:01–23:59; Tue–Fri 00:00–23:59 | Platform display; holidays/closures not covered |

### Reproducible illustrative math (NOT executed broker trades)
At later captured ask 1.11555, one minimum 0.01 EURUSD lot controls 1,000 EUR ≈ USD 1,115.55 notional; 0.20% initial margin estimate ≈ USD **2.2311**, assuming USD account, no extra margin tier or rate adjustment.
USD pip value at 0.01 lot is USD **0.10/pip**; displayed 1.9-pip bid/ask spread implies **USD 0.19** to cross immediately on this minimum lot, before slippage, price movement, any additional fees or spread changes. For a 1-lot position the corresponding instantaneous spread is USD 19, not USD 190. Calculations are snapshots, not historical backtest costs.

## All-seven live watchlist snapshot: user-provided, not historical

| Symbol | Displayed spread in points | Displayed leverage |
|---|---:|---:|
| EURUSD | 18 | 500 |
| GBPUSD | 18 | 500 |
| USDJPY | 18 | 500 |
| USDCHF | 16 | 500 |
| AUDUSD | 17 | 500 |
| USDCAD | 24 | 500 |
| NZDUSD | 18 | 500 |

XAUUSD was also shown, but is outside the seven-major research scope: 28 points, leverage 200. Spread quotes reflect the pictured moments only; they are **not** historical distributions, verified fills or a replacement for source-period FXCM bid/ask prices. No price or broker fill was fabricated.

## Gate 6B disposition: PARTIALLY SATISFIED FOR EURUSD DETAILS; OVERALL BLOCKED

EURUSD contract size, minimum lot, displayed margin/leverage and displayed opening fee/swap were collected from a user-supplied platform view. Outstanding for EURUSD: **lot step**, account-specific margin closeout/hedging treatment, interpretation of swap asterisk, actual historical STP spreads by session, slippage/execution samples, close fees and timestamped change history. For GBPUSD USDJPY USDCHF AUDUSD USDCAD NZDUSD: complete corresponding individual contract views, min/step lot, margin and cost details remain missing; observed watchlist leverage does not establish all contract terms. Full definitive profitability ranking remains **UNRANKED / PROVISIONAL**.

No backtests or historical scans were run in this entry; no claims about performance. The 2025 sealed holdout was not accessed; no production changes or trades.
