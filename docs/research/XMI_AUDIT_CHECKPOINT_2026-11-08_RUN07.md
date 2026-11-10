# XMI research checkpoint 07 — synthetic FX session DST contracts

Date: 2026-11-08. Isolated research branch only.

## Verified change
Read the actual checkpoint 06 and repository copies of `tests/test_xmi_m5_continuity.py`, `tests/test_xmi_fxcm_integrity.py`, and `scripts/xmi-m5-continuity-audit.py` through the GitHub connector. Added `tests/test_xmi_fx_session_dst.py` in commit [cb07fa4](https://github.com/georgealex55/tradelocker-gpt-gateway/commit/cb07fa4c142ea31bc3f241e7cda339b25e21b8f1). It specifies six deterministic synthetic test methods: New York 08:00 session winter/summer UTC mapping, London 08:00 mapping, US/UK DST mismatch weeks, uninterrupted UTC five-minute grids across US DST switch dates, seven-pair 2022–2023 parameter coverage, and rejection of fixed UTC-hour assumptions for local sessions.

## Interpretation and outstanding execution
The suite uses Python standard-library `zoneinfo` with IANA `America/New_York` and `Europe/London`; the runner must have timezone data installed. This is **calendar contract coverage only**, not evidence that market quotes existed in any slot or that the actual replay engine uses DST-correct session boundaries. The six committed test methods have **not been executed** against a checkout. The existing ten-method FXCM parser suite and nine-method M5 continuity suite also still need execution against the actual GitHub branch. No historical market CSVs, GatesFX quotes, spread/slippage records or real replay data were available to this checkpoint.

Run in a checkout:
```sh
python3 -m unittest discover -s tests -p 'test_xmi_fx_session_dst.py' -v
python3 -m unittest discover -s tests -p 'test_xmi_m5_continuity.py' -v
python3 -m unittest discover -s tests -p 'test_xmi_fxcm_integrity.py' -v
```
Then inspect session generation in the actual strategy engine; apply timezone-aware local session conversion where necessary and add integration tests to prove no-lookahead/next-bar entry. Classify genuine gaps only against a source-specific market calendar. Preserve the FXCM/Dukascopy mixed-source 2023 week-27 provenance.

## Scope and safety
Equal attention to EURUSD, GBPUSD, USDJPY, USDCHF, AUDUSD, USDCAD, NZDUSD. USD 1,000 independent scenarios; 2% risk remains experimental and separate. 2022–2023 training; 2024 previously exposed development; **2025 holdout unopened**. GatesFX Standard STP symbol-specific margin, min/step lots, contracts, spread and slippage still unverified. **All strategy comparisons remain provisional and UNRANKED.** No backtests, broker actions, live orders, production changes, merges or raw vendor-data publication in this checkpoint.
