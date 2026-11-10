# XMI research checkpoint 04 — expanded offline parser regression coverage

Status: **tests committed, not executed**. All performance comparisons remain provisional and UNRANKED.

## Verified work
- Reviewed [checkpoint 03](XMI_AUDIT_CHECKPOINT_2026-11-08_RUN03.md) and the current source implementation of `scripts/xmi-amd-fxcm-seven-pair-replay.py` through the connected GitHub repository.
- Extended `tests/test_xmi_fxcm_integrity.py` from six to **ten unittest test methods**, adding positive explicit UTC `Z` and `+00:00` acceptance, negative `-05:00` offset rejection, and one parameterized test checking crossed quotes at each of seven representative FX quote scales (EURUSD, GBPUSD, USDJPY, USDCHF, AUDUSD, USDCAD, NZDUSD).
- Commits: [7e5236a](https://github.com/georgealex55/tradelocker-gpt-gateway/commit/7e5236a0893077a5bb367c3bf5cd34747f266d8c), [17f58c6](https://github.com/georgealex55/tradelocker-gpt-gateway/commit/17f58c6ccfee33bbfcdede48e25f3ceac0e14581).
- These are **synthetic test fixtures only**. No historical price data, broker quotes, or trading outcomes were fabricated.

## Execution blocker and next action
Attempted a read-only clone of the isolated research branch into the execution container for `python3 -m unittest discover -s tests -p 'test_xmi_fxcm_integrity.py' -v`, but the container could not resolve `github.com` (DNS/network restriction). Connected GitHub read/write actions succeeded, but they do not run Python. Therefore **zero tests executed** and no passing result is claimed. An actual checkout or GitHub Actions runner with Python access is needed to run the suite. Execute:

```sh
python3 -m unittest discover -s tests -p 'test_xmi_fxcm_integrity.py' -v
python3 -m py_compile scripts/xmi-amd-fxcm-seven-pair-replay.py
```

## Additional source-inspection finding
The current importer forms M5 groups from observed M1 timestamps, discards any group not containing all five minute offsets, and increments `incomplete_m5_groups`. It also requires 12 months, >=45,000 M5 bars and >=2,000 bars per month. These coarse thresholds do **not** prove session-by-session continuity, nor prevent sparse missing M5 groups from changing signals. A targeted synthetic gap regression and missingness-by-session audit are still needed before stronger performance claims.

## Unchanged research protections
- Seven pairs treated equally. 2022/2023 are training, 2024 is previously exposed development, 2025 remains unopened.
- $1,000 per independently funded scenario; 2% risk experimental only; 10% drawdown halt; strict causal execution.
- GatesFX account-specific contract sizes, min/step lots, margin/leverage, historical bid/ask and slippage remain unverified. No definitive ranking or winning-strategy claim is authorized.
- No historical replay, production change, branch merge, real order, or holdout access occurred.

Next: run the ten-method regression suite in a real runner, fix observed failures, then add deterministic M1-to-M5 gap and DST session boundary tests.
