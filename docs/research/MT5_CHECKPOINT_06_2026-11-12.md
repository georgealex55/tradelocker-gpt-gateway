# XMI MT5 checkpoint 06 — private bounded export CLI

**Status:** Source and tests committed, not executed against exact GitHub branch. No real MT5 terminal connection, live/paper order, historical export or backtest was performed.

## Committed work
- `scripts/mt5_export_cli.py` commit `be516b58e8fd7fc587fdadfd8e8dc4a8b84c9b86`: local-only CLI using the existing read-only `ReadOnlyMT5` wrapper; explicit UTC research window, 31-day max, approved year guard before SDK reads, validated symbols, bounded 100,000-row and 32 MiB JSON payload, deterministic JSON serialization, exact payload SHA-256, private exclusive file creation and JSON manifest; no overwrite and no repository-directory export.
- `tests/test_mt5_export_cli.py` commit `003fcdf980b54c02811f8bdbf0c67166e16c5116`: synthetic cases for SHA, manifest, no overwrite, sealed-year preflight, invalid UTC/symbol, nonfinite numbers, row/byte limits.
- 34-feature matrix updated in commit `3cfc2c450b059b78e00b11adcd4b084174ea30bd`, local_bridge and quality_security marked implemented_unverified, not verified.

## Verification and limitations
- GitHub connector confirmed commits; **no exact repository test execution or CI result** available in this run. Do not infer tests passed.
- No Windows MT5 terminal was connected and no broker data was accessed. The export CLI is **not yet a demonstrated working GatesFX data source**.
- Existing `ReadOnlyMT5._rows` converts NumPy structured arrays with `.tolist()` and `rates/ticks` call `dict(row)`. For standard NumPy structured array rows, `.tolist()` can yield tuples rather than key/value pairs. **Likely integration blocker:** adapt structured array conversion to named-field dicts and add a representative NumPy structured array test before real export. This was discovered during code review; no claim of runtime reproduction.
- The CLI emits `kind=bars/ticks` JSON and manifest fields compatible with the MT5 contract, but existing JS importers have not been exercised end-to-end against these exact bytes.
- Export path safety checks reject repository cwd and descendants but do not fully harden all symlink/race conditions in parent paths. Treat local exporter as trusted-user-only until hardened.
- Timestamped output filename includes hash prefix; manifest retains source SHA, UTC window and export time. No private account numbers or raw prices are committed.
- Entire 2025 holdout remains excluded by preflight. 2022/2023 training and 2024 development labels unchanged; seven majors equally in scope, gold separate; 6,048 prior scenario-year training calculations unchanged.
- Existing TradeLocker, Alpaca/Twelve Data, production feeds/charts and trading execution unchanged.

## Reproducible next verification
Run from checked-out research branch:
```sh
python -m unittest discover -s tests -p 'test_mt5_export_cli.py' -v
python -m unittest discover -s tests -p 'test_mt5_readonly_terminal.py' -v
```
Then test with an actual MT5-installed Windows terminal **only after** repairing and validating NumPy structured-array conversion and checking privacy of local output. Never export 2025.

**Next milestone 07:** Broker contract/lot/stopout/swap mapping and GatesFX screenshot ledger reconciliation; prioritize fixing the structured-array blocker and running exporter tests first if accessible. Keep account conditions provisional and research unranked until genuine broker data and rules are verified.
