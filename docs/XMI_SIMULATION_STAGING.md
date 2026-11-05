# XMI Forex simulation staging — implementation and release proposal

Checkpoint: 2026-11-05. Production remains unchanged. This is an incremental staging release, not completion of the autonomous trading assignment.

## Audited baseline

- Repository baseline: `192efd2dda301177be624a069adafda9c9cc9d9f` (main, PR #31).
- Next.js 15.5.25 / React 19.1 / Lightweight Charts 5.2.1. Existing XMI UI is in `app/xmi`; calculation helpers are in `lib/xmi*`; legacy offline tools remain in `research/xmi2`.
- Production browser observation: five technical studies enabled, 53 stacked chart markers, 11 enabled structure concepts, default day research preset. These were descriptive classifications, not simulated execution.
- Forex candles use Twelve Data; equities/crypto use Alpaca market data. Forex fetching caches each symbol/timeframe for at least five minutes per instance, so a 1m decision timeframe does not mean 1m delivery.
- Existing `DATABASE_URL` is inherited in preview environments and serves the trading gateway. New simulation code never reads it for persistence and refuses a matching database host.
- Existing `vercel.json` cron entries belong to other gateway programs and are unchanged. Vercel preview deployments do not invoke Cron Jobs ([official documentation](https://vercel.com/docs/cron-jobs/quickstart)).

## Scope delivered

| Milestone | Staging implementation | Remaining work |
|---|---|---|
| 1 — Chart | All technical overlays, markers, structure concepts and automatic patterns off for fresh workspaces. Apply All / Hide All / Reset Chart. Preserve saved selections and structure settings. Strategy selection does not change visualization. | Deployment browser regression recorded separately. |
| 2 — Signals | Four executable v1 families: EMA cross, RSI recovery, prior-channel breakout, EMA + RSI. Immutable SHA-256 configuration versions and deterministic confirmed signals with candle provenance, conditions, risk instructions and stable idempotency keys. All eight legacy XMI presets inventoried as annotation-only. | More families, full clone/editor/archive UX, causal higher-timeframe strategy rules. |
| 3 — Research | Vendor OHLC validation, UTC normalization, duplicate conflict rejection, gap audit, immutable cached datasets. Seeded randomized search (1–32 distinct configurations). 60/20/20 train/validation/holdout, one-bar embargo, top-three validation selection, one frozen survivor evaluated on holdout. Frozen walk-forward windows, parameter neighbors, cost stress and block-sign randomization with Bonferroni correction. | Incremental backfill merge UI, nested walk-forward reoptimization, multi-regime evidence expansion. |
| 4 — Execution | Reconstructed historical market orders from confirmed signals, next-bar modeled fills, long/short, margin, pip conversion, conservative spread/slippage, commission, stop/target, partial exits, breakeven, trailing amendments, timed/opposite-confirmation exits and UTC financing approximation. Independent balance/risk accounts and complete event journal. | Limit orders, broker-specific swaps, non-USD accounts, fresh-quote forward fills, portfolio/currency correlation controls. |
| 5 — Jobs | Persistent optimistic transactions, unique job IDs, worker leases, bounded candidate steps, resumable cursor, retry limits, pause/retire of pending jobs, kill switch, daily on-demand report and CSV/JSON exports. | No unattended scheduler installed. No automatic daily delivery. |
| 6 — Forward | Separate 30-day/50-trade and swing 90-day/50-trade gates. OHLC replay is explicitly prohibited from creating forward-paper fills. Historically qualified results remain paused pending a verified fresh-quote worker. | Actual forward worker, observation history, automatic promotion and degradation execution. |
| 7 — UX | Responsive dedicated `/xmi/simulation` workspace, dashboard, style leaderboards, registry, account equity, inspectable confirmations/events and reporting. | Full original acceptance checklist and separate production approval. |

## Execution assumptions and limits

- **All results are historical reconstruction.** No external broker-demo or real orders exist in this engine. Legacy gateway execution imports are absent from `lib/xmi-sim`.
- Default model: 2 pip full spread, 0.3 pip adverse slippage, USD 3.50 per standard lot per side, USD account currency, 100,000-unit contract, minimum/step 1,000 units, 30:1 leverage. These are explicit conservative research assumptions, not a broker quote or a verified specification.
- Financing: 6% annual notional debit, approximate UTC midnight weekdays, Wednesday triple. Actual broker rollover time, positive swaps and holiday schedules are not available.
- Spot OHLC does not include historical bid/ask, order-book depth or intrabar sequence. Stop and target in one candle resolve to the stop first. Gaps through a stop fill at the worse opening price with slippage. Stop updates apply to subsequent candles. Intrabar equity uses pessimistic adverse marks. Event exit timestamps represent the containing candle's close, not an observed tick fill.
- EURUSD, GBPUSD, USDJPY, USDCHF, AUDUSD, USDCAD, NZDUSD are supported. USD-base pairs convert quote P&L using contemporaneous price; USD-quote pairs need no third rate. Crosses and other account currencies are rejected pending verified conversion inputs.
- Data gaps never receive invented candles. Plausible weekend closures are labeled; other gaps block qualification. Vendor acquisition is separate from independent broker authentication.
- Trial identities include dataset, immutable configuration and account/risk. Counts do not include duplicated job submissions. Repeated signals use an idempotency identity stable across a later dataset extension.
- Holdout time ranges are reserved before evaluation across symbol/timeframe. Reuse or overlap, including after an ambiguous crash, removes the untouched designation. Rejected training configurations remain recorded.
- Qualification requires positive cost-adjusted expectancy, PF strictly above 1.5, drawdown strictly below 10%, at least 200 distinct completed holdout trades, passed risk/data/walk-forward/stability/cost gates, reconciled ledger and multiple-testing check. Synthetic data cannot qualify. Insufficient samples keep the explicit INSUFFICIENT EVIDENCE label.
- Historical qualification does not establish forward success. Starting forward execution is blocked until an observed, fresh-price path and persistent unattended worker are verified.

## Persistence and authorization

- New dedicated Neon project `xmi-forex-simulation-staging`, project ID `autumn-frog-40434821`, branch `br-cool-lab-bbrehpu6`, database `xmi_simulation`. It contains no copied production/customer rows.
- Migration: `docs/xmi-simulation-schema.sql`; tables `xmi_sim_guard`, `xmi_sim_state`, `xmi_sim_datasets`. Runtime checks an independent simulation-only guard and exact environment marker. Completed results are appended through application controls. Database administrators retain normal administrative capabilities; this is not a cryptographic append-only ledger.
- State changes use compare-and-swap revisions and bounded retry. Each candidate and final account journal is saved atomically with job progress. A timeout before commit recomputes deterministically; no existing completed run is credited twice.
- State storage is a bounded JSON checkpoint document, suitable for this first single-manager staging release. High-throughput unattended operation requires normalized append-only event/job tables and pagination before expanding concurrency or retention. Current job cap: 40 retained jobs, three queued/running, 32 configurations per job; maximum checkpoint JSON 12 MB.
- `XMI_SIM_DATABASE_URL` has no fallback. `XMI_SIM_ENABLED`, `XMI_SIM_ENVIRONMENT_ID`, exact preview branch and the database guard must all pass. Production is refused even if local-development override is set.
- Management key is separate from the feed. `XMI_SIM_ADMIN_KEY` is server-only and branch-scoped, readable by the project owner in the Vercel environment settings. Enter it into the staging management sign-in. Do not put it in a URL, browser local storage, screenshots, or source control.
- Management login issues a six-hour HttpOnly, SameSite=Strict cookie scoped to the simulation API; HTTPS uses Secure. Mutations require an exact same-origin Origin header. Feed cookies do not authorize private ledgers or controls. Client bundles were scanned for the new secret values.
- Preview branch overrides `TRADING_ENABLED=false`, `KILL_SWITCH=true`, `TRADE_STATE_DB_ENABLED=false`. Production settings, broker accounts, balances and existing scheduled programs are unchanged.

## Provider, compute and cost envelope

- Shared **new research workload** budget: at most 24 reserved provider requests per UTC day, no more than four distinct pair/timeframe requests per rolling minute, one refresh per pair/timeframe per five minutes. Failed calls keep reservations to prevent retry storms. Requests ask for up to 5,000 bars; actual returned depth is audited, not presumed.
- Existing public-chart and unrelated workloads are not coordinated by this new research quota. A verified provider-account-wide quota service remains necessary before unattended scale-up. Reserved request counts are not an invoice or independently verified billed-credit count.
- Provider output range and credit semantics: [Twelve Data history](https://support.twelvedata.com/en/articles/5214728-getting-historical-data), [credit accounting](https://support.twelvedata.com/en/articles/5615854-credits).
- Reuse the existing Vercel project. New route limit: 30 seconds per bounded step; no permanent serverless request. Neon compute min/max is 0.25 CU in the existing account; account policy did not permit an explicit suspend-interval change, so its returned default is retained. No plan upgrade or additional paid worker subscription was purchased.
- Actual invoice pricing, remaining account allowances and provider subscription limits were not available in this audit. Incremental invoice cost is therefore not asserted as zero. Observed resource use, daily request cap and concurrency bounds are shown separately from dollars.
- Next infrastructure decision: choose a minimal isolated scheduled worker that can reach the protected preview, price it against actual account allowances, and verify scheduled runs/checkpoint recovery before enabling unattended research. Do not reuse the production cron program for this staging engine.

## Verification commands

```sh
npm run test:xmi
npm run test:xmi-simulation
npm run build
# Requires only the dedicated simulation environment in ignored .env.local:
XMI_SIM_INTEGRATION_TEST=true node --env-file=.env.local tests/xmi-simulation-db.integration.mjs
```

The database integration test uses an independent `verification-<uuid>` namespace and synthetic fixtures. It proves concurrent updates, checkpoint reload, injected-crash recovery, duplicate prevention and unchanged main research namespace. Its fixtures are not exposed through the research dataset API and cannot count as performance evidence.

## Release proposal

Keep this as a draft PR and protected preview. Review the implemented chart milestone and research/simulation foundation. Before any production release of the full requested platform: complete and verify the forward fresh-quote adapter, actual scheduler, normalized ledger/job persistence, all remaining execution types and security/browser acceptance gates. Any real-money functionality remains a separate proposal requiring explicit approval.
