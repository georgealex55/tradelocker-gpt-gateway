# XMI MT5 checkpoint 02 — opt-in offline bar adapter

**Result:** Source code and synthetic tests committed, but **tests not executed**. The adapter is deliberately not connected to production or live MT5.

The new `lib/mt5/offlineBars.mjs` uses explicit MT5 selection, SHA-256 verification of raw UTF-8 JSON bytes, the existing sealed-year manifest guard before JSON parsing, strict UTC timestamps, source-window/timeframe alignment, duplicate rejection before the XMI normalizer, finite OHLC validation, and a fully-closed-bar requirement. It returns read-only source-labelled normalized bars. `tests/mt5-offline-bars.test.mjs` contains corresponding synthetic cases.

**Commits:** `0192ecd3bba9f5ad71a2e09056e56063cf50fbb1` (adapter), `05ecbe18dab7464b4697a5f0f57863bad30e11ca` (tests), `df375a698ac2dfe2c5de3405c18e70677ddad7c1` (capability matrix).

**Verification blocker:** GitHub connector does not provide workflow dispatch, the runtime cannot resolve github.com, and a complete local repository checkout is not available. Test command pending: `node --test tests/mt5-contract.test.mjs tests/mt5-offline-bars.test.mjs`. No claim of successful tests or live terminal integration.

**Next:** MT5 tick Bid/Ask parser with UTC millisecond and quote-integrity checks, and test execution when an appropriate executor is available. All seven major FX pairs remain equally in scope; gold separate. Historical broker costs remain unverified and strategies provisional/unranked. No 2025 data accessed.
