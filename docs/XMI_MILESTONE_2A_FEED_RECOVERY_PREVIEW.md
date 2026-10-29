# XMI 2.0 Milestone 2A — Feed reliability audit (preview)

## Baseline and boundaries
Built on Milestone 1A production baseline `f52089d4fe476f334b3dbed34cf71f70a8a9cf12`.
Release scope: existing authenticated TradeLocker Forex candle `GET /api/xmi/live` and client-only chart polling.
**No change to broker secrets, execution, account access, feature flags, equity feeds, market-data licensing, journal data, strategy rules, or database schema.**
Do not merge or deploy production until explicitly approved.

## Implemented
- Poll by timeframe with post-close checks when the next bar boundary is near; this is a browser-time estimate, not proof of broker publication.
- Normal refresh intervals: 1m 15s, 5m 25s, 15m 35s, 30m 45s, 1H 60s, 4H 120s, 1D 180s. A close-boundary check can occur as soon as four seconds after a scheduled request.
- Hidden tabs slow requests to at least two minutes. Visible tabs resume promptly.
- Provider failures retry with exponential delay up to five minutes; local in-flight guard avoids duplicate overlapping fetches. Browser candle requests have a 15-second timeout.
- `FEED_DISABLED`, `FEED_LOCKED`, and `ORIGIN_DENIED` are terminal for automatic retry, requiring a deliberate permission or manual-refresh change.
- Last verified plotted candles may remain in view during an outage or manual refresh, but are visibly labeled **not current**. The research engine receives `stats:null` and `quality:UNAVAILABLE`; stale candles never stand in as a valid strategy signal.
- Visible diagnostics: attempted check time, previous closed candle timestamp, retry attempt count and approximate next check. Historical file import continues to be labeled offline.
- Invalid source timestamps are rejected before chart replotting.

## Acceptance criteria
1. Node feed tests cover close-boundary pacing, hidden-tab behavior, capped backoff, invalid timeframes, retryable/non-retryable codes, and stale health classification.
2. Existing broker read-only, local account, strategy, and historical import regressions remain green.
3. Chromium verifies a 503 provider outage produces a visible `SOURCE UNAVAILABLE` banner, retry diagnostics, and a previously verified bar timestamp; manual refresh recovers the previous mock feed without producing synthetic production data.
4. Production and main remain at Milestone 1A release; this work is limited to a draft PR and Vercel preview.

## Known gaps / deferred
- Stock/ETF provider connection remains unconfigured; research cannot honestly claim equity live candles.
- Independent provider availability, actual TradeLocker chart freshness and licensed data entitlements require live owner-side checks. CI uses synthetic candle fixtures **only in tests**.
- No system-wide distributed cache or API call budget yet; multiple charts may still request the same pair independently.
- No server-side market-data source failover. Introducing a new provider requires explicit approval and separate licensing/credential analysis.
- No alerts or trade execution. Any future strategy alert must first pass versioned historical validation.
