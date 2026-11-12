# XMI MT5 checkpoint 04 — M1/M5 UTC session and spread audit

## Implemented
- New pure offline `lib/mt5/barSession.mjs` audit for explicit UTC millisecond M1/M5 timestamps, strictly increasing bars, duplicate rejection, aligned timeframes, completed bars, missing-bar counts and non-invented gap labels.
- Retains MT5 spread values as **points**, not pips or prices. `spreadPointsToPrice` converts only with an explicitly supplied positive symbol point; no broker contract or pip size inferred.
- UTC timestamps across the 2024-03-10 North American DST transition remain contiguous; unknown venue session gaps remain `UNVERIFIED_SESSION_GAP`, never labeled weekend or broker closure without evidence.
- Separate tests cover DST, gaps, duplicate/unaligned/ambiguous time, spread conversion, incomplete candles and invalid spreads.

## Evidence
- Source commit: `529b9fcc5cc1167bc2c8516292e2b4f2c069d4f2`.
- Tests commit: `526a5fe74d9cdb8c52dce9c29b9e473cb020e9f1`.
- Matrix update: `a0a9fb665e370ae6f19349f1cb56a4c3010b8526`.
- Isolated local Node.js `node --test` run: **5/5 synthetic tests passed** after correcting a test fixture that initially violated the declared window/as-of condition. No production source, private broker data, 2025 data or market replay was used.
- Exact committed repository suite and CI **not executed**. This audit is a separate pure module and has not yet been integrated into `lib/mt5/offlineBars.mjs`; do not claim end-to-end M1/M5 support.
- No broker sessions, true broker DST offsets, rollover rules or verified `symbol_info.point` supplied. Missing bars are reported, not synthesized.

## Next
Milestone 5: Windows-local Python MT5 read-only terminal wrapper with injected mock SDK, bounded research-window preflight and explicit no-order functions. Integrate session audit with the offline importer only after exact-branch regression validation; preserve existing providers, production and sealed 2025 holdout.
