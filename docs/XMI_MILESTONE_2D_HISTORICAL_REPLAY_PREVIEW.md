# XMI 2.0 Milestone 2D — Historical Replay & No-Lookahead Controls

## Release boundary
Stacked after development PRs #17 (2A), #18 (2B), and #19 (2C). **Preview only**: no merges into main, no production promotion, no new credentials, no broker writes, no alerts or execution.

## Delivered
- Device-only JSON upload to Strategy Lab (2–400 real OHLC candles, <= 900 KB). No file bytes or replay statistics are uploaded, stored in a database, or written to localStorage.
- Deterministic replay for the selected research preset: at each candle close, calculate EMA20/50/200, RSI, MACD and VWAP on that candle's closed historical prefix only.
- Explicitly drop forming candles from user JSON as of import time; no replay of an unclosed bar as if its eventual close were known.
- Produce descriptive alignment counts and the last twelve historical observations. This is **not** a P&L backtest, execution simulator, forecasting service or strategy validation claim.
- Legacy XMI hard-confirm rules remain NOT_VALIDATED and unscored.
- An input-relative UTC weekend heuristic distinguishes some missing FX time slots from unknown gaps; does not claim knowledge of specific session open, DST transitions, trading holidays, or stock venue calendars.
- Validates malformed candles, duplicates, count limits, venue classes and selected symbol/timeframe match. The existing chart and workstation state remain intact.

## Test plan
1. All existing tests in the XMI GitHub Actions suite pass.
2. Deterministic fixture returns identical outputs on repeated runs; appending a future or extreme-priced candle cannot affect previous observations.
3. Forming candles are excluded on local import. Duplicate, malformed, oversized or mismatched input fails closed.
4. Gap calendar test differentiates UTC Saturday/Sunday intervals for FX and unknown equity schedule; no missing candles are fabricated.
5. Browser smoke test loads local JSON into Strategy Lab, replays offline and confirms non-execution disclosure.
6. Verify Vercel preview exact SHA and confirm main remains unchanged.

## Deferred
- Genuine market session calendars and holiday feeds; advanced session-aware continuity across DST.
- Execution costs, spread, slippage, fills, position sizing, drawdown, profitability or parameter optimization.
- Versioned strategy definitions, multi-dataset comparison and P&L modeling (future milestone; only after deterministic no-lookahead validation).