# XMI regression execution and GatesFX specification verification — 2026-11-09 UTC

Branch: research/xmi-amd-seven-pair-fxcm-replay-20261107
Workflow commit: 0dbab6cef0914cb51c35642b7bedc4a2215da7c3
GitHub Actions run: https://github.com/georgealex55/tradelocker-gpt-gateway/actions/runs/42559748151
Job: 128973339016
Execution: GitHub-hosted ubuntu-latest, Python 3.11, checkout of branch head; synthetic tests only.
Results from actual workflow job logs:
- test_xmi_fxcm_integrity.py: 13 passed
- test_xmi_m5_continuity.py: 9 passed
- test_xmi_fx_session_dst.py: 6 passed
- test_xmi_fx_session_dst_exact.py: 3 passed
Total: 31 passed, 0 failures. These are regression contracts, not real-price replay, historical continuity certification, or strategy-engine DST integration tests.
No 2025 data accessed, no production deployment, no real trades.

GatesFX official public documentation:
- https://gatesfx.com/support/what-is-the-gatesfx-stp-standard-account — STP Standard: zero advertised commission, spreads from 1.0 pip, leverage up to 1:500, MT5 and TradeLocker.
- https://gatesfx.com/leverage-and-margin — published margin call 80%, stop-out 30%, adjustable per-account and per-symbol leverage/margin.
- https://gatesfx.com/instruments — sample spreads explicitly based on ECN Raw account; NOT usable as STP Standard quotes.
These are broker-published general terms, NOT authenticated account-specific instrument verification.

Gate 6B remains BLOCKED: need authenticated Standard STP instrument specifications for EURUSD GBPUSD USDJPY USDCHF AUDUSD USDCAD NZDUSD, contract size, min/step/max lots, effective leverage and margin, stop-out applicability, swap schedules, defensible historical bid/ask spreads and execution/slippage. Obtain via account's MT5 Symbol Specification or TradeLocker instrument details, broker's dated account-specific written confirmation and authorized historical quote/execution exports. No credentials requested or stored.

Maintain provisional/unranked; 2022–2023 training only, 2024 exposed development, 2025 holdout sealed. No vendor raw data added.
