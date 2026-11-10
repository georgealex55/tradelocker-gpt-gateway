# XMI 2.0 — Issue 1 fixed: source-integrity regression runs in GitHub Actions

**Verified UTC:** 2026-11-10T18:14:05Z  
**Scope:** Research branch only; no production, broker, market-data downloads, or 2025 holdout access.

## Change

Added `.github/workflows/xmi-fxcm-integrity-ci.yml`, triggered by changes to the FXCM importer, its Python regression tests, or the workflow, on `research/xmi-amd-seven-pair-fxcm-replay-20261107`. Workflow explicitly checks out research code without retaining credentials, sets up Python 3.12, compiles the parser and test source, and runs both offline Python FXCM source-integrity regressions and the frozen AMD JavaScript regressions. Logs are saved as a GitHub Actions artifact. Unlike the existing seven-pair replay workflow, this CI job does **not** fetch historical vendor data.

## Independent execution evidence

- Workflow: https://github.com/georgealex55/tradelocker-gpt-gateway/actions/runs/42873049006
- Workflow job ID: `130029020485`; **completed, success**.
- Python: `Ran 13 tests in 0.018s`; `OK`. All 13 tests passed.
- Node AMD engine: `# tests 11`, `# pass 11`, `# fail 0`.
- CI workflow code commit: `3478e2472fc9efdb9459b3043baeef464f2e6071`.
- Logs artifact: https://github.com/georgealex55/tradelocker-gpt-gateway/actions/runs/42873049006/artifacts/13791050200

## What this establishes / does not establish

The earlier blocker that prevented execution of the offline parser regression suite is resolved: the suite now executes reproducibly on GitHub-hosted runners and passes. This is test execution and parser integrity evidence, **not** proof that historic FXCM or Dukascopy candles are complete at every session, that GatesFX Standard STP contracts/spreads are verified, or that a trading strategy is profitable. Historical seven-pair replay and synthetic M5 continuity/DST/capital-concurrency tests remain distinct work items. Profits remain provisional and unranked pending broker verification.

2022–2023 source provenance and explicit 2023 FXCM week-27 Dukascopy substitution remain unchanged. 2024 remains previously-examined development only. 2025 holdout remains untouched.

## Next

Implement and run offline synthetic M1→M5 missing-minute continuity assertions, DST/session tests and per-symbol cost/margin model checks; investigate full historical workflow failures separately. Preserve unverified-broker ranking gate.
