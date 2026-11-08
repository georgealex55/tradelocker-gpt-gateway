# XMI 2.0 — Seven-major Forex AMD historical replay, 2022–2023

**Research only.** Completed 2026-11-07 (UTC 2026-11-08). Research branch `research/xmi-amd-seven-pair-fxcm-replay-20261107`. No production changes or broker orders. **2025 sealed holdout unread.**

## Reproducible completion evidence

- Successful all-seven historical replay GitHub Actions run: https://github.com/georgealex55/tradelocker-gpt-gateway/actions/runs/42441113590
- Pull request (draft, unmerged; targets previous AMD research branch, **not production/main**): https://github.com/georgealex55/tradelocker-gpt-gateway/pull/34
- `scripts/xmi-amd-fxcm-seven-pair-replay.py`: public FXCM minute bid/ask archive reader, validated 5-minute bid candle conversion, documented independent Dukascopy M5 replacement for 2023 missing week 27.
- `.github/workflows/xmi-amd-seven-pair-replay.yml`: seven independent 2022–2023 replay jobs, each verifying 11 synthetic AMD engine regression tests and uploading per-symbol complete 192-configuration-year JSON results.

## Source integrity

Historical price source was public FXCM UTC M1 BID/ASK bars, resampled only when all five source minutes formed an exact complete M5 bar. **FXCM's entire 2023 ISO week 27 file was just a header for all seven pairs.** Original third-party Dukascopy M5 BID bars for this period were independently downloaded and validated, excluding weekends and provider overlap. The 2023 history is explicitly **mixed-provider**, not a homogeneous FXCM history. Dukascopy data is not broker-specific GatesFX STP historical execution. A hybrid-source 2023 replay is sufficient for *training research diagnostics*, not conclusive execution validation. Raw data is not committed to Git.

| Pair | 2022 valid M5 | 2023 valid M5 | Matched funded same-day configurations with ≥20 trades in each year | Positive net in both years | Best 2-year matched net (diagnostic USD) |
|---|---:|---:|---:|---:|---:|
| EURUSD | 73,214 | 73,134 | 30 | 0 | −17.89 |
| GBPUSD | 72,664 | 73,017 | 32 | 0 | −10.65 |
| USDJPY | 72,986 | 73,153 | 29 | **8** | **+124.68** |
| USDCHF | 71,768 | 72,771 | 31 | 0 | −52.94 |
| AUDUSD | 72,577 | 72,853 | 29 | 0 | −6.52 |
| USDCAD | 72,324 | 72,553 | 32 | 0 | −6.90 |
| NZDUSD | 72,209 | 72,701 | 32 | 0 | −12.66 |
| **Total** | **507,742** | **510,182** | **215** | **8** | Not aggregated as a portfolio |

Totals: **1,017,924 actual validated five-minute candle rows** over 14 symbol-years, **192 scenario accounts per symbol-year = 2,688 scenario-year replays**. Each account independently starts with USD $1,000. Summing per-pair best results **does not** represent a single tradable account or combined portfolio.

## Best same-configuration result: USDJPY

- Accumulation: complete 00:00–05:55 Europe/London Asian range, followed by sweep in allowed London window
- Entry: closed-bar directional range-mid reclaim, later retest, enter at next contiguous M5 open
- Protective stop: sweep invalidation buffer; 2R target; same-day NY session flatten (not an arbitrary holding-minutes limit)
- Risk: 1% of *current* $1,000-starting equity, sized only if minimum lot and margin constraints are met
- Modeled spread: JPY 0.02 (2 pips); adverse slippage JPY 0.003 each side; commission $0
- **2022:** 26 funded closed trades, **+$61.58 net**, ending approximately **$1,061.58**.
- **2023:** 46 funded closed trades, **+$63.09 net**, ending approximately **$1,063.09**.
- Two-year side-by-side **+$124.68** is an *arithmetic diagnostic*, **not compounding** of one account.
- Other risk/exit variants may produce correlated positive both-year outcomes; **8 of 29 sampled same-day USDJPY configurations** were positive in both years.

## Qualification and limitations

**No strategy is approved or qualified for production or live execution yet.** Candidate USDJPY currently has only **72 matched training-year trades**, no newly independent OOS observations, unverified GatesFX Standard STP historical spreads/slippage and account-specific contract/leverage/margin parameters. User's earlier strict strategy-qualification gates were OOS net expectancy positive, PF >1.5, max drawdown <10% and ≥200 OOS trades; none has been shown to meet those requirements.

The frozen runner counts only funded and resolved positions. Unfundable, occupied, shadow-only, and unpriced overnight swap cases are separately recorded, not added to funded net P&L. The main comparison uses same-day funded risk-fit lane only. Candle stop-target conflict resolved conservatively stop-first, but intraminute/tick fills, dynamic spreads, news, swap, margin maintenance, market impact and real execution latency are not independently verified.

**Next:** independent quote/contract validation; 2022–2023 source sensitivity and cost stress on USDJPY; freeze a candidate; 2024 only as already-observed development, **leave 2025 sealed** until a proper untouched final validation plan.
