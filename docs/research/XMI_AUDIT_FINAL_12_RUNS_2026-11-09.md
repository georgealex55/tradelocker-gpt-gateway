# XMI 2.0 — Twelve-checkpoint research audit: final provisional report
Date: 2026-11-09 UTC. Branch: `research/xmi-amd-seven-pair-fxcm-replay-20261107`. **PROVISIONAL / UNRANKED — GatesFX gate 6B not met.**

## Evidence boundary
Read actual checkpoint 11, checkpoint 10, baseline `docs/XMI_AMD_SEVEN_PAIR_HISTORICAL_REPLAY_2022_2023.md`, and current GitHub regression and continuity-auditor sources. This final checkpoint is an audit/report commit, not a new market replay or a passing-test claim. Previous checkpoint reports describe GitHub changes but do not establish repository-level test execution. The 2022–2023 baseline is historical work from *before* this twelve-run audit.

## Historical replay evidence: baseline, not newly rerun
Baseline Actions: https://github.com/georgealex55/tradelocker-gpt-gateway/actions/runs/42441113590
Independent USDJPY ledger audit: https://github.com/georgealex55/tradelocker-gpt-gateway/actions/runs/42441343193
The baseline documents **2,688 scenario-year replays** (192 per pair-year, seven pairs, two years), with 1,017,924 M5 rows. These are independently funded modeled scenarios, **not** independent OOS experiments or an aggregate portfolio. **New actual historical market replays during checkpoints 01–12 evidenced here: 0.** No new strategy family was empirically benchmarked in this series.

| Pair | 2022 M5 baseline | 2023 M5 baseline | Matched same-day funded configurations >=20 trades in each year | Positive net in both training years | Best two-year diagnostic USD, separate $1,000 starts |
|---|---:|---:|---:|---:|---:|
| EURUSD | 73,214 | 73,134 | 30 | 0 | -17.89 |
| GBPUSD | 72,664 | 73,017 | 32 | 0 | -10.65 |
| USDJPY | 72,986 | 73,153 | 29 | 8 | +124.68 |
| USDCHF | 71,768 | 72,771 | 31 | 0 | -52.94 |
| AUDUSD | 72,577 | 72,853 | 29 | 0 | -6.52 |
| USDCAD | 72,324 | 72,553 | 32 | 0 | -6.90 |
| NZDUSD | 72,209 | 72,701 | 32 | 0 | -12.66 |
| Total | 507,742 | 510,182 | 215 | 8 | NOT A PORTFOLIO |

No cross-pair best-case profits should be summed as a tradable portfolio; all seven remain equally in scope. The positive USDJPY historical comparator is not a winning/qualified strategy. Its baseline 1% same-day AMD model: 2022 26 trades, +$61.58 net, PF 1.692, closed-equity DD 2.18%; 2023 46 trades, +$63.09 net, PF 1.358, closed-equity DD 4.24%. The 2023 PF fails >1.5; 72 training trades are not >=200 independent OOS trades. Stress +50% / +100% modeled costs stayed positive in both folds in the prior baseline, but these costs were not GatesFX verified.

## Data integrity / changes in this series
- FXCM source UTC M1 bid/ask, full-five-minute M5 aggregation; explicit **independent Dukascopy 2023 ISO week 27 M5 bid-only substitution** for FXCM's header-only missing week, producing a **mixed-provider** 2023 training fold. The M5 bid-only CSV cannot itself prove upstream substitution; source manifests/hashes and licenses must be retained and checked externally.
- Parser guards added/revised across checkpoints: crossed bid/ask opening quotes, explicit non-UTC offsets, missing/blank AskOpen, requested-year isolation. Checkpoint 11 repaired malformed missing-ask-column synthetic fixture.
- Read-only M5 continuity auditor and synthetic tests for continuity and DST/session handling were committed. Synthetic calendar expectations do not prove the trading engine uses them.
- **Actual repository-level execution of committed suites: not evidenced; do not count as passing.** Prior checkpoint 06 reported nine local tests against a reconstructed equivalent, not a checkout. No source-data continuity scan was evidenced in this series.
- Historical vendor hashes, licenses, exact source manifests, spread time series, swap and tick fills: not independently verified in this audit. No invented prices or broker fills.

## Account and risk gates
Every modeled funded scenario must independently start at $1,000. Preserve separate 0.25%, 0.50%, 1.00%, fixed 0.01-lot lanes and **2.00% experimental high-risk only**; no pooling, no live sizing authorization. No newly executed comparable 2% results are evidenced; its profit, forced-minimum, rejected/shadow, drawdown, margin and forced-liquidation outcomes are **not measured here**. A baseline's 192 configurations per symbol-year must not be assumed to include all newly requested risk lanes. Maintain 10% drawdown halt, capital contention, lot step/minimum, overnight swap unknown/unpriced, next-bar causal fills, no arbitrary minute caps; mark unsupported aspects unknown rather than passed.

**GatesFX Standard STP gate 6B: FAIL / UNVERIFIED.** Zero advertised commission and headline up-to-500:1 leverage are not instrument-specific evidence. Need authenticated account-specific seven-symbol contract size, minimum/step lots, actual leverage and initial/maintenance margin, margin-closeout terms, bid/ask historical spread distribution by session/date, execution slippage evidence, and swap schedules. Without these, do not issue definitive profitability rankings, verified broker execution claims, or live qualification.

## Research validity
2022 and 2023 are training folds, 2024 is **previously exposed development**, not fresh OOS. **2025 holdout remains sealed/unread by this series**, and must remain so until explicit separate authorization following preregistration. No candidate has demonstrated genuinely independent OOS positive expectancy, PF >1.5, drawdown <10%, and >=200 independent OOS trades. No strategies qualified. Existing/new/hybrid momentum, scalping, breakout and liquidity-sweep hypotheses require preregistered parameter grids and fair identical-cost replay before comparison; no such new empirical results claimed.

## Audit trail / disposition
Checkpoint reports 01–11 under `docs/research/XMI_AUDIT_CHECKPOINT_2026-11-08_RUN*.md`; inspect Git history for exact commits and test changes. This report is the final human-readable checkpoint. No vendor raw data committed, production merges, deploys, real trades, broker credentials, or chart changes performed by this final checkpoint.

**Unblock sequence:** (1) execute all `test_xmi_*.py` suites on checked-out branch and capture command, SHA, environment and full logs; (2) acquire authorized 2022–2023 source files/manifests and verify hashes, quote completeness, DST and all seven pair-year gaps; (3) obtain account-specific GatesFX contract/execution evidence; (4) preregister strategy families and cost/risk lanes including separate 2%; (5) rerun fair independent $1,000 scenarios, report rejected/forced-minimum/shadow and funded ledgers separately; (6) plan genuinely independent OOS without opening 2025 before authorization.
