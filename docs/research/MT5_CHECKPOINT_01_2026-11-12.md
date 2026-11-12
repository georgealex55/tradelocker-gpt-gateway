# XMI MT5 checkpoint 01 — architecture audit and offline contract

**Result:** Contract and synthetic test source committed; tests **not executed**. No MT5 connection, historical replay, order or production change.

The existing FX feed is Twelve Data and stocks/crypto use Alpaca; TradeLocker remains the execution/risk route. Existing XMI OHLC normalization can deduplicate by overwriting timestamps, so the future MT5 importer must reject duplicates before calling it. The existing holdout analytics helper is not a calendar-year access guard.

New `lib/mt5/contract.mjs` defines a read-only source label, UTC bounded window, mandatory source SHA-256, explicit `executionEnabled:false`, 2025-overlap rejection, and fail-closed unavailable state. New `tests/mt5-contract.test.mjs` contains synthetic validation cases but has **not** been run. This guard is not yet wired into other existing XMI imports.

**Next:** Implement opt-in MT5 adapter and run tests; no terminal access required for offline work. The full 34-capability ledger remains authoritative. GatesFX historical spreads/slippage and stopout tiers remain unverified.
