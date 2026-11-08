# XMI hourly research checkpoint — 2026-11-08 — source/qualification gate

Status: **research only, provisional/unranked**. Source baseline: `docs/XMI_AMD_SEVEN_PAIR_HISTORICAL_REPLAY_2022_2023.md` blob SHA `0d616b30d6afe0a94fc5e12da7ca46a8a6a6b849`. No new historical replay executed in this checkpoint. All numbers below are transcribed from that frozen baseline, not newly verified.

## Equal-pair coverage audit

| Pair | 2022 valid M5 | 2023 valid M5 | matched configurations >=20 funded trades/year | positive net in both training years |
|---|---:|---:|---:|---:|
| EURUSD | 73214 | 73134 | 30 | 0 |
| GBPUSD | 72664 | 73017 | 32 | 0 |
| USDJPY | 72986 | 73153 | 29 | 8 |
| USDCHF | 71768 | 72771 | 31 | 0 |
| AUDUSD | 72577 | 72853 | 29 | 0 |
| USDCAD | 72324 | 72553 | 32 | 0 |
| NZDUSD | 72209 | 72701 | 32 | 0 |
| **Total** | **507742** | **510182** | **215** | **8** |

Deterministic assertions from the recorded table:
- 2022 sum: 507742; 2023 sum: 510182; combined: **1017924** M5 rows.
- Seven symbols x two years x 192 scenarios = **2688** scenario-years.
- Matched qualifying *training-fold sample* configurations sum to 215, not 215 independent strategies or 215 OOS trades.
- USDJPY's 2023 training-fold profit factor **1.358** is **below** the requested strict >1.5 gate; 72 total candidate trades in 2022+2023 are **training** trades, not OOS.
- Both training years were already used for candidate selection. No ranking of these seven pairs as GatesFX tradable strategies is justified.

## Source and execution gate — BLOCKED until verified

1. Obtain GatesFX **Standard STP account-specific**, symbol-by-symbol contract sizes, base/quote currencies, min/step lot sizes, tick size/value, symbol leverage and initial/maintenance margin; record provider evidence, retrieval date, instrument identifiers and account type. Headline 1:500 is not symbol-specific verification.
2. Obtain defensible *historical* GatesFX bid/ask quotes or an independently justified execution proxy covering the same tested periods and session windows, and timestamped slippage evidence. Verify swaps/rollover and financing for overnight models. Until then all cost P&L is hypothetical and **UNRANKED**.
3. FXCM 2023 ISO week 27 contains headers only for all seven symbols; independent Dukascopy M5 bid bars replace this gap. Preserve explicit mixed-source flag per affected candle and reject any claim of homogeneous FXCM 2023. Preserve UTC alignment and verify London/New York DST boundaries before further session strategy claims.
4. Recheck full M1 continuity, duplicates, missing-minute counts, M5 all-five-minutes integrity, quote ordering (ask >= bid), negative/zero spread anomalies, non-trading hours, tick-to-pip conventions, bid/ask side of each entry/exit, intrabar stop-first assumptions, slippage, minimum-lot forced size, available margin, margin maintenance, and forced-liquidation events.
5. Test 0.25%, 0.5%, 1%, fixed 0.01 lots, and separately **experimental 2%** with independent $1000 initial accounts; preserve 10% drawdown-halt and unfundable shadow ledger. Do not sum results as a portfolio.
6. Qualification gate remains positive truly independent OOS net expectancy, PF >1.5, drawdown <10%, >=200 genuinely independent OOS trades. **2024 is already-exposed development; 2025 is sealed and must not be read.**

## Next executable task

Implement an isolated deterministic integrity regression test that reads the existing 2022/2023 M1->M5 resampler and asserts five contiguous minutes, consistent bid/ask, no lookahead and correct UTC/DST session mapping on synthetic boundary cases. Do not fetch/open 2025. Follow with per-pair source metadata and contract-verification checklist. Expand strategy comparisons only after this integrity pass.

No production merges, deployments, orders, or changes to the live chart. This checkpoint itself is documentation-only.
