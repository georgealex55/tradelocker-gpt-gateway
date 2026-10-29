# XMI production chart and local account recovery

## Why the chart can be empty in production
`/api/xmi/live` intentionally returns `503 FEED_DISABLED` outside the previously protected preview branch. This is a security restriction, not a broken charting library. The production UI does not automatically connect to private TradeLocker accounts.

## New Live Chart controls
- **↻ Refresh chart** retries the current permitted source immediately. When a data source is disabled, no repeating requests are sent until a user refreshes it.
- **Import OHLC JSON** plots your actual historical candles in the Live Chart, locally in the browser. Valid JSON is either a candle array or `{ "symbol": "EURUSD", "resolution": "5m", "bars": [...] }`. Each candle has numeric `time` (Unix seconds aligned to 5-minute boundaries in this example), `open`, `high`, `low`, `close` and optional non-negative `volume`. Supply 2–400 candles, at most 900 KB. Files must match the selected symbol and timeframe.
- **Clear import** removes the temporary candle series and returns to the restricted remote source. Local imports are in memory only and do not become server uploads.
- **Historical Chart Studio** remains available directly at `/xmi2/chart-studio.html`.

The strategy matrix can analyze confirmed imported closed candles only in clearly marked **HISTORICAL** mode. It never labels those historical signals as real-time conditions or places broker orders.

## Local sign-in
Your local XMI login is stored per browser profile **and per website hostname**. A device account created at a Vercel preview URL is not automatically present at `tradelocker-gpt-gateway.vercel.app`. On production, choose **Local login / Settings → Create account**; the old preview password does not authorize production storage. Settings remain encrypted locally and cannot be recovered if the password or browser data is lost. Logging out clears the XMI working cache on that browser.

## Security boundaries
No production broker read enablement, trade execution routes, account keys, order confirmation, database schema, or application environment variables were changed. The separate `XMI_CROSS_PROJECT_BRIDGE_APPROVED=false` safeguard remains. Production chart history is explicitly imported rather than represented as live price data.

## Regression coverage
`tests/xmi-production-recovery.test.mjs` validates source schema and historical-only evaluation. `tests/xmi-browser-smoke.mjs` exercises a deliberate production `503 FEED_DISABLED` response, manual refresh, import, clear import, and local sign-in after browser reload. Browser logs must contain no unexpected errors; deliberate disabled-source 503 diagnostics are accounted for separately.
