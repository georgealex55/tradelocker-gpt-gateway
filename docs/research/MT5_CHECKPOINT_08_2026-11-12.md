# XMI MT5 checkpoint 08 — sanitized 2026-only closed-deal accounting

**Branch:** `research/xmi-mt5-adapter-20261112`. **Scope:** synthetic/offline 2026-only deals importer; no broker connection or execution.

## Implemented and committed
- `scripts/mt5_closed_deals.py` commit `e116f8e4acf99d2126e17f06e146833cc57ab004`: separately attested sanitized 2026-only manifest preflight **before opening payload**, strict source/read-only/currency/UTC/hash/size/window controls, duplicate deal checks, exact Decimal P&L + commission + swap + fee reconciliation, grouped position counts without exposing deal IDs.
- `tests/test_mt5_closed_deals.py` commit `0d027554e70bab069e86a9ae8fee973c3c1426a4`: eight synthetic test cases covering accounting, hash, reported net, duplicate IDs, preflight sealed-year rejection before payload access, out-of-window records, invalid money, private-file roundtrip.
- `docs/research/MT5_FULL_PLATFORM_CAPABILITY_MATRIX_2026-11-12.json` commit `769a631e85eb41f049d709d36e800352d92061fc`: deals_history, trade_journal and reconciliation are `implemented_unverified`, not terminal-verified.

## Test evidence
- Local isolated Python run: `python -m unittest discover -s tests -p 'test_mt5_closed_deals.py' -v`: **8/8 passed**, using a locally staged representative implementation and synthetic tests.
- The **exact committed GitHub files were not downloaded and run as a checkout**; repository-wide CI remains unverified. No authenticated MT5 exports, real deal history or replay were used.
- The old mixed-year closed-position CSV was not opened, parsed, scanned or queried. 2025 sealed holdout unchanged.

## Key interpretation and limitations
- MT5 deals are not equivalent to fully closed positions: a deal labeled OUT can be partial; only volume/lifecycle reconciliation can establish closure. The importer deliberately reports `positionsConfirmedClosed:false`.
- Net P&L is exact decimal sum of provided deal profit, commission, swap and fee; this does not verify historical spreads, slippage, swap schedules or broker margin conditions.
- Manifest attestation `sanitized_2026_only` must originate from a trusted prefilter; never pass an unfiltered mixed-year source into this importer. No automatic prefilter was created.
- Source manifest SHA-256 proves payload integrity against supplied manifest, not authenticity of the broker or account.
- Existing MT5 CLI exports bars/ticks, **not deals**. This module consumes separately prepared sanitized 2026-only deals and does not claim end-to-end exporter integration.
- No live/paper trading, no production changes, no broker credentials, no Windows MT5 terminal connection.

## Reproduce
```sh
python -m unittest discover -s tests -p 'test_mt5_closed_deals.py' -v
```

## Next milestone 09
Integrate normalized MT5 offline bars into research replay without changing production feed routes; preserve strict causal next-bar entries and independent USD $1,000 scenarios. First resolve existing export JSON vs JS bar import schema/row-limit mismatches and run exact repository tests if checkout becomes available.
