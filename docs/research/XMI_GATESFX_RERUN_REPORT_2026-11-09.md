# XMI 2.0 — GatesFX screenshot-price sensitivity replay (completed 2026-11-09 UTC)

**Evidence:** [Successful 7-of-7 GitHub Actions run](https://github.com/georgealex55/tradelocker-gpt-gateway/actions/runs/42562466758); seven retained pair artifacts (baseline JSON, screenshot scenario JSON, separate 2% JSON, per-pair summary and quote source SHA manifest). **PROVISIONAL / UNRANKED.** No raw vendor OHLC uploaded to GitHub, no broker orders, no production deploy.

## Scope and constraints

Historical years: only 2022 and 2023 *training*; previously exposed 2024 not read, sealed 2025 not read. Source remains FXCM public UTC M1 bid/ask with explicit **independent Dukascopy bid M5 substitution for 2023 missing ISO week 27**. Every scenario starts independently with USD 1,000. Original 192 scenario/year AMD matrix was rerun using a quote-integrity quarantine for crossed FXCM M1; **new fixed screenshot-spread sensitivity** used the same cleaned M5 source hash, and **risk_0.02** was run separately as experimental, not authorized sizing. Frozen AMD signal/exit modeling unchanged.

## Data-integrity consequence

**2,045 FXCM M1 crossed opening bid/ask observations** quarantined (2022: 1,860; 2023: 185). They were excluded, not repriced; M5 groups lacking all five minutes were dropped. Accepted complete M5 bars reduced from **1,017,924 original** to **1,016,144** (2022: 506,128; 2023: 510,016; 1,780 fewer total). Original baseline and data-quality-adjusted replay **are not identical datasets**. Strict quote rejection remains importer default; only this replay opts into the bounded, counted quarantine. The maximum allowed quarantine was 0.5% of accepted source minutes; all seven pair-years passed. All 7 jobs completed successfully. FXCM gzip weekly hashes and independent Dukascopy source SHA are in the individual archived summary JSON artifacts.

| Pair | 2022 cleaned M5 | 2023 cleaned M5 | Crossed M1 quarantined (2022 / 2023) | Screenshot spread, pips | 1% matched positive both years | 2% experimental matched positive both years |
|---|---:|---:|---:|---:|---:|---:|
| EURUSD | 72,193 | 73,130 | 1223 / 4 | 1.9 | 0 | 0 |
| GBPUSD | 72,640 | 73,017 | 28 / 0 | 2.0 | 0 | 0 |
| USDJPY | 72,781 | 73,153 | 215 / 0 | 1.9 | 1 | 1 |
| USDCHF | 71,567 | 72,616 | 214 / 171 | 1.7 | 0 | 0 |
| AUDUSD | 72,478 | 72,853 | 108 / 0 | 1.7 | 0 | 0 |
| USDCAD | 72,278 | 72,553 | 53 / 0 | 2.4 | 0 | 0 |
| NZDUSD | 72,191 | 72,694 | 19 / 10 | 1.8 | 0 | 0 |
| **Total** | **506,128** | **510,016** | **1,860 / 185** | — | **1** | **1** |

"Matched positive both years" means exactly the same AMD range/entry/exit/carry/sizing configuration produced funded, net-positive **training** results in each year, with >=20 funded settled trades **in each year**, same-day and risk-fit. This is NOT independently qualified OOS and NOT a cross-pair portfolio. Some other USDJPY sizing variants also shared positive training outcomes; highly correlated variant counts are not independent discoveries.

## Replay counts

- Refreshed 2.0-pip baseline: 192 scenarios × 14 pair-years = **2,688**.
- Screenshot fixed-spread model: 192 scenarios × 14 pair-years = **2,688**.
- Isolated experimental high-risk 2%: 48 scenarios × 14 pair-years = **672**.
- Total replayed **6,048** scenario-year modeled accounts; not 6,048 independent OOS samples.

Screenshot spread per pair is the **upper of a few observed live screenshots**, treated as a fixed spread across history only for *sensitivity*, not as broker historical truth. Slippage retained original modeled adverse 0.3 pip **per side** and $0 modeled opening commission. The platform showed min 0.01 lot, 100k currency units/lot, 0.20% margin and leverage 500 for majors; **lot step assumed 0.01 from frozen catalog, not displayed in screenshots**. Swap displays had unresolved asterisk; overnight outcomes remain unpriced. No verified dynamic spread history, historical swap, execution slippage, full margin closeout, correlated portfolio capital contention or truly independent OOS.

## USDJPY fixed preexisting comparator (not a winning claim)

Frozen configuration: session_asia_london accumulation, range_reclaim_retest, bracket_2r, session_flat, risk_fit. The **1%** scenario comparison:

| Training fold | Original historical report | Replayed 2-pip baseline after crossed-quote quarantine | Screenshot 1.9-pip spread model |
|---|---:|---:|---:|
| 2022 | +$61.58 / 26 trades | +$9.81 / 23 trades | **+$10.37 / 23 trades** |
| 2023 | +$63.09 / 46 trades | +$63.09 / 46 trades | **+$64.50 / 46 trades** |

At **2% experimental only**, the same configuration returned **+$37.32 in 2022 (23 trades)** and **+$124.95 in 2023 (46 trades)** for **separate $1,000 starts**; not compounded, not a claim that extra risk is preferred. These totals are training-only, omit broker-verifiable execution costs and are not qualified. In the same cleaned 2022 bars, moving 2.0 to 1.9 pip changes 1% modeled net by only **+$0.56**; most of the original-to-replay 2022 change follows quote quarantine and three different trade outcomes, **not** the screenshot spread assumption.

## GatesFX verification and methodological limitations

Contract snapshot gate has advanced for all seven. Full gate 6B **STILL FAILED**: broker-specific **historical** bid/ask spread distributions, slippage/execution samples, lot step/max tiers, stop-out applicability, historical swap/rollover charges and optional closing charges not independently confirmed. Neither profit factor nor intrabar drawdown/forced liquidation was recalculated in the compact summary output, so no strategy qualification can be asserted. Engine uses a closed-equity 10% halt, not independently verified broker-level liquidation. Separate accounts are not a correlated seven-pair live portfolio.

Gold XAUUSD contract snapshot (100 oz/lot, min 0.01, leverage 1:200, margin 0.50%, ~0.28–0.30 USD/oz spread) is **captured but was not replayed** because this reproducible historical pipeline and its reference sample are seven-major FX-only. Gold requires separate source/calendar/quote validation.

## Audit trail

- [Preregistered screenshot scenario input](../research/xmi-gatesfx-snapshot-scenarios-20261109.json)
- [Broker-screenshot evidence matrix](XMI_GATESFX_EIGHT_INSTRUMENT_SPECS_2026-11-09.md)
- [Machine-readable report](XMI_GATESFX_RERUN_RESULTS_2026-11-09.json)
- [GitHub replay and artifacts](https://github.com/georgealex55/tradelocker-gpt-gateway/actions/runs/42562466758)
- Code: `scripts/xmi-gatesfx-snapshot-spec.py`, `scripts/xmi-gatesfx-snapshot-compare.py`, isolated 2% option, and opt-in crossed quote quarantine with synthetic regression.
- No production changes, no 2025 holdout accesses, no qualified live strategy rankings.
