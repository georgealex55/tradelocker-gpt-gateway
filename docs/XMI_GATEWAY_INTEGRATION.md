# XMI 2.0 gateway integration plan (preview only)

## Verified target

- Existing Vercel project `tradelocker-gpt-gateway` (`prj_JorE7MjPw1FjLvQmOUFGZ4kCowUp`).
- Connected GitHub: `georgealex55/tradelocker-gpt-gateway`, a PUBLIC repository using Next.js 15.
- Existing gateway home, TradeLocker execution/risk controls, scheduled research jobs, and Forex Strategy V1 remain unchanged.
- The XMI source repository `georgealex55/XMI-terminal` is PRIVATE, with an independent Draft PR #2. No XMI private code, user trades, tokens, or database connections are copied into this public repository.

## This safe first milestone

- New Next.js route `/xmi` provides 1/2/4 TradingView-hosted Advanced Chart widgets with stock/ETF venue validation and timeframe selection.
- Widgets are external TradingView hosted components. Their data comes from TradingView, **not Alpaca IEX**. Widget candle/crosshair state is not available to the XMI coaching engine. This work is not a substitution for XMI's programmable chart selection, custom indicators, or historical evidence analysis.
- No broker orders or TradeLocker execution routes are called by the workstation. TradingView's Trading Platform/Advanced Charts licensed source is **not** included.
- Feature work is contained in `feature/xmi-tradingview-workstation-preview`. No production branch changes or automatic order actions should be enabled.

## Recommended two-repository architecture

1. Keep the public TradeLocker gateway as the deployable Next.js shell hosting the read-only TradingView chart experience.
2. Keep the private XMI repo and Neon preview branch as the market-news interpretation and personal coach source until a verified private integration boundary and explicit approval.
3. Connect source-verified XMI research using a purpose-built, read-only API with a dedicated database role; never reuse TradeLocker's execution database credentials or broker approval headers.
4. Store personal coaching memory in a separately authenticated, row-level-secured datastore, not in widget configurations, browser-readable service secrets, or public GitHub code.
5. Treat direct repository merging as a separate, explicit decision after reviewing whether the combined repository must be PRIVATE. Do not merge branches or move private code in this stage.

## Phase 2: actual public-feed + local journal connection

- `/api/xmi/context` is a **same-origin, server-side GET-only adapter** to fixed public `https://xmi-terminal.vercel.app/api/xmi`; no arbitrary upstream URL, XMI database credential, TradeLocker key, or personal journal data is sent.
- The source is the existing PUBLIC XMI terminal snapshot, returning at most 80 latest news items. It is NOT the complete historical XMI archive. Date and ticker filtering require `Published / Event Time` and XMI `Timestamp` (first observed) to precede the range end; macro headlines are labeled broader-market and not presented as direct ticker catalysts.
- The `/xmi` news panel requires a manual start/end time because hosted TradingView widgets do not expose chart-region selections. It shows both timestamps and the archive coverage limitation. XMI upstream errors return 503 and no invented headlines.
- The `/xmi` coach now supports in-memory import of one-trade-per-row CSV files (2 MB / 5,000 rows), manual entries with notes, rule annotations, local descriptive flags, and user-initiated JSON export. Raw BUY/SELL broker fills are rejected. No journal data is transmitted or persisted by default.
- **Authenticated cloud memory is not connected or activated.** The XMI private PR has a Neon preview branch with RLS, but the identity provider and limited database login are not configured and the XMI private service is not deployed. Do NOT route personal trade records through the TradeLocker database or public XMI feed.
- Existing TradeLocker routes, crons, and order-execution guards remain unchanged. No repository merge or production deployment is authorized.

## Verified release gates still open

- A Vercel preview BUILD alone does not prove external news fetches or TradingView UI worked in a real browser. Perform browser-level and network QA.
- Establish a private OIDC identity provider and an isolated least-privilege private journal API. Confirm two-user isolation before any account sync.
- For full historical coverage, deploy and test a dedicated read-only XMI archive endpoint with bounded, timestamp-qualified queries; the current recent-feed adapter must not be treated as a backfill.
- For TradingView chart-region annotations and coach handoff, use an appropriately licensed programmable chart API or the private XMI Lightweight Charts implementation, not widget internals.
## QA gates before production

- Confirm TradingView widget actually loads on a Vercel preview, on desktop and mobile.
- Confirm symbol/timeframe/layout controls work and chart provider coverage is appropriate.
- Verify no gateway execution request is made when using any XMI control, including browser network testing.
- Confirm no existing TradeLocker signal, backtest, cron, risk or kill-switch regression.
- Confirm XMI-only news and personal trades cannot reach public endpoints or public source.
- Obtain explicit user approval for any merge, domain assignment, or production deployment.

## Phase 3: gated cloud memory integration (code staged; NOT activated)

- Dedicated Next.js preview-only routes: GET /api/xmi/auth/config, POST /api/xmi/auth/exchange, and GET/POST/DELETE /api/xmi/journal.
- OIDC Authorization Code + PKCE uses a registered, HTTPS /xmi redirect. JWT ID tokens are verified against issuer, client audience, RS256 remote JWKS, expiry, issued-at freshness, and an exact nonce during exchange; the browser keeps the token **in memory only**.
- Cloud journal reads/writes require a VERIFIED token-derived owner key. PostgreSQL transactions SET LOCAL ROLE xmi_coach_app, verify the preview branch environment guard, then SET LOCAL xmi.coach_owner_sub before any row read/write. RLS enforces owner match on each of four private tables.
- The runtime **must be a separate SQL-created, LOGIN/NOINHERIT, non-BYPASSRLS member of xmi_coach_app**, NOT a Neon API-created role, neondb_owner, TradeLocker DATABASE_URL, or the XMI public database owner.
- Explicit upload (100 trades/batch), load (paginated), and double-confirm cloud delete are available in the UI only when configured. There is NO background sync. Each import/manual trade has its own source provenance. Signing in redirects and would erase in-memory journal entries: the UI blocks sign-in while local entries are present. Export the private JSON, clear the tab, sign in, then use the validated Restore private JSON control before manually uploading.
- Account credentials, identity-provider tokens, and connection secrets must NEVER go into this PUBLIC repository, public UI props, XMI analytics feed, or broker execution routes.

### Required Vercel Preview-only environment settings (currently MISSING)

Configure only after selecting and registering the identity provider and creating a dedicated SQL login. **Do not use production-scoped variables for this integration.**

```
XMI_COACH_ENABLE_CLOUD=true
XMI_COACH_ENVIRONMENT=preview
XMI_COACH_EXPECTED_BRANCH_ID=br-square-wave-awkq5zyt
XMI_COACH_DATABASE_URL=<secret Neon PREVIEW connection string for a restricted SQL-created login; sslmode=require>
XMI_COACH_PUBLIC_ORIGIN=https://<exact-preview-alias>/
XMI_IDP_ISSUER=https://<trusted-provider-issuer>/
XMI_IDP_AUTHORIZE_URL=https://<trusted-provider-host>/authorize
XMI_IDP_TOKEN_URL=https://<trusted-provider-host>/oauth/token
XMI_IDP_JWKS_URL=https://<trusted-provider-host>/.well-known/jwks.json
XMI_IDP_CLIENT_ID=<provider-registered-public-client>
XMI_IDP_AUDIENCE=<the same client ID>
```

The issuer/authorize/token/JWKS endpoints must share the issuer origin; the external provider must register the exact `https://<preview-alias>/xmi` callback URL and support Authorization Code + S256 PKCE and RS256 ID tokens. Use only a verified, stable preview alias; preview deployment URLs change with commits.

NEVER enable the flag before all prerequisites and owner-isolation QA pass. The gateway Vercel environment audit on October 28, 2026 found no XMI_IDP_* or XMI_COACH_* configuration; the feature must therefore return `configured:false` / HTTP 503 for private APIs.

### Mandatory live QA before any user records

1. Verify OIDC callback state/nonce, expiry, reject invalid issuer/audience/signature, and token continuity.
2. Verify a separately provisioned restricted Neon login cannot use a privileged role, and a mismatched branch ID aborts the transaction.
3. With two independent test accounts, confirm no cross-account listing, upload, deletion, or cursor leakage. Confirm sign-out clears in-memory credentials.
4. Confirm no server logs, browser storage, public Github files, frontend bundle, or public XMI endpoint exposes secrets or journal rows.
5. Test full workflow in the gateway Vercel preview with TradingView, XMI news, stock/ETF imports, and untouched TradeLocker execution protections.
6. Keep gateway PR #12 and XMI PR #2 in DRAFT. Obtain explicit owner approval for production merge, domain promotion or database migration.


## UX refinement — chart-first preview (October 28, 2026)

- One large TradingView chart is the default; choose one, two or four charts on demand. Multi-chart controls include a clear **Use for research** focus action. The XMI news/journal ticker follows that selected chart rather than an arbitrary last-changed widget.
- Search accepts a plain symbol (for example, `AAPL`) with an explicit venue dropdown; also accepts a qualified TradingView symbol. Quick picks SPY, QQQ, AAPL and NVDA require one click. Linking all chart symbols remains opt-in.
- News and Trade journal use distinct, accessible tab panels. Both components stay mounted when hidden, so switching tabs does not discard journal entries or active in-memory account tokens.
- The evidence panel has one-click 24-hour / 7-day / 30-day presets, date validation, a compact coverage status and timestamped links. Changing ticker or dates invalidates old results, preventing misleading stale headlines.
- The coach is split into **New trade / Import history / Private account** modes. Optional rule annotations are collapsed. Behavior sample size and local-only storage are explicit. Browser beforeunload warns if leaving with locally held records.
- A signed-in OIDC callback returns to the Trade journal / Private account section. Authentication still requires separate preview-only provider configuration; no automatic uploads or deployments were enabled.
- The interface is responsive down to narrow phones; one chart defaults to a taller panel. No TradeLocker execution route or cron was edited.

Browser-based TradingView iframe rendering and end-to-end API calls still require manual preview QA; Next.js build success alone is not a complete UX signoff.

## Phase 4 — Forex-first programmable candle engine (preview only)

- The /xmi page has four tabs: Live Chart, News & Research, Strategy Lab and Admin.
- The Live Chart hosts a ten-instrument local watchlist (forex pairs plus qualified equities/ETFs), a 1/2/4 chart grid and strategy intelligence rail. Only visible charts poll; ten-symbol unattended monitoring is a later service milestone.
- TradingView Lightweight Charts v5.2.1 replaces the hosted widget on the main tab. Indicator families: EMA 20/50/200, VWAP, RSI, MACD and Volume, each selectable in the chart.
- Forex data is retrieved through TradeLocker FOREX instrument metadata and the INFO historical-bar route. The new API cannot place, alter or close broker orders.
- Polling is every 20 seconds when the chart is visible. This is read-only broker OHLC refresh, NOT a verified streaming tick feed. No synthetic candles or invented indicators are generated.
- Broker tick volume is explicitly labeled. Forex VWAP is a UTC-reset tick-volume-weighted **proxy**, not consolidated exchange volume. Missing volume is not treated as real data.
- **NO ACTIVE STRATEGY** is shown intentionally. Candle-close strategy confirmation, user-defined entry/SL/TP and actual-trade overlays are future milestones requiring explicit strategy activation and safe account access.
- Equity chart rows show live feed pending until a separately approved Alpaca market-data source is connected. Forex news is not mislabeled as the current equity-only XMI historical feed.

### Preview-only market data activation gate

The new GET /api/xmi/live route fails closed unless VERCEL_ENV is preview, VERCEL_GIT_COMMIT_REF matches feature/xmi-tradingview-workstation-preview, and XMI_READONLY_MARKET_DATA_ENABLED is true.

The activation flag is NOT set by this PR. The flag must not be enabled without a separately access-protected preview and verified market-data redistribution/display permissions. On a public or unconfigured preview the endpoint responds FEED_DISABLED (HTTP 503), and the UI shows NOT LIVE instead of simulated prices.

### Required QA before turning on a feed or releasing

1. Check TradeLocker INFO metadata, timestamp alignment and candle update cadence against actual broker data.
2. Confirm preview authentication/protection and provider redistribution terms before enabling the preview-only read data API.
3. Test changing symbols, timeframes and chart counts; ensure stale/disconnected states are visible.
4. Confirm five indicator families, FX volume caveat, and the lack of premature candle-close signals.
5. Check mobile and desktop rendering, CPU, quotas and source response latency.
6. Confirm no order routes, credentials, main Neon production or published source leak.
7. Keep both PRs Draft and unmerged and obtain explicit approval before a production release.

## Phase 5 — SMC overlays and compact watchlist

- The watchlist shows five visible instruments and scrolls internally up to ten instruments; it can collapse/expand without losing the focused chart.
- Market Structure is separately collapsible. All eleven user-selected concepts are checked by default: BOS, CHoCH, FVG, Order Blocks, Liquidity Sweeps, HH / HL / LH / LL, Support / Resistance, MSS, Premium / Discount, Displacement, Session High / Low.
- Independent per-concept timeframes are 1m, 5m, 15m, 30m, 1H, 4H, 1D; settings are shared between charts within the current browser tab, and never activate strategy rules.
- Pure SMC calculations use verified broker OHLC from CLOSED candles. Swing pivots require two closed bars to confirm. BOS/CHoCH need a close beyond an already confirmed level; MSS requires opposing break and displacement.
- FVG uses a three-candle imbalance, Order Blocks a heuristic opposing candle before displacement, sweeps require wick break plus return close, and sessions are fixed UTC reference ranges (not daylight-saving-adjusted live exchange session times). These are transparent algorithmic annotations, not institutional tape claims.
- TradingView Lightweight Charts v5 series markers and a custom drawing primitive display minimal labels, swing-level lines and translucent gap/block/range zones. Maximum five recent annotations per concept from available history.
- Additional unique timeframes are retrieved using only the preview-gated read-only TradeLocker history endpoint, and refreshed at 65-second intervals. The main chart refreshes at 20 seconds. No new execution endpoints or credentials in the browser.
- Higher-timeframe markers are projected only when both the source confirmation candle and display candle are complete. The original confirmation timestamp is shown in the intelligence panel.
- Daily and 4-hour reference-session detection is explicitly unavailable (requires 1H or faster). Missing broker data clears previous annotations and never creates a signal.
- No actual trades, TP/SL proposals, strategy activation or background monitoring is claimed as part of this phase.
- QA requires authenticated browser interaction for scrolling, collapse behavior, independent settings, scaling, mobile grid, and brokerage data freshness. Keep both PRs Draft, production unchanged and all broker execution disabled.

## Phase 5 recovery — visible candles and limited forex fundamentals

- User preview feedback: broker candles reached the browser ('CANDLES RECEIVING') while the price canvas was not visibly drawing; the optional market-structure series primitive supplied zOrder as a string instead of the required v5 method. The primitive now has a correctly shaped zOrder() function and fail-isolated drawing.
- On initial load the candle chart presents the most recent approximately 70 real candles rather than fitting up to 320 into the canvas width. The footer shows the last broker-reported OHLC and loaded candle count, separately from any canvas/rendering issues.
- The market-structure sidebar now includes an explicit 'Show all 11' control, 'Hide all', and a warning when no concepts are enabled. The SMC detection engine and chart primitive have regression coverage.
- News & Research no longer hides every FX instrument behind a placeholder. FX:AAA BBB symbols use the existing bounded XMI public 80-entry news adapter, filtering exact pair, relevant currency and broader macro mentions while maintaining publish/observed timestamps and source links.
- Important: this is NOT a complete FX economic calendar, policy-decision feed, proof of headline price causation, or authenticated private XMI news archive. Missing or incomplete snapshot is disclosed as such.
- The intelligence rail now links directly to the selected FX instrument's News & Research tab. No orders, automated strategy confirmations or user-specific journal sync are introduced.
- Authenticated browser QA must confirm that actual painted candle bodies and optional market-structure annotations are visible on the preview; unit tests and Vercel READY alone do not prove canvas rendering.

## Phase 6 — unified chart studio (preview)

- Live Chart is now a chart-first workbench. Previous technical indicator checkbox strip and the separate Market Structure sidebar are removed in favor of one searchable Indicators tool palette with independent SMC timeframes and five original technical families.
- Tool menus: Indicators, Annotations (text, arrows, highlight rectangle, freehand), Patterns (Double Top/Bottom, H&S/Inverse, Triangles, Flags/Pennants, Wedges, Channels, Triple Top/Bottom), Fibonacci (Retracement, Extension, Trend-Based Extension), Lines (Trendline, Horizontal/Vertical Line, Ray, Parallel Channel), Measurements (Price/Pip, Date/Bar, Long/Short Risk Reward, Percent), and global Chart Settings.
- The toolbar supports vertical and horizontal positions; each menu can open as a docked pane or a floating pop-out and can remain pinned or be closed. Watchlist and intelligence may be collapsed or hidden independently; Focus Mode removes app chrome and sidebars. In-app Maximize and browser Fullscreen are separately available.
- Built-in chart presentations: Candlesticks, Hollow Candles, Heikin Ashi, OHLC Bars, Line and Area. Heikin Ashi values are derived and prominently labeled transformed/non-executable. The broker OHLC readout continues to use actual source values.
- Chart settings support global defaults and optional slot-specific overrides for chart type, theme/colors, grid/crosshair, time display zone, price scale/precision, wicks/borders, last-price line and timeframe sync. Verified bid/ask is not available in the current OHLC source and is never fabricated. Session structure calculation stays UTC regardless of display timezone.
- Drawings are anchored to timestamp and broker-price values and rendered as optional chart primitives. Manual tools accept on-chart points (freehand dragging); automatic Fibonacci levels use confirmed recent high/low pivots. Patterns are tentative algorithmic closed-pivot observations, with no order execution or guarantee of outcomes.
- Drawings persist in browser localStorage, shared across compatible timeframes by FX symbol, with bounded and schema-validated JSON import/export. Browser local storage is device- and origin-specific; it is not private cloud account memory. Per-chart overrides are persisted/exported as well.
- No XMI chart component imports or invokes TradeLocker order execution, positions or sizing operations. Broker read path, feature-branch gate and Vercel Authentication are unchanged.
- Validation requires XMI unit tests, both gateway strategy CI checks, Vercel preview READY, browser menu/drawing/rendering QA, and confirmation production SHA and both draft PRs remain unchanged. Do not merge without owner authorization.

## Architecture A — private XMI signed forex bridge

The canonical XMI application is in private `georgealex55/XMI-terminal` Draft PR #4. Its dedicated server-only research adapter may request read-only forex candles from this gateway's new `/api/xmi/bridge` route.

- The gateway route is **off by default**; preview deployment and expected feature branch, the existing read-only market-data flag, a new bridge enable switch and a strong per-project shared signing key are all required.
- Requests use a timestamp-bound HMAC signature, strict FX pair and timeframe validation, generic failure messages and private no-store responses. The gateway broker call remains an INFO/history read, not an order route.
- Source output excludes broker credentials, account identifiers, order route metadata, journal state and secrets.
- The separate server-side deployment-protection and source-entitlement review must precede enabling any private cross-project requests. A protected preview alone does not establish a user's broker data rights.
- **No environment flags, secrets, preview protection settings, trade execution, production deployment or PR merge are changed in this commit.**
