# XMI production read-only candle feed access

## Purpose
The original `/api/xmi/live` was intentionally limited to the Vercel-auth-protected preview branch. The production site is publicly accessible, so a client-side device-local saved-settings password does **not** authenticate broker data requests. This release adds a **separate, server-verified feed passphrase** with short-lived HttpOnly cookie to authorize access to read-only TradeLocker OHLC history.

## Scope / defense in depth
- Only enables the existing `getLiveSnapshot` path for verified, enumerated FX pairs and seven resolutions; that adapter only invokes TradeLocker instrument lookup and `/trade/history`. No order, positions, P&L, broker account management or cross-project bridge is authorized. `XMI_CROSS_PROJECT_BRIDGE_APPROVED=false` remains unchanged.
- Production requires all of `VERCEL_ENV=production`, `XMI_READONLY_MARKET_DATA_ENABLED=true`, a 64-character SHA256 `XMI_FEED_PASSWORD_SHA256`, and a dedicated random `XMI_FEED_SESSION_SECRET` (at least 48 characters). If any are missing, it returns 503 without accessing TradeLocker. The former preview-only rule remains unchanged.
- Login at `POST /api/xmi/feed-session` validates the entered 16–128-character passphrase against the dedicated encrypted server-side digest using timing-safe comparison. No passphrase is persisted in client storage. It issues a signed, random-nonce, eight-hour, HttpOnly, Secure, SameSite=Strict cookie scoped to `/api/xmi`. Logout clears it. All responses are `no-store` and endpoints are same-origin-only. Unauthorized live data requests get 401, without requesting broker candles. The feed session is **not** an order-trading authorization.
- `/xmi` shows **Unlock read-only feed** separately from the device-local saved-settings account; after successful unlock the chart retries data immediately. Production can stay unlocked across ordinary browser reloads for eight hours. The local settings login remains purely browser-local.
- Login attempts have an in-process best-effort throttle; serverless instances do not provide durable global rate limiting. Configure Vercel Firewall/WAF rate limiting on the login route before scaling to multiple external users and rotate the passphrase after sharing.
- Store only encrypted server-side environment variables. Never commit passwords, signing keys, broker tokens or encrypted cookie contents into Git. Test fixtures use unrelated dummy credentials.

## Deployment procedure
1. Set encrypted Vercel **production-only** variables `XMI_FEED_PASSWORD_SHA256`, `XMI_FEED_SESSION_SECRET`, and `XMI_READONLY_MARKET_DATA_ENABLED=true`. The password is NOT the same as the device-local saved-settings account.
2. Run `node --test tests/xmi-production-feed-auth.test.mjs tests/xmi-production-recovery.test.mjs`, the full `tests/xmi-*.test.mjs` suite, and Chromium chart smoke. Review Vercel preview build before merging.
3. Deploy to the existing `tradelocker-gpt-gateway` project `main` only after checks are green. Verify anonymous `/api/xmi/live` returns `401 FEED_LOCKED`; an authenticated session should return real, validated TradeLocker candles (or a sanitized source-unavailable error if the broker is unreachable). Verify the existing order/kill-switch settings are unchanged.
4. Do not expose the feed passphrase in source code, logs, tickets or regular URLs. Because this is a shared read-only access passphrase rather than an individual account system, rotate it when compromised or when audience access changes. Changing the session signing secret revokes old sessions.

## Known limitations
- The browser-local research settings account is NOT a server identity. Read-only feed access needs its own access passphrase.
- This route doesn't create an individual brokerage entitlement system or enforce per-user licensed-data redistribution terms; the account holder must confirm rights for any other viewers.
- Existing production broker credentials can source read-only price history but upstream provider outages, licensing or missing instrument routes may still prevent data. Never generate fictional candles as a fallback.
