# XMI research checkpoint 06 — M5 continuity regression coverage

**2026-11-08 — research branch only.**

## Verified work
- Read the previous checkpoint 05 and the actual GitHub source for `scripts/xmi-m5-continuity-audit.py` and `tests/test_xmi_fxcm_integrity.py`.
- Committed `tests/test_xmi_m5_continuity.py` with nine deterministic, synthetic test methods: contiguous bars, single missing slot, weekend closure without false outage classification, duplicate/out-of-order timestamps, non-UTC or misaligned timestamps, invalid OHLC/schema, all seven pairs across both training years, 2025/unregistered-symbol rejection, and empty/cross-year rejection.
- Test commit: [d86c3da](https://github.com/georgealex55/tradelocker-gpt-gateway/commit/d86c3da752da56a03dc0c961171962a892c21efe).

## Execution and limits
- Nine tests **passed locally** against a separately reconstructed equivalent of the GitHub M5 auditor logic, not against a checked-out byte-for-byte repository source. This validates test intent and the reproduced algorithm, **not** the committed GitHub test suite. Do not claim the GitHub suite passed until a runner checks out the branch and executes it.
- Historical derived CSVs remain unavailable in this runtime; **no real M5 continuity scan, market replay, broker quote verification or strategy optimization** occurred. Previous 10-method FXCM parser suite remains unexecuted.
- The auditor intentionally counts all gaps, including weekends; it does not classify a gap as a source outage without a calendar/source manifest. Bid-only OHLC cannot verify historical ask/spread.
- Next executable commands in a checkout:
  `python3 -m unittest discover -s tests -p 'test_xmi_m5_continuity.py' -v`
  `python3 -m unittest discover -s tests -p 'test_xmi_fxcm_integrity.py' -v`
  Then audit each of seven pairs for both 2022 and 2023 using real derived M5 CSVs and preserve per-file SHA-256, source provider, session calendar, gap reasons and 2023 W27 mixed FXCM/Dukascopy provenance.

## Safety and qualification
- Seven FX pairs equal priority. 2022–2023 training; 2024 previously examined development; **2025 holdout untouched**.
- USD 1,000 independent account scenarios and 2% risk experimental only. GatesFX Standard STP account-specific lot, contract, leverage/margin, spread and slippage data remain unverified. **All profitability comparisons remain provisional and UNRANKED**; no claim of a qualified strategy.
- No production edits, merge, real orders, broker access, new performance claims or raw market data published.
