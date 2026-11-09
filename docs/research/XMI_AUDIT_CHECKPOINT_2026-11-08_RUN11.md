# XMI research checkpoint 11 — repair missing-ask-column regression fixture

Date: 2026-11-08. Branch: `research/xmi-amd-seven-pair-fxcm-replay-20261107`.

## Previous checkpoint and actual inspection
Read checkpoint 10 and the current `tests/test_xmi_fxcm_integrity.py`, `scripts/xmi-amd-fxcm-seven-pair-replay.py`, and M5 continuity auditor through authenticated GitHub. Checkpoint 10's parser-year correction remains unexecuted against the actual checkout.

## One concrete verified change
The `test_reject_missing_ask_column` fixture removed `,AskOpen` from the header but attempted to remove the trailing value using the literal backslash-n byte sequence (`b"\\n"`) rather than an actual newline (`b"\n"`). The synthetic row therefore retained an extra CSV field and was not a clean missing-column fixture. Corrected the test fixture to remove `,1.1002` plus the actual newline, preserving the intended exact five-column header/row and the parser's expected `Missing column askopen` assertion.

Code commit: [9829df5](https://github.com/georgealex55/tradelocker-gpt-gateway/commit/9829df5eba6d01778e4f7a368c5f1abe7a9d09ab). The authenticated GitHub write succeeded. This is a test-fixture correction, not a claim of an executed passing test or a market replay.

## Outstanding execution / source / broker gates
- Execute `python3 -m unittest discover -s tests -p 'test_xmi_*.py' -v` against a real repository checkout; fix any actual failures.
- Historical 2022–2023 FXCM M1 and independent Dukascopy 2023 week-27 files, manifests, licenses and source hashes were not available for a real-data scan in this run. No new bars, OHLC, quotes, spreads or fills were fabricated.
- All seven pairs (EURUSD GBPUSD USDJPY USDCHF AUDUSD USDCAD NZDUSD) retain equal scope; no pair-specific tuning or new performance claims.
- GatesFX Standard STP per-symbol contracts, min/step lots, actual margin/leverage, historical bid/ask and slippage remain unverified. All existing comparisons remain **provisional and UNRANKED**. The separate 2% experimental scenario is not live-authorized.
- 2022/2023 training only; 2024 previously exposed development only; 2025 holdout sealed/unread. No genuinely independent OOS qualification established.
- No production merge/deployment, live trade, broker change, credentials, or licensed raw vendor data committed.

## Final-run priorities
Prepare the complete traceable final audit from verified GitHub checkpoints; include explicit counts of **new** historical replays (zero in this run), separate funded risk tiers and 2% high-risk status, actual test execution status, unresolved GatesFX gate, 2024 caveat, and sealed 2025 holdout. Do not claim independent strategy qualification.
