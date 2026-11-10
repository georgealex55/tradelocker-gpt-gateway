# XMI research checkpoint 03 — FXCM parser rejection gates

Status: **source correction committed; regression execution not verified**. Provisional/unranked; no new market replay.

## Verified GitHub change
- Commit [114d05d740d4f41f346eb03f1b712732e6462a34](https://github.com/georgealex55/tradelocker-gpt-gateway/commit/114d05d740d4f41f346eb03f1b712732e6462a34) updates `scripts/xmi-amd-fxcm-seven-pair-replay.py` on research branch only.
- `timestamp()` now rejects explicit nonzero timezone offsets rather than silently converting a non-UTC source timestamp. Explicit zero-offset timestamps are normalized to UTC; naive timestamps retain the declared UTC-source interpretation.
- `parse_minute()` now rejects crossed opening quotes (`AskOpen < BidOpen`) instead of only counting negative spread observations.
- These changes target two defects identified in [checkpoint 02](XMI_AUDIT_CHECKPOINT_2026-11-08_RUN02.md). The six synthetic cases in `tests/test_xmi_fxcm_integrity.py` were **not executed** by this connector action. No test-pass, historical data correction or backtest improvement is claimed.

## Verification commands for a checkout of this research branch
```sh
python3 -m unittest discover -s tests -p 'test_xmi_fxcm_integrity.py' -v
python3 -m py_compile scripts/xmi-amd-fxcm-seven-pair-replay.py
```
Run before accepting changes. The parser's generator semantics mean errors occur during iteration; the current tests iterate through all records.

## Important remaining integrity questions
1. The existing synthetic valid quote uses bid open 1.1000 and ask open 1.1002, so it should remain accepted; the crossed-quote fixture uses 1.0999 and should now raise.
2. `AskOpen` may be absent in source data; missing asks remain allowed and observed spread statistics only describe present asks. This is **not** a GatesFX historical execution spread.
3. Strict M5 missing-minute coverage, duplicate timestamp handling, source provenance of the 2023 week-27 Dukascopy substitution, and London/NY DST session boundaries still need executable regression checks.
4. No pair-specific price data was read or modified in this run. All seven pairs are subject to the same parser changes: EURUSD, GBPUSD, USDJPY, USDCHF, AUDUSD, USDCAD, NZDUSD.

## Research safeguards and status
GatesFX Standard STP per-symbol contract sizes, lot steps, leverage/margin and historical spreads/slippage remain unverified; definitive strategy ranking is blocked. The $1,000 independent funded-scenario baseline, separate experimental 2% risk tier, 10% drawdown halt, no-lookahead, 2022/2023 training, 2024 exposed development, and 2025 sealed holdout requirements are unchanged. No production deploy, merge, live order or broker action occurred.

## Next checkpoint
Execute the six-case suite in an actual checkout/CI runner; fix any observed failures. Add a synthetic missing-minute-to-M5 regression and explicit DST boundary test without accessing 2025.
