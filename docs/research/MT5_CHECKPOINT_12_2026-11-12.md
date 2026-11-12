# XMI MT5 final build-phase checkpoint 12 — verified scope and remaining gaps

Branch: `research/xmi-mt5-adapter-20261112`. Read the current branch, plan, checkpoint 11, risk/replay modules and all 34 capability ledger entries before changes.

## New deliverable this invocation
- `scripts/mt5_capability_audit.mjs` commit `8f688b2ed3935f331e914e1dce157d74991edf55`: deterministic, no-market-data ledger audit; rejects missing/duplicate/unknown feature IDs and unsupported verified status.
- `tests/mt5-capability-audit.test.mjs` commit `14c3bac31aa621a83dd95304596e3dc9d35fc36a`: four synthetic tests committed, **not executed**.
- Matrix updated commit `7f36772263d7d267d8e05d7b231c75afc8485ae3`.
- Source hashes: see GitHub commit/tree blobs; no raw market or trade data committed.

## Exact 34-feature status
**Verified with exact repository CI: 0.** **Implemented but unverified: 18.** **Not implemented: 16.** These are code-evidence ledger classifications, not MT5 platform parity claims.

| Status | Feature IDs |
| --- | --- |
| Implemented, unverified | terminal_status, account_snapshot, symbol_catalog, quotes, ticks, candles, market_sessions, order_book_read, positions_read, deals_history, volume_margin_rules, risk_engine, reconciliation, trade_journal, multi_broker, local_bridge, quality_security, holdout_guard |
| Not implemented | market_depth, profit_margin_calcs, trade_action_schema, execution_preflight, indicators_builtin, indicators_custom, charting, drawing_objects, signals_alerts, expert_advisors, strategy_tester, optimization, custom_symbols, economic_calendar, multi_account, broker_gate |

Full per-feature evidence, platform surfaces and limitations are preserved in `MT5_FULL_PLATFORM_CAPABILITY_MATRIX_2026-11-12.json`. Run `node scripts/mt5_capability_audit.mjs` for a deterministic machine-readable summary. This new script has not been executed against an exact branch checkout.

## Research validity and safety
- Historical import, tick parser, bar session audit, Windows-local mockable reader, bounded local exporter, contract comparison, sanitized 2026-only deal accounting, descriptive replay bridge, independent $1,000 risk feasibility and seven-pair synthetic regression are committed. The risk feasibility module is **not wired into funded replay**; descriptive observations are not fills or backtests.
- EURUSD GBPUSD USDJPY USDCHF AUDUSD USDCAD NZDUSD remain equally scoped; gold is separate. No new scenario-year calculations or authenticated historical tests performed. Archived 6,048 training calculations were not rerun.
- 2022/23 training and exposed 2024 development only. The 2025 holdout, including mixed-year CSV rows, was not accessed.
- GatesFX historical Bid/Ask, fills/slippage, lot increments/max, actual margin/stopout and swap terms remain unauthenticated; all cost-based strategy conclusions **PROVISIONAL / UNRANKED**. The 2% lane is experimental and not authorized for execution.
- Existing TradeLocker, Alpaca/Twelve Data, production charts/routes and Vercel deployment unchanged. No branch merge, terminal login, orders, paper trades, broker exports or private data publication.

## CI/terminal blockers and next priorities
- GitHub connector could read and commit branch contents; previous local checkout failed DNS resolution. Exact Node/Python repository test execution and GitHub Actions success have **not** been observed. Last inspected commit `acaf7858ea04dbc9d1bb8e18fc0991bb25aca797` reported only a pending Vercel combined status, which is not MT5 CI evidence.
- Windows-local MetaTrader5 SDK, broker terminal, MQL5 EA/tester/chart APIs, economic calendar and DOM availability are not authenticated. Official Python API does not implement the entire MT5 desktop feature set.
- Priorities: (1) execute exact branch Node/Python tests and fix verified failures; (2) connect an authorized Windows-local read-only terminal, privately export hashed small 2026-only or permitted 2022/23 sample; (3) reconcile authentic GatesFX volume/margin/swap/spread/stopout; (4) connect offline risk lanes to causal next-bar research with independently funded scenarios; (5) implement and test missing read-only DOM, calculators, indicator parity and chart/watchlist routing; (6) design MQL5-native tester/EA/optimization interfaces without enabling order execution.
