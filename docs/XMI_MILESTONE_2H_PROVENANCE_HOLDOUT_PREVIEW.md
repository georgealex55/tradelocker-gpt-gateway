# XMI 2.0 — Milestone 2H: Dataset Provenance and Retrospective Holdout

**Release boundary:** Preview-only stacked on Draft PR #23 (Milestone 2G), which depends on Draft PRs #22/#21/#20/#19/#18/#17. No merge or production promotion; no order execution, live signals, new feeds, credentials, alerts, database migrations, or trade simulation.

## Implemented
- Explicit local provenance evidence intake: claimed source label (max 100 chars), optional claimed acquisition date, and optional user-declared usage rights. These entries are not independently verified.
- Deterministic SHA-256 over the same canonical *fully closed* time/open/high/low/close/volume series and instrument/resolution as the existing Milestone 2F report schema. Optional independently retained expected hash can be entered and checked as MATCH/MISMATCH/NOT_PROVIDED; an internally recomputable hash does not authenticate a data provider.
- Chronological partition choices 60/40, 70/30, 80/20. The earlier and later samples are exact nonoverlapping intervals from the previously validated same-dataset research observations. The cutoff and counts are disclosed.
- Separate descriptive category count, changed-classification share, jointly-scored count and not-ready count for each partition; no scores indicating trade success.
- Explicit methodological caveats: this is a retrospective holdout, not a preregistered unseen test; indicator warmup may use earlier closed candles, but never future candles; iterating after seeing later observations may introduce selection bias.
- Conservative session-gap metadata only. UTC weekend candidates do NOT establish venue opening hours, holidays, DST, provider identity or a licensed calendar.
- Results, provenance text and expected hash live in browser memory only. No new localStorage keys, uploads, vendor connections, new API routes, or changes to the strict 2F SHA-256 report format.

## Verification
1. Compare actual chronological first/last timestamps, cutoff and disjoint sample counts across 60/40, 70/30 and 80/20.
2. Fingerprint changes on high/volume change even if closes remain identical; hash checks never imply provider authenticity.
3. Reject invalid hash, date, rights declaration, split choice or stale historical/analytics data.
4. Chromium browser smoke confirms claimed-source text, split review, displayed non-pre-registration warning, and user-entered external hash match on actual local imported candles.
5. Re-run all preceding XMI source authorization, historical import, chart, offline report, and browser regressions. GitHub CI and Vercel preview must be READY at the exact final SHA, PR draft/unmerged and main unchanged.

## Deferred
Independently signed source attestations, licensed venue/session calendars, genuine prospective preregistration, and any trade/backtest profitability simulation. This milestone is research-only and does not establish statistical predictive validity.