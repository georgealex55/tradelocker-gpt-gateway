# XMI 2.0 — Evidence reuse, replay deduplication and GatesFX refinement audit

**Date:** 2026-11-10 UTC. **Branch:** `research/xmi-amd-seven-pair-fxcm-replay-20261107`.  
**Audit decision:** Do NOT request the 2026-11-08 seven-FX-plus-gold screenshot bundle again. Do NOT automatically replay previously recorded scenario grids on unrelated PR/documentation commits.

## Findings: why earlier assistant requests repeated known information

1. The 12-run automation was **completed and disabled** after its final 2026-11-09 checkpoint. Its historical final report `docs/research/XMI_AUDIT_FINAL_12_RUNS_2026-11-09.md` was generated **before** newer account screenshot intake and 2026-11-09 full screenshot-sensitive replay evidence; it is no longer the authoritative answer for which broker specifications have been captured.
2. User-provided TradeLocker/GatesFX screenshots already cover EURUSD, GBPUSD, USDJPY, USDCHF, AUDUSD, USDCAD, NZDUSD, and separately XAUUSD. For all seven FX pairs, displayed lot size 100,000, min lot 0.01, margin 0.20%, leverage 500, $0 opening fee and bid/ask spread snapshots were recorded in `XMI_GATESFX_EIGHT_INSTRUMENT_SPECS_2026-11-09.md`. These are **live snapshots**, not historical STP execution data; their quote time was not visible. Screenshot originals were not added to GitHub.
3. Subsequent [successful screenshot-sensitive seven-pair run](https://github.com/georgealex55/tradelocker-gpt-gateway/actions/runs/42562466758) documented **6,048 total scenario-year calculations** (2,688 cleaned baseline, 2,688 snapshot spread sensitivity, 672 separate experimental 2%); 2022/23 training folds, crossed bid/ask minutes quarantined without fabrication and mixed-source Dukascopy week 27 explicitly labeled. **This was actual completed prior work and must not be recast as missing.**
4. Later [verified CI run](https://github.com/georgealex55/tradelocker-gpt-gateway/actions/runs/42873049006) demonstrated 13/13 Python FXCM integrity and 11/11 frozen AMD JavaScript regression tests passed. The original completed 12-run audit lacked this later evidence.
5. Prior `xmi-amd-seven-pair-replay.yml` **pull-request trigger** was repeatedly launching all seven full vendor-data jobs on unrelated PR branch updates due cumulative PR diff matching a path filter. Those jobs failed quickly under strict default crossed bid/ask policy (e.g. [2026-11-10 failed run](https://github.com/georgealex55/tradelocker-gpt-gateway/actions/runs/42891319011)). Those runs repeated known-source-data failures and were not new profitability findings.

## Applied corrections on research branch (not production)

- Created machine-readable **canonical evidence ledger** `docs/research/xmi-gatesfx-evidence-ledger-20261110.json`. It points to original snapshot matrix, scenario inputs, archived replay results and CI, marks already captured data reusable, and lists **only truly missing** broker records.
- Added `scripts/xmi-evidence-preflight.py` to read the ledger and archived replay inputs/results offline; it fails on missing seven-pair coverage, attempts to relabel live spread snapshots as historical broker prices, double-counted replay totals, re-requesting captured screenshots, incorrect 2025 holdout classification, or silent promotion of assumed lot steps.
- Added `tests/test_xmi_evidence_preflight.py` with eight independent synthetic guard cases, and wired them into `.github/workflows/xmi-research-regression.yml` so evidence reconciliation is a regression gate on relevant research code/data changes.
- **Verified GitHub Actions execution:** [research regression run 42891846531](https://github.com/georgealex55/tradelocker-gpt-gateway/actions/runs/42891846531), job 130094716463, **SUCCESS**. All original five offline suites pass (13 + 3 + 9 + 6 + 3 = **34** tests) and evidence preflight reports `"passed": true` with **8/8 new tests passing**. **42/42 total** in this CI job.
- Revised `.github/workflows/xmi-amd-seven-pair-replay.yml` to **manual workflow_dispatch** with a nonblank research question; removed redundant PR-triggered seven-pair replays; manual replay now specifies already-audited **bounded crossed-open-quote quarantine** (no synthetic quote repair), not the known failing strict default. This *does not* claim a new replay occurred. It is a dedicated historical workflow configuration for future intentional reruns.

## Evidence that is still missing — do not request the previously captured screenshots

1. Actual permitted **lot step/max lot**, symbol/account-specific margin tiers and stopout applicability (min lot 0.01 ALREADY KNOWN).
2. Broker-authentic **historical Standard STP bid/ask spreads 2022–2023 by symbol, session and date**, or explicit confirmation those data are unavailable.
3. Historical slippage/fills and any additional closing fees; 0.3 pip adverse per side remains a labeled model assumption.
4. Meaning of `$0.00*` swaps, historical swap and rollover / triple-swap rates.
5. Historic server clock/DST and instrument-hours changes, not just screenshot `UTC+2` at capture time.
6. Only if needed after searching current connected evidence: exact account currency, historic margin call/closeout rules.

## Research interpretation and next decisions

All seven FX symbols remain equally in scope. Prior replay results are **provisional and unranked**, not verified GatesFX P&L; 2022/23 are training, 2024 previously examined development, 2025 sealed/unread, independent OOS qualification absent. Current screenshot spread sensitivity 2% is an experimental *separate* risk lane, not a live-sizing recommendation. Trade-independent $1,000 accounts cannot be summed into a seven-pair live portfolio.

**Next refinement decision:** Choose an acceptable historical execution cost method: (A) broker-supplied historic STP quote/fill export; (B) documented public bid/ask with stress-bounded hypothetical GatesFX assumptions, strictly provisional; or (C) do both, broker-first if source exists. Then preregister any distinct strategy/cost hypotheses BEFORE initiating a new full replay. Do not repeat the 6,048 old scenario-years merely to regenerate the same artifact.

Production, live orders and the sealed 2025 holdout remain untouched.
