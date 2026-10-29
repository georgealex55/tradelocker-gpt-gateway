# XMI 2.0 — Milestone 2C: read-only data integrity and indicator readiness

**Status:** preview-only development branch, stacked on draft PR #18 and PR #17.
**Release boundary:** no production merge, promotion or operational changes. No broker execution, alerts, order placement, new market-data source, secrets or database changes.

## Purpose
The chart already calculates EMA20/50/200, RSI14, MACD, tick-volume proxy VWAP and volume. Milestone 2C adds a verification layer so a displayed candle is not automatically treated as valid current research data.

## Implemented
- The xmiDataQuality inspector verifies source-check time, last CLOSED candle time, resolution and source-quality class separately from the plotted OHLC series.
- CURRENT alone is insufficient: missing/invalid timestamps, future-dated checks, stale source checks and stale last-closed candles block strategy scoring.
- Indicator availability is inspected at the most recent confirmed closed bar, not a possibly-forming bar. EMA200, RSI, MACD and VWAP readiness appear in the chart footer.
- Gaps among the last 31 closed bars are reported with missing-period estimates and never filled. FX sessions and weekends can produce legitimate gaps, so gaps alone do not force a block.
- Strategy Lab observes the dataHealth.researchReady gate, preserving unscored hard-confirm rules and historical-only imports.
- Existing chart rendering, stale overlays, watchlists and read-only broker authentication remain unchanged.

## Acceptance checklist
1. Node indicator/source tests plus all existing xmi-*.test.mjs pass.
2. Chromium verifies readiness diagnostics, outage/recovery and existing workspaces.
3. The exact final commit SHA has a successful CI run and inspected preview build.
4. PR remains draft on the 2B development branch, with production/main unchanged.

## Not included
- Live stock/ETF provider or credentials, second feed, exchange licensing, trade execution or automatic alerts.
- New indicator formulas, backtesting or claims of profitable strategy performance.
- Guarantees of uninterrupted price history across genuine exchange holidays and market closures.

## Next
- 2D: deterministic indicator fixtures, historical no-lookahead replay, and session-aware calendar checking.
- 2E: versioned research presets with reproducible offline scoring, with execution still disabled.