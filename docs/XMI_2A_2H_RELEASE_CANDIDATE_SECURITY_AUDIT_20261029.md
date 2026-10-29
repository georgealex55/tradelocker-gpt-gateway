# XMI 2.0 — Consolidated Release-Candidate Security Review (2026-10-29)

**RC branch:** `release/xmi-2a-2h-security-review-20261029`
**PR target:** GitHub `main`, as a **DRAFT only**; no production merge, promotion, or broker execution approval.
**Starting source:** verified 2H commit `c703ed5287381740a3b7b58abffd49f064407d8c`.
**Production baseline inspected:** `f52089d4fe476f334b3dbed34cf71f70a8a9cf12`.

## 1. Consolidation scope

The release-candidate branch contains the full stacked history from Milestone 2A–2H draft PRs:
- #17 2A: feed retry, source freshness, stale/disabled/locked signaling
- #18 2B: up to six local named research watchlists
- #19 2C: closed-bar/source integrity and indicator warmup checks
- #20 2D: deterministic offline replay without lookahead
- #21 2E: local immutable research settings and same-data comparisons
- #22 2F: SHA-256 offline report export and local verification
- #23 2G: descriptive research analytics and observed coverage
- #24 2H: user-declared data provenance and retrospective chronological partitions

A single PR targeting main makes all eight branches reviewable as one cumulative change. The eight draft milestone PRs are intentionally retained for traceability and have **not** been merged. This is a consolidation of code, not a production release.

## 2. Security review — static code evidence and tests

| Area | Observed safeguards | Audit disposition |
| --- | --- | --- |
| Read-only live FX feed | `/api/xmi/live` is GET-only; production needs environment enablement, correctly formatted SHA-256 passphrase digest, strong HMAC secret and signed HttpOnly/SameSite=Strict cookie. Same-origin checks run before the fixed broker read adapter; unsupported equities and timeframes fail closed. | **PASS — static source and mocked regression.** Real broker availability is not proven. |
| Broker execution isolation | XMI live adapter uses only the validated `/trade/history` read path and INFO route metadata. XMI cross-project bridge remains blocked by a source-level policy regardless of secrets. Consolidated PR does not modify gateway order execution endpoints. | **PASS — static source/diff review.** This is not a production network trace. |
| Historical imports and strategies | Local JSON bound to 2–400 candles/900 KB, matching selected symbol/timeframe; malformed or future candles fail input checks; only verified closed candles are scored; original XMI hard-confirm remains NOT_VALIDATED. | **PASS after hardening** duplicate raw import timestamps to reject silent normalization overwrites. |
| Private journal | Personal journal CSV/manual imports remain browser-memory-only until explicit export/sync. Cloud journals require bearer OIDC verification (issuer/audience/RS256), restricted dedicated Neon login, scoped transactions with RLS owner identity, and explicit upload/delete actions. | **PASS — inspected code and mocked tests**, with preview-only deployment-environment hardening. No live two-user isolation proof is claimed. |
| Authentication/environment separation | Research settings device password is not broker authorization. Independent feed cookie does not authorize journal or order routes. Cloud coach's database route was intended preview-only but previously relied on config labels, not Vercel runtime environment. | **Fixed:** both cloud auth and DB config now require `VERCEL_ENV=preview`, with production fail-closed regression tests. |
| Dataset reports/provenance | SHA-256 covers canonical closed OHLCV; report format bounded and checked; an embedded checksum is not a signature or proof of source authenticity; user-declared origin is explicitly unauthenticated. | **PASS — bounded descriptive research, not independent attestation.** |
| Private source exposure | Existing public gateway is unchanged; separate private XMI implementation and full journal/market archive are not copied into this RC. | **PASS by diff/source review.** |

## 3. Findings remediated in this RC

1. **Cloud environment boundary:** `configuredAuth` and `configuredDatabase` previously accepted matching `XMI_COACH_*` preview labels even if the deployment itself was production. Both now require the hosting runtime to report Vercel preview. This ensures accidental production environment copies remain disabled.
2. **Historical data-integrity ambiguity:** `normalizeBars` intentionally deduplicates broker responses, but historical imports could silently overwrite conflicting same-time OHLC candles. The local historical file parser now detects and rejects equivalent duplicate seconds/milliseconds timestamps *before* normalization. Added regression tests.

## 4. Residual limitations — not represented as passing live production checks

- Feed login uses per-instance best-effort throttling; no distributed WAF/firewall login-rate-limit check was performed. Shared feed passphrase should be treated as controlled access, not multi-tenant identity; do not claim protection from distributed brute-force attempts.
- Real broker read connectivity, feed entitlements/redistribution rights, and production environment variable **values** were not examined. No secrets were retrieved.
- Cloud journal two-user isolation has unit/transaction-scope coverage but not a new live identity + RLS end-to-end audit. Production cloud remains intentionally disabled.
- This RC is a *research-only* release candidate; equities have no licensed live feed and legacy XMI strategy validation is unavailable. Missing feed data is not replaced with synthetic candles.
- File hashing is an integrity tool, not authentication. Venue calendars, holiday gaps and backtesting validity remain unverified.

## 5. Verification and release boundaries

Run the full `node --test tests/xmi-*.test.mjs` suite, syntax checks and Chromium smoke on the **final RC head SHA**. Check Vercel preview branch and SHA; confirm production main and its deployment unchanged.

**User explicitly skipped checklist items 4–6:** manual device UX QA, general Admin copy/release-boundary polish, and production rollout/rollback/post-deploy plan. They are **not** claimed complete and are not silently undertaken.

The task also excludes the previously identified live broker connectivity probe (item 3), since the user selected only items 1 and 2.

**Disposition:** Consolidated for security review; do not merge to main or deploy to production without separate, explicit authorization and resolution/acceptance of residual risks.
