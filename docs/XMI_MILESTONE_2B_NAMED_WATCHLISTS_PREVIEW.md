# XMI 2.0 — Milestone 2B named watchlists (draft, preview only)

## Stack and release control
- Parent: Milestone 2A draft PR #17, commit `1d150450722b8042d7c25ff2d9e012ff7641f0b0`.
- This branch is stacked on the 2A branch rather than merged into `main`.
- Do not merge or deploy to production without explicit owner approval, new CI checks, code review and exact-SHA verification.
- Never submit orders, execute trades, enable alerts, bypass feed-session checks, or add source/provider credentials.

## Additions
- Up to six named, device-local watchlist collections; each contains one to ten qualified FX or stock/ETF symbols.
- Create a list using the currently focused symbol, rename, switch, and delete with explicit confirmation.
- Existing single-list data migrates into `Main` when `xmi-chart-ui-v1` is restored. New saved data retains the legacy `watchlist` field as the active list for compatibility.
- Existing encrypted device-local Save settings includes the expanded chart UI automatically. No remote account, journal, broker, database or production schema mutation.
- Validation rejects malformed identifiers, duplicate names (case-insensitive), duplicate symbols, unsupported venues, empty collections, and exceeded limits.
- Stocks/ETFs remain watchlist research placeholders; no feed is connected and no synthetic candles are generated.
- The five existing indicators, strategy presets, timestamp/source checks, and unscored strategy restrictions remain as-is.

## Verification
- Run: `node --test tests/xmi-named-watchlists.test.mjs`.
- Main preview workflow runs `node --test tests/xmi-*.test.mjs` and browser tests with mock OHLC data **only in isolated CI**.
- Chromium tests create two lists, add a qualified equity symbol, switch to the original symbols, reload, restore the second list, and delete it without losing Main.
- Confirm no browser runtime errors, no chart/indicator regressions, and no production deployment.
- Review Vercel preview readiness separately from CI; passing tests alone does not establish live provider access.

## Next slices (not implemented here)
1. 2C: provider-neutral data-quality report and stock/ETF adapter feasibility with explicit data-source approval, entitlements and credentials.
2. 2D: deterministic indicator fixtures, timestamp/session correctness, and no-lookahead historical validation.
3. 2E: versioned Strategy Lab definitions and cost-aware offline replay; no automation or execution.
