# XMI MT5 checkpoint 07 — symbol reconciliation and structured-array repair

**Status:** Source, synthetic tests, and capability matrix committed on research branch. **Tests not executed; real MT5/GatesFX terminal not connected; no exports or replay.**

## Actual changes
- `scripts/mt5_readonly_terminal.py` commit `23ace0f23aa8027c8c3e71f2a1fbe8ee1a2b3132`: fixes the milestone-06 likely NumPy structured-array bug by preserving named dtype fields and converting NumPy scalars to Python scalars. Non-named tuple records fail closed. Affects read-only bars, ticks, orders, positions and deal records.
- `scripts/mt5_symbol_reconciliation.py` commit `a671912c0ad8a14479bab70b01fb68ddaf1875fa`: compares MT5 `symbol_info` fields against existing user-provided TradeLocker snapshots for EURUSD, GBPUSD, USDJPY, USDCHF, AUDUSD, USDCAD, NZDUSD, and XAUUSD **separately**. Captured screenshot contract size and min lots only are comparable; lot step/max, swap schedule, stop-out and historical execution remain unknown unless actual broker data arrives. Conflicts never silently default.
- `tests/test_mt5_symbol_reconciliation.py` commit `09209404d286d7d431a76425c81cb28af58383a8`: synthetic structured-array, unknown/conflicting lot rules, seven-pair/gold and historical-unverified assertions.
- 34-feature capability matrix updated: `docs/research/MT5_FULL_PLATFORM_CAPABILITY_MATRIX_2026-11-12.json`. No new broker-verified status.

## Exact broker evidence and limitations
- Source: `docs/research/XMI_GATESFX_EIGHT_INSTRUMENT_SPECS_2026-11-09.md` and `docs/research/xmi-gatesfx-evidence-ledger-20261110.json`; these are user-provided Nov 8 TradeLocker display screenshots, **not** authenticated MT5 `symbol_info` or dated fills.
- Seven FX snapshots each show contract size 100,000 base units, minimum lot 0.01, displayed margin 0.20% and displayed leverage 500. Gold separately: 100 oz, minimum 0.01, 0.50% margin, leverage 200. **Do not infer step, max lots or margin tiers**.
- Snapshot 0.00* swap entries have unresolved asterisk; USDCHF swap not captured. Neither zero historical swap nor zero slippage is verified.
- Actual MT5 `symbol_info`, `account_info`, server identity, stopout thresholds, dated spreads, historical swap schedule, and execution fills are **unavailable** in this run. This comparator does not authenticate or request them.
- `account.leverage` is only a comparison flag, not evidence of per-symbol leverage or historical margin requirements. No historical spread, slippage or profit rankings changed.
- The NumPy fix was code-reviewed but not runtime-tested with real NumPy/MT5; tests are committed, **not executed**. The exact repository suite and GitHub Actions CI are unverified.
- Existing CLI payload still requires end-to-end validation against the JS importer. Parent directory symlink/race hardening remains pending.
- 2025 holdout not read or queried. Existing 6,048 2022–2023 training scenario-years preserved, 2024 development unchanged, gold separate. No real/paper trades, broker credentials, live order APIs, production chart/feed changes, branch merge or Vercel deploy.

## Reproducible verification
```sh
python -m unittest discover -s tests -p 'test_mt5_symbol_reconciliation.py' -v
python -m unittest discover -s tests -p 'test_mt5_readonly_terminal.py' -v
python -m unittest discover -s tests -p 'test_mt5_export_cli.py' -v
```

## Next milestone 08
Implement a synthetic/2026-only closed-deals importer with commission, fee, swap and net P&L validation. Reject any 2025 date before reading/parsing source content; do not ingest the old mixed-year CSV. If an authenticated MT5 account/terminal is unavailable, preserve the mocked path and document broker evidence gaps.
