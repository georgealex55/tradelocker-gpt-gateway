# XMI research checkpoint 02 — synthetic FXCM parser integrity gate

Status: **research-only, provisional/unranked**. Branch `research/xmi-amd-seven-pair-fxcm-replay-20261107`. Previous checkpoint: `docs/research/XMI_AUDIT_CHECKPOINT_2026-11-08_RUN01.md`. No new market replay or broker validation performed.

## Concrete change
Added `tests/test_xmi_fxcm_integrity.py`, a deterministic offline unittest suite for the actual historical importer `scripts/xmi-amd-fxcm-seven-pair-replay.py`. It exercises valid quote parsing, crossed bid/ask rejection, invalid bid OHLC rejection, non-minute timestamps, explicit non-UTC offsets, and an assertion that configured research folds are only 2022/2023. It fetches no external data and never opens 2025.

## Static code audit findings — must fix before relying on spread diagnostics
1. `parse_minute` currently accepts an `AskOpen` smaller than `BidOpen` (it checks only that ask is finite and positive). The later `crossed_bid_ask_minute_quotes` field merely counts such cases; it does not reject them. **Expected synthetic regression failure**: `test_reject_crossed_quote`.
2. `timestamp` accepts explicit ISO-8601 offsets and converts them to epoch without asserting the FXCM input is UTC, despite labeling `raw_source_timezone` as UTC. **Expected synthetic regression failure**: `test_reject_implicit_non_utc_offset`. Offset acceptance is not evidence that existing downloaded files actually contain offset timestamps.
3. Missing `AskOpen` is allowed and spread statistics then cover only present asks. The M5 replay is BID-only and applies separate fixed modeled spread/slippage; source observed ask is not directly used for fills. Therefore `sample_bid_ask_spread_median` cannot be interpreted as verified executed spread.
4. The importer resamples only groups with exactly minute offsets [0,60,120,180,240], but a separate synthetic resampler test and strict per-session DST regression are still needed. This checkpoint does not claim those are complete.

**Execution status:** Tests were committed but not executed in this checkpoint; failures above are predicted by inspection of the exact source, not observed CI results. No passing claim is made.

## Next action
Fix strict UTC-offset and crossed-quote checks in the isolated research importer, run the six tests in CI, then add synthetic M5 missing-minute and London/NY DST session tests. Confirm that the 2023 Dukascopy week-27 replacement is explicitly tagged. Continue balanced review across EURUSD, GBPUSD, USDJPY, USDCHF, AUDUSD, USDCAD, NZDUSD; no pair gets preferred execution evidence.

## Qualification constraints
GatesFX Standard STP symbol contract sizes, lot steps, margins, historical spreads and slippage remain **unverified**; no definitive profit ranking or winning strategy claim. Each scenario remains independently $1,000. The 2% risk tier is separate and experimental; no new tier replay executed. 2024 is exposed development, 2025 sealed/unread, and 200 independent OOS trades plus PF >1.5, DD <10%, positive net expectancy remain unmet. No production merge/deploy, broker action, or live chart change.
