# XMI MT5 checkpoint 03 — offline Bid/Ask ticks

**Scope:** One independently scoped milestone: strict historical tick parser and synthetic tests. No connection to MT5 terminal, broker, production, or order execution.

## Source commits
- `c2222dd9edb23ec67f402bb395eedf26b8f08f95` — `lib/mt5/offlineTicks.mjs`
- `cb67b1092706eeda4e3186d29e9bb9f553e443ed` — `tests/mt5-offline-ticks.test.mjs`
- `fb871deed7aa3bfb44be14beb6bf590af7734612` — feature matrix update

## Implemented
- Requires manifest validation **before inspecting payload**, so sealed 2025 window is rejected even with malformed rows.
- Validates exact raw UTF-8 JSON SHA-256, opt-in source, `readOnly:true`, `executionEnabled:false`, bounded row count and bytes.
- Requires canonical UTC ISO timestamps with milliseconds, optional consistent `time_msc`, finite positive Bid/Ask, non-crossed quotes, monotonic timestamps, optional nonnegative flags, and half-open source window.
- Retains distinct same-millisecond tick events (MT5 can emit several) without silently merging or fabricating quotes.
- Reports absolute-price spread min/max/mean, provenance and source SHA; does not claim pips without symbol point/tick-size specification.

## Test evidence and limitations
A **representative local Node.js v22.16.0 copy** of this parser and tests was executed with a minimal contract stub: **4/4 synthetic tests passed**. This verifies the local parser behavior, **not the exact committed repository integration**. The full branch was not checked out locally; `node --test tests/mt5-contract.test.mjs tests/mt5-offline-bars.test.mjs tests/mt5-offline-ticks.test.mjs` remains pending on the exact branch, as does GitHub CI. No live terminal export, authentic historical Bid/Ask quotes, broker spread/slippage or GatesFX data was tested.

**Potential follow-up:** Evaluate `time_msc` and `time` seconds from native Python MT5 tick arrays in the Windows exporter, and translate broker points/pips only after symbol_info is verified. Export must preserve multiple events per millisecond and never silently infer missing quote sides.

## Safety / next
No 2025 holdout data accessed. Existing provider routing unchanged. Production unchanged. Strategy results remain provisional/unranked. Next: normalized M1/M5 bars and session/DST parity; execute exact-branch regression tests when a repository-capable executor is available.
