**TradeLocker Portfolio-144 — completed research, September 28, 2026 (Chicago)**

Corrected run `portfolio-144-v1-f2b6fafd25dde06b7f7f` completed all 144 combinations with zero failures. These are 48 trading policies scored three ways. **No configuration met the pre-registered eligibility criteria; no demo-forward recommendation is produced.**

Source branch: `research/portfolio-144`; evaluated commit: `ce98442c1b72ffc7d3c88d1996a85fa3601fd707`. Starting capital is $200 per simulation. Requested scoring history: January 1, 2024 through September 25, 2026 at 21:00 UTC. The held-forward results below cover 2025-05-14T10:30:00Z through 2026-09-25T21:00:00Z; they are not the full-period descriptive results.

| Risk policy | Held-forward trades | Ending balance | Return | Profit factor | Expectancy R | Realized max drawdown | Stress trades | Stress return |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| 0.75% | 7 | $200.02 | +0.0124% | 1.0045 | -0.0067 | 1.9833% | 0 | +0.0000% |
| 1.00% | 40 | $197.57 | -1.2134% | 0.9405 | -0.0523 | 9.7451% | 18 | -7.8564% |
| Adaptive 0.75–1.00% | 19 | $194.99 | -2.5061% | 0.7517 | -0.1275 | 4.5986% | 9 | -2.3180% |

Within each risk group, the 16 policies produced the same held-forward performance, although skip counts can differ. All pair-specific threshold fits fell back to ADX 20 because the training trade-count requirement was unmet. The 0.75% stress result contains zero trades; its unchanged balance is not evidence of robustness.

Every policy failed the expectancy/profit-factor gate, stress gate, window-consistency gate, and gain-concentration gates. Thirty-two of 48 policies also had fewer than 30 validation trades and insufficient pair distribution. The 1% policies had 40 validation trades but lost money and fell to −7.8564% under stress costs. Minimum-lot skips were 132–133 at 0.75%, 79–80 at 1%, and 112–113 with adaptive risk.

**Collection and data-quality evidence**

All 222 planned 14-day requests completed: 74 for each pair. Ten transient HTTP 400 responses each succeeded on retry. Collection began with a request from December 2, 2023; the first returned bar was December 3 at 22:00 UTC. Each pair reaches the requested September 25, 2026 21:00 UTC endpoint.

| Pair | Raw M15 bars | Retained aligned M15 bars | Removed bars | Complete H1 warmup bars |
|---|---:|---:|---:|---:|
| USDCHF | 70,074 | 69,328 | 746 | 456 |
| EURUSD | 69,806 | 69,328 | 478 | 456 |
| GBPUSD | 69,802 | 69,328 | 474 | 456 |

**The broker history is not gap-free.** A second pass re-requested 145 affected one-day windows and recovered no additional bars or changed OHLC prices. Material November 2024 gaps in EURUSD and GBPUSD remain. The pre-registered harmonization rule removes an entire H1 hour from all pairs when any pair lacks a constituent M15 bar: 239 observed incomplete hours are excluded. No candles were invented or forward-filled. The audit also records 183 common gap intervals, including weekends, holidays, and shorter reproducible broker omissions; these are not all claimed to be market closures.

Structural validation passed for ordering, duplicates, candle geometry, completed bars, metadata, requested bounds, aligned timelines, and warmup. The frozen calendar contains 172 events and retains the existing September 27 review declaration. This run checked calendar structure and coverage declarations; it did not repeat a source-by-source historical calendar audit.

**Engineering and execution evidence**

- 25 engineering tests passed, including real indicator DI-unit integration and complete-hour gap reporting.
- The corrected 12-combination pilot passed 300 ledger checks.
- A separate real-data adaptive pilot, C097, passed 73 ledger checks and exercised 1% risk on 14 of 19 validation trades.
- The corrected full matrix passed 11,376 trade-ledger checks across all three result scopes. This count includes repeated scoring objectives; it is not a count of independent trades.
- Research-table readback confirmed COMPLETED, 144 successes, zero failures, and zero eligible configurations.

The final review found that the installed indicator library returns DI as fractions while the research adaptive rule compared the gap against 10. The research-only rule now converts that gap into percentage points before applying the existing 10-point threshold. Shared indicators and Production strategy behavior were not edited. Earlier run `portfolio-144-v1-3192080bc2b2ec30eb46` is superseded and must not be used for adaptive comparisons.

The missing portfolio tables were created only in isolated Neon branch `preview/research/portfolio-144` (`br-bitter-hill-awf49dr0`) using the existing additive migration. No schema change was made to the default/Production database. Runtime checks reported trading disabled and the kill switch enabled. No live orders, Production changes, secret-value changes, or PR merge occurred; PR #2 remains an open draft.

**Reproducibility**

- Frozen dataset input hash: `61e9d2fae987acf428cb8034e04514d7f84ad01e9e1a2f03d606de09ea740c14`
- Evaluated code hash: `2f617a3f2c8bcf420ce65e98de3599498c37ccfa4efbac47b1364e53f4f3bcd6`
- Combined run input hash: `f2b6fafd25dde06b7f7fa52b1b912dfa2fef0450f037e188ea06636d613bb201`
- Evaluated runner commit: `ce98442c1b72ffc7d3c88d1996a85fa3601fd707`.
- Gateway deployment commit (the manifest's sourceCommit): `b8745f985f98ef6dafb7db71aa02b8e9f3c154f6`. This identifies the Preview API deployment, not the evaluated runner source.
- Base costs: 2-pip spread plus 0.2-pip slippage per side. Stress: 2.5-pip spread plus 0.4-pip slippage per side.
- Model limits: BID/OHLC proxy; realized-balance drawdown; no commissions, financing, or margin model. Prior strategy-tuning overlap means the held-forward windows are not claimed to be untouched out-of-sample data.

**Evidence links**

- [Collection workflow](https://github.com/georgealex55/tradelocker-gpt-gateway/actions/runs/36505438266)
- [145-window gap recheck](https://github.com/georgealex55/tradelocker-gpt-gateway/actions/runs/36506041404)
- [Corrected pilot, adaptive check, and full-matrix workflow](https://github.com/georgealex55/tradelocker-gpt-gateway/actions/runs/36507761212)
- [Draft PR #2](https://github.com/georgealex55/tradelocker-gpt-gateway/pull/2)
- [Authenticated Preview dashboard](https://tradelocker-gpt-gateway-fnpid8533-georgealex1925-2750s-projects.vercel.app/backtests/portfolio-144?runId=portfolio-144-v1-f2b6fafd25dde06b7f7f)
