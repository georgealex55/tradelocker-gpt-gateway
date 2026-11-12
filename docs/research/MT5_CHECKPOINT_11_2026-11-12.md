# XMI MT5 checkpoint 11 — seven-pair offline regression and CI

Branch: `research/xmi-mt5-adapter-20261112`. Prior checkpoint 10 and current plan, contract, replay bridge, offline bars, risk engine, synthetic tests and full 34-feature matrix read before edits.

## Completed code and commit evidence
- **Confirmed defect:** `lib/mt5/riskLanes.mjs` used a double-escaped `\\d` regular expression in the UTC `asOfUtc` check, rejecting valid ISO timestamps. Fixed in commit `b51453ef302f256294189ec508af24116a04155d`. Prior risk tests were committed but not run, so this defect had gone undetected.
- Added `tests/mt5-seven-pair-cross-provider.test.mjs` in commit `e7b3f38f58e9b8fc106bf0c1cd9e12594342a599`: synthetic equal-coverage checks for EURUSD, GBPUSD, USDJPY, USDCHF, AUDUSD, USDCAD, NZDUSD; independent USD 1,000 scenarios; explicit 2% experimental lane; valid UTC and malformed date rejection; 2022/23 training, 2024 development, sealed 2025 exclusion and 2026-only admissibility; opt-in provider fail-closed behavior; no fake broker margin defaults. Gold stays separate.
- Added isolated GitHub Actions workflow `.github/workflows/mt5-offline-regression.yml` in commit `179e0ca71fc85cb6845e10052cc96c93d72d4e39`: Node 22 `node --test tests/mt5-*.test.mjs` and Python 3.11 `python -m unittest discover -s tests -p 'test_mt5_*.py' -v`. Workflow never contacts a terminal or broker.
- Updated full 34-capability matrix in commit `00493147a702c852de2efa90a797e816fe637f28`. All test-dependent capabilities remain unverified until actual suite results.

## Verification / blockers
- Exact GitHub branch checkout **not available** in local runtime: `git ls-remote https://github.com/georgealex55/tradelocker-gpt-gateway.git refs/heads/research/xmi-mt5-adapter-20261112` failed `Could not resolve host: github.com`.
- GitHub connector returned no PR-triggered workflow runs for commit `179e0ca71fc85cb6845e10052cc96c93d72d4e39`. Combined status exposed only Vercel pending, **not** evidence that MT5 tests ran. Do not interpret Vercel status as deployment approval.
- Thus exact repository tests: **not executed/verified**; Python tests: **not executed/verified**; CI: **not verified**; Windows MT5 terminal: **not connected**. No broker prices or trade records exported; no funded replay or historical backtest.
- Cross-provider coverage here means opt-in/fail-closed contract regression, **not** authenticated TradeLocker/Alpaca/Twelve Data price parity or complete provider-route integration.
- Historical replay still descriptive; risk feasibility is not wired to it. Export >400 bars still requires explicit bounded chunking. Authentic GatesFX spread/fills/slippage, lot-step/margin/swap and stop-out remain unknown; scenarios PROVISIONAL / UNRANKED.
- No 2025 rows inspected, including prior mixed-year CSV. No order sending, production edits, Vercel deploy or merge. Existing archived 6,048 scenario-years unchanged.

## Next: milestone 12
Run exact Node/Python suites in GitHub Actions or accessible checkout, fix failures if verified, then deliver 34-feature gap report with all commit/test/terminal facts. No parity claims for MQL5 EA, Strategy Tester, chart GUI or economic calendar without Windows terminal evidence.
