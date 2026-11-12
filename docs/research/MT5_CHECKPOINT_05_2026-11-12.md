# XMI MT5 checkpoint 05 — Windows-local read-only SDK reader

Implemented `scripts/mt5_readonly_terminal.py` using a dependency-injected MetaTrader5 SDK interface. The module lazily imports the SDK, opens and closes a local terminal session without account login or credential arguments, reads terminal status, account and symbol metadata, quotes, M1/M5/H1 etc. bars, ticks, positions, pending orders and historical deals. No trading function is implemented. A 31-day maximum and strict explicit UTC window guard rejects any 2025 overlap **before calling** historical SDK methods. No raw broker data is committed.

Committed synthetic tests in `tests/test_mt5_readonly_terminal.py` for preflight exclusion, connection lifecycle, basic read methods, symbol validation, UTC bounds and out-of-window data. **Tests have not been executed**, and code must not be marked verified. The local container cannot resolve github.com, so it cannot clone this branch for execution; GitHub connector commits succeeded. A real Windows MT5 terminal is not connected. No broker historical export, backtest, XMI chart integration or CI was performed.

**Commits:** source `084d2499691cda47219146bb020939a3128a8297`; tests `2e701f0198a4b7cef1710e0e4cd795632e3874a0`; matrix `b1b118b132874cb6bbd8528522a8265109884d7e`.

**Next:** milestone 6, a bounded local-only export CLI with deterministic SHA-256 manifest and synthetic tests. Before actual terminal use, run `python -m unittest discover -s tests -p 'test_mt5_readonly_terminal.py'` against the exact branch and fix any failures. Keep 2025 sealed, production unchanged and trading disabled.
