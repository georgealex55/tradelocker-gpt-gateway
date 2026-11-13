# XMI MT5 post-12 milestone — offline replay/risk research bridge

Branch: `research/xmi-mt5-adapter-20261112`. This is an additional scoped development increment, not a claim of completed MT5 parity.

## Committed work
- `lib/mt5/replayRiskResearch.mjs` — commit `573ba91a39ac8fa91673b298f3127271b52304df`. Combines verified-source offline candle import and descriptive replay with five independent $1,000 pretrade risk feasibility lanes. Only seven majors in this bridge; gold remains separate. Uses explicit broker cost/spec inputs, no cross-provider fallback.
- `tests/mt5-replay-risk-research.test.mjs` — commit `3c17b985236313f65019195faf183ff825bb3c02`. Three synthetic cases for causal next-bar reference, source tampering, cost/spec fail-closed, seven-pair scope and no fills/P&L.
- Existing MT5 adapter, risk module and production feed files not edited.

## Verification and blocker
- Attempted exact branch checkout: `git ls-remote https://github.com/georgealex55/tradelocker-gpt-gateway.git refs/heads/research/xmi-mt5-adapter-20261112` failed with `Could not resolve host: github.com` in local container. Exact repository Node/Python tests **not executed**.
- GitHub connector confirmed both commits. Combined commit status for test commit returned `statuses: []`; **no passing CI check verified**. Workflow `.github/workflows/mt5-offline-regression.yml` exists in prior commit `179e0ca71fc85cb6845e10052cc96c93d72d4e39`; push-triggered CI result remains unknown.
- No Windows terminal connection, authenticated GatesFX spread/slippage/margin export, broker fill, backtest or production deployment. No 2025 holdout inspection.
- New bridge is **descriptive observations + independent pretrade feasibility**, not a funded trade simulation; no exits, realized P&L, stop-out lifecycle or executed fills. Next-bar opening price is a reference, never a fill.
- Existing 34-feature matrix classifications remain unverified; this integration is narrower than full chart/risk parity.

## Next priorities
1. Execute exact `node --test tests/mt5-*.test.mjs` and `python -m unittest discover -s tests -p 'test_mt5_*.py' -v` in an accessible checkout; fix failures and capture CI run URL.
2. Validate broker-specific contract/margin/spread/slippage locally and add separate scenario-equity lifecycle with explicit causal exits, fees and 10% drawdown halt before describing any funded replay.
3. Keep production unchanged, no orders and no 2025 access.
