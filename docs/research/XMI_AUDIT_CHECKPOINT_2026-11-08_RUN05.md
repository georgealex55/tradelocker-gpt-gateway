# XMI audit checkpoint 05 — M5 continuity instrumentation

**2026-11-08. Research branch only.** Added [read-only M5 continuity audit utility](../../scripts/xmi-m5-continuity-audit.py) in commit [8f1bff7](https://github.com/georgealex55/tradelocker-gpt-gateway/commit/8f1bff7ea6faa8b39dfe8a169cd453ecbbc34a0c).

## Verified changes
- Read the actual checkpoint 04, 10-method parser test file, 2022–2023 baseline, and M1-to-M5 grouping code on the isolated research branch via GitHub connector.
- Added a deterministic, no-download, standard-library-only CSV auditor accepting **each of all seven** FX pairs for **2022 or 2023**. It enforces UTC M5 alignment, monotonically increasing timestamps, exact schema and bid OHLC consistency; reports observed bars, month/weekday/UTC-hour distribution, gap counts and sizes, and UTC gap-start hour. It rejects 2025 inputs.
- This tool does **not** invent missing prices, does **not** mistake weekend gaps for verified source outages, and cannot establish Dukascopy provenance or GatesFX broker execution. Existing mixed-provider 2023 W27 provenance remains as documented in upstream replay manifests.
- Identified the current replay's monthly bar threshold (>=2000) as insufficient for session-by-session completeness. The new tool is diagnostic only; its output is not yet wired as a blocking replay gate.

## Execution state
- GitHub connector could read and commit source, but the local container's direct GitHub DNS resolution failed again (`Could not resolve host: github.com`). No historical CSV inputs are mounted. **The new auditor has not been executed on actual market CSVs; the 10-method regression suite also remains unexecuted.** No new backtest or profit claim.
- To run, provide existing derived M5 CSVs from the historical replay artifacts and execute for each symbol/year:
  `python3 scripts/xmi-m5-continuity-audit.py --input PATH/PAIR-YEAR-bid-m5.csv --pair PAIR --year YEAR`
  Review gap distribution against an exchange-session/holiday/DST calendar and the 2023 W27 source manifest before accepting continuity.

## Gates and protections
- Balanced coverage: EURUSD GBPUSD USDJPY USDCHF AUDUSD USDCAD NZDUSD.
- Separate USD 1000 scenario accounts; 2% experimental risk tier only; no definitive ranking without verified GatesFX symbol contracts, min/step lots, margin/leverage and historical execution costs.
- 2022/2023 training only; 2024 already exposed development; **2025 sealed and unread**. No production changes, merge, live trades, broker access, or invented performance results.

**Next:** Execute parser tests and the continuity auditor against real 2022/2023 M5 artifacts, establish source/holiday-aware gap classifications, then address only reproducibly failing cases.