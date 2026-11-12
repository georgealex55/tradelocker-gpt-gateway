# XMI 2.0 → MetaTrader 5 staged adaptation: 12 independently auditable development milestones

**Created**: 2026-11-12 UTC. **Branch**: `research/xmi-mt5-adapter-20261112` (from `research/xmi-amd-seven-pair-fxcm-replay-20261107`). **Status**: planned, not yet executed. This plan is not evidence that any MT5 functionality is integrated.

## Expanded scope (user requested full MT5 platform adaptation, 2026-11-12)

**This 12-run series must plan for the COMPLETE practical MT5 feature surface and produce a working reusable foundation rather than stop at historical CSV import.** A dedicated machine-readable 34-feature matrix is the canonical completeness ledger: [MT5_FULL_PLATFORM_CAPABILITY_MATRIX_2026-11-12.json](MT5_FULL_PLATFORM_CAPABILITY_MATRIX_2026-11-12.json). Mark each capability separately `verified`, `implemented_unverified`, `blocked_external`, `deferred`, or `not_implemented`; include actual code/CI evidence. Never mark unavailable broker features as implemented.

**Required feature families:** terminal connectivity/permissions/version; multi-account/account summaries; symbol discovery/specs, asset suffix mapping, broker sessions; current Bid/Ask tick price, full historical ticks/bars, market depth if provided; active orders, open positions, deals and trade history; P&L, commission, swaps, margin and risk simulations; order type/volume/fill-time policies and idempotent order lifecycle **as future capability design only**; default/custom indicators, MQL5 scripts, Expert Advisors, event handlers, Strategy Tester, visual tick backtesting, optimization and forward-testing controls; chart/view/annotation integration where a local MQL5 bridge is supported; alerts, economic-calendar capability if broker/terminal supports it; resilient Windows-local bridge, UTC/DST, privacy and provenance.

**Multiple integration surfaces:** The official `MetaTrader5` Python SDK provides terminal-local account/symbol/tick/history/depth and trading data; it does **not** expose every GUI/EA/Strategy Tester/MQL5 chart capability. For those, use a Windows-local MQL5 `Expert Advisor` / indicator / script or a documented tester/terminal workflow, clearly separating API availability from app-specific implementation. Do not invent unsupported Python SDK functions. Native MT5 tester and market depth availability are terminal/broker dependent.

**Architecture/parity definition:** XMI remains the central workstation; existing TradeLocker, Alpaca/Twelve Data routes and charts stay intact. Add an opt-in MT5 source with a source-certified schema, a Windows-hosted terminal reader and a local communication/data interface. An operational chart should show MT5 symbol/timeframe/price depth or a clear unsupported state; never silently fall back to other provider prices with a false `MT5` label. Prefer adapter-backed interface parity and code reuse over a wholesale UI rewrite.

**What 12 hourly runs can verify:** Core market/account/closed-trade historical import, parsers, risk calculations, guards, SDK wrapper mocks, build/CI and capability registry; additional native GUI, MQL5 EA, Strategy Tester, economic-calendar, order-management, indicator-buffer and DOM integration may need actual Windows terminal and broker data to validate. Any not demonstrably implemented goes in the final report as a named remaining item, not a claim of fully implemented software.

**Execution permission boundary:** Supporting the schema and UI for orders, pending order types, position management and automated EA concepts is a **design and synthetic-test task** during this series. Do not call `order_send`, submit paper/live trades, install running trading EAs or enable automated execution. Later connection of trading capabilities requires separate explicit approval and staging validation. This scope expansion is not live trading authorization.

**Practical implementation order:** Within every run, review the entire matrix, choose the highest-priority uncovered core capability after last committed milestone, implement code/test and update evidence. A missing Windows terminal blocks live validation, not offline adapter progress. Milestone 12 must include a gap table for **all 34 capabilities** distinguishing actual verified implementations, limited implementations, unavailable platform/broker features and later stages. No deadline-based assumption of completion.

---

## Purpose and architectural constraints

Add an **opt-in read-only MT5 data/research adapter alongside** existing TradeLocker and Alpaca/Twelve Data routes. Do not replace production feeds or trading routes. The Next.js app is deployed on Vercel; official MT5 Python integration communicates with a **locally running MetaTrader 5 terminal**, not a Vercel-hosted MetaTrader terminal. Prefer a separate Windows-local Python reader/exporter, plus reproducible offline CSV/JSON import and a normalized source-specific interface in XMI. Use mock MT5 SDK in Linux CI; do not require terminal access for deterministic tests.

Official MT5 Python integration references:
- https://www.mql5.com/en/docs/python_metatrader5
- https://www.mql5.com/en/docs/python_metatrader5/mt5copyticksrange_py
- https://www.mql5.com/en/docs/python_metatrader5/mt5symbolinfo_py

Existing code entry points to audit first: `lib/xmiMultiProvider.mjs`, `lib/xmiLiveProvider.mjs`, `lib/xmiHistoricalFile.mjs`, `lib/xmiHistoricalReplay.mjs`, `lib/xmiResearchHoldout.mjs`, `lib/xmiDataQuality.mjs`, `lib/tradeGuard.js`, `lib/risk.js`, `scripts/xmi-amd-fxcm-seven-pair-replay.py`, and `docs/research/xmi-gatesfx-evidence-ledger-20261110.json`. Read actual current paths and newest checkpoint before changing assumptions. The existing TradeLocker execution/state machine remains untouched and disabled for live autonomous execution.

## Milestone sequence — one independently verified increment per scheduled run

1. **Audit & contract:** identify current feed/import/risk boundaries; create explicit MT5 data contract and machine-readable progress/checkpoint with source SHA and key blockers. Do not claim MT5 connected.
2. **Adapter skeleton:** optional MT5 historical-source selector, typed normalized bars/ticks/spec metadata and fail-closed source labeling without altering deployed source routing.
3. **Bid/Ask ticks:** parse/export offline MT5 tick Bid/Ask, UTC timestamps, duplicate/crossed quote checks, missing spread alerts and source hashes; test synthetic inputs.
4. **Bars and session time:** map MT5 M1/M5 bars to existing canonical XMI bar structure; verify point/pip units, timezone/DST and no incomplete-bar lookahead; synthetic tests.
5. **Windows-local MT5 Python reader:** isolate `initialize`, `account_info`, `symbol_info`, `copy_rates_range` and `copy_ticks_range` behind read-only methods, optional local terminal, no order submission; dry mockable interface.
6. **Offline export CLI:** bounded symbol/date/request controls, permission and source metadata, timestamped manifests, local-only storage, CSV/JSON schema and SHA-256, no raw broker data committed.
7. **Contract and GatesFX mapping:** compare MT5 symbol_info fields (contract size, tick value, min/step/max lots, margin, swap rules) against already-captured seven FX screenshots; record conflict/unknown, never silently trust mismatched servers.
8. **Closed-trade import:** read permitted 2026-only sanitized historical deal/position exports (if accessible), compare commission/swap/net P&L with XMI accounting; DO NOT open, parse or derive results from any 2025 holdout rows, including earlier mixed-year raw trade CSV.
9. **Backtest integration:** consume MT5 offline normalized bars with unchanged causal next-bar entries and per-scenario independent USD $1,000 capital; compare source-consistent benchmark without claiming historic GatesFX fills.
10. **Risk invariants:** test 0.25%, 0.5%, 1% and fixed 0.01 lot separately plus experimental 2% lane; min/step lots, free margin, stop-out, spread/slippage stress, rollover as unknown until verified, 10% DD halt; no shared-capital portfolio.
11. **Cross-source regression:** CI, fixtures and documentation covering all seven FX pairs, 2022/23 training vs 2024 exposed-development labels, no 2025 discovery, data access errors, Windows availability, fallback/fail-closed, no prod API changes.
12. **Final read-back audit:** deliver human and machine-readable completion report with actual tests, commits, changed files, branch CI, MT5 import/terminal status, unresolved broker fields, GatesFX gate status and measured results only if performed. Leave production unchanged.

## Non-negotiable guards

- Read-only/historical import **only**, even if the user ultimately wants MT5 execution. No `order_send`, live or paper trading, account creation, deposits, login credential harvesting, production chart/API changes, Vercel deploy, branch merge or destructive edits.
- **Do not ask for earlier GatesFX screenshots again.** Reuse `docs/research/XMI_GATESFX_EIGHT_INSTRUMENT_SPECS_2026-11-09.md` and the canonical evidence ledger. User has confirmed access to both MT5 and TradeLocker and base currency USD.
- If no actual connected Windows MT5 terminal or broker server is available, implement mocks, offline data ingestion, safety checks, and documented instructions without pretending to have verified a connection or broker-exported history. Separate technical completion from genuine broker verification.
- Preserve current 6,048 completed 2022–2023 training scenario-year calculations; run new historical replay **only** on actual new data, meaningful code changes, or predeclared distinct hypotheses. Keep seven majors equally in scope; gold remains separate.
- **Keep entire 2025 holdout sealed/unread**, including archived datasets, raw mixed-year user trade CSV and indirect discovery. Old mixed-year CSV must not be ingested in this series; use synthetic or verified 2026-only prefiltered fixture if available and safe.
- Record raw source-file SHA hashes, local data retention/licensing, UTC/DST assumptions and query/source provenance; never push vendor OHLC/ticks, statements, private account/trade IDs, passwords, tokens or screenshots to a public repo. Only sanitized metadata/tests may be committed.
- Every run must produce **one independently verifiable improvement**, commit to dedicated branch if permitted, and a per-run checkpoint. If source/connector is missing, log evidence and complete a different scoped safe milestone rather than claiming success. No invented performance, tests or commits.
- Before each run, inspect latest actual state so reruns don't duplicate work. Warn only on consequential findings/blockers; final comprehensive report on milestone 12.

## Evidence current as of plan creation

- Existing user TradeLocker seven FX + gold snapshots: `docs/research/XMI_GATESFX_EIGHT_INSTRUMENT_SPECS_2026-11-09.md`.
- Completed 6,048 scenario-year, provisional, **unranked** screenshot sensitivity replay: `docs/research/XMI_GATESFX_RERUN_REPORT_2026-11-09.md`.
- Synthetic evidence guard CI successfully run: https://github.com/georgealex55/tradelocker-gpt-gateway/actions/runs/42896814461
- Historical GatesFX STP Bid/Ask series, real execution slippage and effective account closeout rules are not yet verified; do not rank winners.
