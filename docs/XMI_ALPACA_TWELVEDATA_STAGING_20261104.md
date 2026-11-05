# XMI 2.0 — Alpaca + Twelve Data staging adapter (November 4, 2026)

## Scope

This branch adds **read-only** market data routing. When `XMI_DATA_PROVIDER_MODE=alpaca-twelvedata`, XMI requests:

| Asset | Provider | Endpoint |
| --- | --- | --- |
| Forex (EUR/USD, GBP/USD, etc.) | Twelve Data | `GET https://api.twelvedata.com/time_series` (UTC) |
| Stocks / ETFs (NASDAQ:AAPL, AMEX:SPY) | Alpaca | `GET https://data.alpaca.markets/v2/stocks/{symbol}/bars` |
| Crypto (CRYPTO:BTCUSD, CRYPTO:ETHUSD) | Alpaca | `GET https://data.alpaca.markets/v1beta3/crypto/us/bars` |

No trading, account-balance, transfer, order, or broker execution endpoints are called. TradeLocker remains the legacy production feed **only while** `XMI_DATA_PROVIDER_MODE` is unset: the intended production cutover must be separately approved and verified after a real staging session. There is **no fallback to TradeLocker** when the new mode is selected and one of its providers is down.

## Branch-protected staging configuration

In the existing **tradelocker-gpt-gateway** Vercel project, add these variables as protected **Preview** secrets **restricted to branch** `feature/xmi-alpaca-twelvedata-staging-20261104` when supported:

```text
XMI_DATA_PROVIDER_MODE=alpaca-twelvedata
XMI_STAGING_FEED_ENABLED=true
XMI_READONLY_MARKET_DATA_ENABLED=true
ALPACA_API_KEY_ID=<store in Vercel UI>
ALPACA_API_SECRET_KEY=<store in Vercel UI>
TWELVEDATA_API_KEY=<store in Vercel UI>
XMI_STAGING_NO_PASSPHRASE=true
```

**Do not commit any API keys, passwords, plaintext secrets, or deployment credentials.** Staging's additional no-passphrase switch is restricted to this exact branch and still relies on Vercel Preview Deployment Protection; no XMI passphrase or browser cookie is required. The existing signed XMI feed-session cookie remains enforced in production. The provider mode remains off when any required authorization variable is absent. These credentials are **not** currently configured on Vercel; real staging provider requests are therefore not yet validated.

For stocks, the default Alpaca data feed is **IEX**, not consolidated SIP. Set `ALPACA_STOCK_FEED=sip` (only where plan-entitled) to request SIP. Twelve Data spot-FX bars have **no verified traded volume**, so the VWAP and volume-dependent studies remain unavailable on FX rather than generating synthetic volume. **Twelve Data conserves credits by checking no more than one snapshot per five-minute-or-longer candle bucket per symbol/timeframe per server instance**; even the 1m Forex chart defaults to a five-minute refresh, so it is not suitable for low-latency 1m scalping. This local cache does not enforce an account-wide budget across Vercel instances, symbols, or timeframes; monitor the actual Twelve Data account's credits before considering sustained coverage. Alpaca crypto may include midpoint-derived OHLC values even if trade volume is zero. Vendor data can be delayed or quota-limited.

Alpaca daily equity bars are session-date anchored to New York midnight (04:00 or 05:00 UTC seasonally). The adapter maps only the date to a UTC calendar-day bucket to satisfy the chart's daily alignment; this is **not a synthetic price or a guaranteed market close time**. Intraday bars retain their vendor timestamps, and unaligned or malformed observations fail closed.

## Verification gates

1. Run all `tests/xmi-*.test.mjs` and Chromium chart/UX smoke workflows on the PR head. The new `tests/xmi-multi-provider.test.mjs` injects deterministic vendor responses (no credentials) and checks routing, timestamps, error categorization, confidentiality, bounded history, cache singleflight, and signed staging access.
2. Confirm Vercel's **Preview** deploy is READY for the same SHA.
3. Add the Preview keys above directly in Vercel. Open the Vercel-protected staging URL (the XMI feed loads automatically with no passphrase), and verify live EURUSD 5m + 15m, AAPL 5m + 1D, BTC/USD 1m + 5m, 403/429 provider handling, market-closure behavior, and sustained polling.
4. Compare vendor charts and readiness with independently obtained source bars; observe Twelve Data credit consumption. Verify chart interactions, market-structure markers and FX scalp read-only signals.
5. **Only after** real staging validation, explicitly set production `XMI_DATA_PROVIDER_MODE=alpaca-twelvedata` with production-scoped Alpaca and Twelve Data credentials. Keep the same signed XMI read-only session gate and broker-order disablement; do not remove old TradeLocker credentials because other routes in the same project still use them.

## Official references

- Alpaca stock bars: https://docs.alpaca.markets/us/reference/stockbarsingle-1
- Alpaca crypto bars: https://docs.alpaca.markets/us/reference/cryptobars-1
- Alpaca IEX vs SIP: https://docs.alpaca.markets/us/docs/market-data-faq
- Twelve Data timezone handling: https://support.twelvedata.com/en/articles/5745849-timezones
- Twelve Data quota and credits: https://support.twelvedata.com/en/articles/5615854-credits
