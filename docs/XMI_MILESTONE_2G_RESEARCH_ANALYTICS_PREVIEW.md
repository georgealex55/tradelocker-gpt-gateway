# XMI 2.0 — Milestone 2G: Offline Strategy Research Analytics

**Release boundary:** Stacked on draft 2F PR #22; main/production must not be modified. No broker orders, live signals, automatic actions, new data-feed credentials, provider authorization changes, database migrations, or trading execution.

## Added
- Deterministic descriptive comparison diagnostics for two immutable strategy research versions evaluated on the same real imported CLOSED candles.
- Baseline and candidate categorical distribution charts for ALIGNED, CONFLICTED, MIXED and NOT READY; the charts do not claim profitability or market accuracy.
- Explicit observed wall-clock slot share, missing intervals, potential UTC-weekend slots, unexplained time gaps, and clear warning that exchange calendar and provider provenance are not verified.
- Transparent readiness checklist showing admission of real closed bars, EMA200 warmup, current research scoring availability, session calendar unverified, and market provider unverified. These are diagnostic attributes, not an opaque 0–100 profitability score.
- Interactive history with four filters (changed classifications, all observations, jointly scored observations, at least one not ready) and bounded 20-row pagination.
- Analytics are calculated from the same browser-memory-only local import and automatically cleared when the source, selected strategy, or saved version changes. No new storage keys or API routes. The SHA-256 report from 2F retains its strictly validated schema and separate export flow.

## Test and acceptance
1. Deterministic repeat runs; result counts and jointly-scored sample agree with the saved comparison.
2. Unit tests: observed coverage, wall-clock gaps, readiness checklist, stale version rejection, original XMI unscored handling, filtering/pagination and future-candle non-lookahead.
3. Chromium browser test: research analytics appears only after comparison, correct number of closed fixture candles, filter and page navigation, provider/calendar warnings, existing report export and tampered-report rejection.
4. Full XMI test suite including production historical-import-only safeguards, Vercel preview READY at exact SHA, main unchanged and PR draft/unmerged.

## Interpretation limits
Observations are classifications, not hypothetical positions or executable trade signals. A high baseline/candidate agreement percentage is not a strategy success rate. Observed wall-clock slots include genuine non-trading closures and cannot establish market-history completeness. User-supplied OHLC data and self-contained checksums do not establish authenticity.

## Proposed next slice
Milestone 2H: opt-in dataset provenance evidence, explicit approved calendar adapters and more robust out-of-sample research validation. Keep broker execution disabled until an independently approved release and security review.