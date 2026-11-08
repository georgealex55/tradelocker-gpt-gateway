# XMI research checkpoint 08 — exact US/UK DST mismatch regression

Date: 2026-11-08. Research-only branch `research/xmi-amd-seven-pair-fxcm-replay-20261107`.

## Verified incremental change
Read the actual checkpoint 07, all three committed regression suites, the M5 continuity auditor, and the FXCM replay importer via the GitHub connector. The existing DST suite checked that US/UK mismatch dates fell within broad possible UTC-hour ranges, but did not assert the **exact** UTC session hours, so a wrong session-hour conversion could pass those cases. Added `tests/test_xmi_fx_session_dst_exact.py` with three synthetic test methods and explicit 2022/2023 March/October/November DST-transition contract tables, plus equal coverage of all seven major FX pairs. Commit: [2b27d256](https://github.com/georgealex55/tradelocker-gpt-gateway/commit/2b27d256f6df0bec2ad2fbb83abd484bb5c708b7).

Independently evaluated the 12 explicit date/hour expectations locally with Python `datetime`/`zoneinfo`; all 12 passed. **The actual newly committed GitHub test file has not been executed against a checkout**, nor has the actual strategy engine been proven to use IANA timezone conversion. The other three suites still require repository checkout execution. No market CSV was read and no historical replay was run.

## Next checkpoint
Run all four committed suites against a real checkout and inspect the strategy engine's session generation (not just calendar helpers). Test entry causality and compare local-session vs fixed-UTC behavior on 2022/2023 training folds, only after verifying source continuity and without using 2025. Locate actual 2022/2023 M5 source artifacts for continuity auditing.

## Safety and interpretation
All seven FX pairs receive equal treatment. 2022/2023 training only; 2024 previously-exposed development; **2025 sealed**. FXCM 2023 week 27 Dukascopy substitution remains explicitly mixed-source and must not be represented as native FXCM. GatesFX Standard STP symbol-specific contract sizes, lot increments, margin, spreads and slippage are unverified. No broker-specific profitability ranking is permitted. USD 1,000 independent accounts, with 2% experimental risk kept separate. No production changes, merges, live trades, broker access or vendor data publication.
