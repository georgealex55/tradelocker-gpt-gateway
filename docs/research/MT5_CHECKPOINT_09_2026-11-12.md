# XMI MT5 checkpoint 09 — offline exporter-to-replay integration

**Branch:** `research/xmi-mt5-adapter-20261112`. **Scope:** new opt-in offline MT5 Python-export JSON to existing XMI descriptive closed-candle replay. Production routes unchanged.

## Actual committed changes
- `lib/mt5/replayBridge.mjs` commit `bf4e45cd110c394f3ab4ba2be6de4e665c3a5761`: validates source manifest and sealed-year boundary before payload parsing, SHA-256 checks original Python-export JSON bytes, maps UTC integer seconds to explicit ISO UTC strings, validates timeframe and strictly ordered 2–400 bars, then invokes the existing MT5 offline-bar importer and `replayHistoricalResearch`. Carries original source SHA and derived payload SHA separately.
- `tests/mt5-replay-bridge.test.mjs` commit `b6c9b1044b3eedec634b4f729bc224a438085c34`: six synthetic cases for valid conversion, descriptive replay, 2025 preflight, tampering, invalid timeframe, ordering, and row limits.
- 34-feature capability matrix commit `ba0edcdf4bc6d80e1ff5c9673f650e0ac5b80ed6`: partial implementation remains `implemented_unverified`.

## Test evidence and limitations
- Tests are **committed but NOT executed** in an exact repository checkout; no CI success is claimed.
- No Windows MT5 terminal connected and no authentic broker export. Existing 6,048 training scenario-years untouched. No 2025 data accessed.
- Python exporter writes integer UTC seconds and permits 100,000 rows/32 MiB; old JS bar importer expects ISO strings and <=400 rows/900KB. This bridge resolves the seconds/ISO mismatch for bounded 2–400 rows but **does not** automatically split larger exports. A >400-row export is rejected, never truncated.
- This is **descriptive strategy-state replay only**, not historical execution, P&L or profit-factor testing. It produces no trade fills and does not claim independent $1,000 simulations. Existing replay is causally prefix-based; the MT5 source bridge adds no lookahead.
- Export source SHA-256 is integrity, not broker authenticity. The original broker spreads, slippage, margin, rollover and stopout remain unverified; results are PROVISIONAL / UNRANKED.
- No production changes, Vercel deployment, merges, trading orders, or changes to existing TradeLocker/Alpaca/Twelve Data routes.

## Reproduce after checkout
```sh
node --test tests/mt5-replay-bridge.test.mjs
```

## Next milestone 10
Run exact repository tests and repair failures; implement independent $1,000 risk scenario calculations with 0.25%, 0.5%, 1%, fixed 0.01 lot and separate experimental 2% lane, min/step lots, margin, cost and 10% drawdown gates. Do not confuse descriptive replay with funded execution simulation. Reconcile exporter row/window limits and native MT5 instrument specs.
