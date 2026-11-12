# XMI MT5 checkpoint 10 — independent offline risk feasibility

**Branch:** `research/xmi-mt5-adapter-20261112`  
**Previous head reviewed:** `0b02785ca2425a58cd23e9cde63a05b6781a4821` (checkpoint 09). Reviewed plan, checkpoint 09, replay bridge, symbol reconciliation, and 34-feature matrix before advancing.

## Actual changes
- `lib/mt5/riskLanes.mjs` — commit `b0722f8b44d933c765917e97923d3703f8a94fb4`. Pure offline risk feasibility engine with five separately funded USD 1,000 lanes: 0.25%, 0.5%, 1%, fixed 0.01 lots, and experimental 2%. Requires explicit observed min/step/max volume, USD tick size/value, USD margin per lot, stop distance, source hash, timestamp, spread and slippage. No defaults for missing broker costs. Min+k×step downward quantization, margin checks, 10% drawdown halt check, explicit unfundable labeling and no order functions.
- `tests/mt5-risk-lanes.test.mjs` — commit `dfa6a573479270ffa0b8ca644931a9cd3a138126`. Eight synthetic cases cover five independent lanes, lot quantization, missing broker specs, margin insufficiency, min volume, source and funding guard, 10% drawdown, cost impact.
- `docs/research/MT5_FULL_PLATFORM_CAPABILITY_MATRIX_2026-11-12.json` — commit `5cc1b62c4d3bf6020e8be98e6fc5d3885e57a8ec`. Risk engine remains **implemented_unverified**. Native MT5 profit/margin calculation remains **not implemented**.

## Verification and limitations
- GitHub source/test commits succeeded; **exact repository tests and GitHub CI NOT executed**. No pass claims. To verify in an exact checkout: `node --test tests/mt5-risk-lanes.test.mjs`, then run existing MT5 and cross-provider tests.
- This module is an isolated feasibility calculator, **not yet wired to replayBridge**, which intentionally produces descriptive states, not fills or P&L. It never invents fills or results.
- USD tick value and USD margin per lot must be explicitly broker-confirmed; symbol/account leverage alone is not proof. Missing fields fail closed. Spread/slippage are explicitly supplied modeled costs; no authenticated GatesFX historic fills/slippage, rollover, stop-out, or tiered margin verified. Any scenario is **PROVISIONAL / UNRANKED**.
- No MT5 Windows terminal, SDK, live account or real data export used. No 2025 holdout data read, no production/feed/chart changes, no trades sent, no Vercel deploy, no branch merge. Seven FX pairs retain independent equal research priority; gold is separate. Archived 6,048 scenario-years untouched.
- Exact source hashes: GitHub commit SHA values above identify committed changes; no local raw-market-data SHA created or claimed.

## Next milestone 11
Execute exact repository tests in an accessible checkout or CI, repair failing imports/tests, add cross-provider regression and seven-pair synthetic coverage. Check the exporter-to-importer >400 row limitation, and validate fail-closed behavior. No historical performance claims without authentic broker costs.
