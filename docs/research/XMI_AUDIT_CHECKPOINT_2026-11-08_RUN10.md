# XMI research checkpoint 10 — strict requested-year parsing boundary

Date: 2026-11-08. Branch: `research/xmi-amd-seven-pair-fxcm-replay-20261107`.

## Verified incremental work
Read checkpoint 09 and the actual FXCM importer and all four existing integrity/continuity/DST regression suites using the authenticated GitHub connector. Found a fold-isolation defect: `parse_minute(text, year, week)` accepted *both* 2022 and 2023 records because it checked only `year in YEARS`, not the requested `year`. The outer `run()` subsequently filtered mismatched records, so prior exported folds are **not shown to be contaminated**; however the parser API did not enforce its advertised requested-year boundary. At week/year boundaries this was an avoidable weak invariant.

Updated the parser to accept only records matching its requested training year, preserving the global `YEARS=(2022,2023)` allowlist, FXCM source schema, UTC and bid/ask guards. Code commit [79529d3](https://github.com/georgealex55/tradelocker-gpt-gateway/commit/79529d38acc806bbefad15b45db4b5bda2e7b44e). Added `test_requested_year_is_enforced_at_parser_boundary` with 2022/2023 cross-year examples and a 2024 exclusion example (synthetic timestamp only, not 2024 market data). Test commit [0412dac](https://github.com/georgealex55/tradelocker-gpt-gateway/commit/0412dac5c91207c02f9ea98b4463a8818b1e3f62).

## Execution status and integrity limits
Authenticated GitHub reads/writes succeeded. Direct execution container `git ls-remote` failed with `Could not resolve host: github.com`; therefore no repository checkout or actual Python test run occurred. No historical FXCM/Dukascopy market files were accessible, no real-data continuity scan or backtest executed, and the previously committed regression suites remain unverified in the real repository. This is a source-level fix with an unexecuted regression, not a claim of passing tests or improved strategy returns.

## Remaining gate and next steps
1. Execute `python3 -m unittest discover -s tests -p 'test_xmi_*.py' -v` on an actual repository checkout; inspect any failures and fix only verified defects.
2. Validate actual 2022–2023 FXCM M1 schema, observed bid/ask completeness, 2023 Dukascopy week-27 provenance and all seven pairs' M5 continuity; distinguish expected market closures from outages.
3. Obtain account-specific GatesFX Standard STP symbol contracts, min/step lot, margin, leverage, observed spreads and defensible historical slippage; until then keep profitability comparisons **provisional and UNRANKED**.
4. Treat 2024 as already-examined development; **do not open/read the 2025 holdout**. No independently qualified OOS strategy has been established.
5. Preserve separately funded USD 1,000 scenarios at 0.25%, 0.5%, 1%, fixed 0.01 lots and separate experimental 2%; no pooled accounts or live-sizing conclusions.

No merge, production deployment, real trade, broker account change, secret disclosure, or production chart change. No raw licensed market data committed. Equal seven-pair scope preserved; this parser fix is pair-agnostic.
