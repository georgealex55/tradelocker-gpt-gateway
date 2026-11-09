# XMI research checkpoint 09 — enforce FXCM observed ask-open integrity

Date: 2026-11-08. Isolated research branch: `research/xmi-amd-seven-pair-fxcm-replay-20261107`.

## Actual source audit and correction
Read checkpoint 08 and all four committed test suites, plus the actual FXCM replay importer and M5 continuity auditor through the GitHub connector. Found that `parse_minute` treated the FXCM `AskOpen` field as optional and permitted rows with no ask price; those rows could be aggregated into M5 bid-only bars while sample spread statistics silently excluded missing quotes. That undermines provenance of the source's bid/ask evidence. The historical strategy runner still uses a separately modeled fixed 2.0-pip spread and 0.3-pip-per-side slippage; these are not verified GatesFX execution costs.

Committed a research-only importer change requiring an `AskOpen` / `ask_open` column and a nonblank ask quote on every retained minute, while preserving crossed-quote rejection. Importer commit: [eac2af1](https://github.com/georgealex55/tradelocker-gpt-gateway/commit/eac2af1af94c43868fd1cba449c1704ea32453f7). Added two synthetic parser tests for absent ask column and blank ask quotes: [6cc6fd7](https://github.com/georgealex55/tradelocker-gpt-gateway/commit/6cc6fd70be80d411cb0aaa4cb0a1ee80b6ddf27d). Both changes apply pair-agnostically to EURUSD, GBPUSD, USDJPY, USDCHF, AUDUSD, USDCAD and NZDUSD.

## Verification status and caveat
GitHub connector confirmed the two commits. No actual repository checkout/test execution, historical CSV download, or replay was performed this checkpoint. Therefore **new tests are unexecuted** and the stricter parser could reject historical source weeks if the actual FXCM schema lacks or has blanks in AskOpen. This is intentional fail-closed behavior, but real-data compatibility is unverified. Existing historical results were not recalculated; do not claim they pass the new integrity gate. Do not mistake observed FXCM ask quotes for verified GatesFX fills.

## Next checkpoint
Run the actual repository's parser/continuity/DST suites and validate real 2022–2023 FXCM M1 headers/quote completeness; if data unavailable, document access blocker and keep rankings provisional. Review observed spread coverage and compare separately with modeled execution costs. Do not read 2025.

## Unchanged controls
2022–2023 training only, 2024 previously examined development, **2025 sealed**. Preserve independent Dukascopy 2023 week-27 substitution and its mixed-source label. Independent $1,000 scenarios; 0.25%, 0.5%, 1%, fixed 0.01 lot and separate experimental 2% tier; 10% drawdown controls; no live trades, production changes, merges or raw licensed data publication. GatesFX Standard STP contract sizes, min/step lots, symbol margins, spread and slippage remain unverified, so all strategy comparisons are provisional and unranked.
