# XMI 2.0 · $1,000 AMD + retest · isolated research implementation

**As of:** 2026-11-07. **Working branch:** `research/xmi-amd-retest-stp-20261107`.

## State of the work

Research implementation and synthetic accounting fixtures are committed. **The historical AMD backtest has NOT been executed. There is no new AMD gross/net return, profit factor, winning strategy, or qualification to report.** Original/private 2022–2024 HistData ZIPs are not in the checked-out GitHub repository or accessible Library attachments. No vendor market data has been fabricated or pulled. The 2025 price holdout is rejected by code; production and chart routes are unchanged.

### Frozen user choices

- Start each independently replayed account at **USD 1,000**.
- GatesFX **Standard STP**, **zero commission**. Headline/account leverage 1:500. Symbol-specific margin, gold leverage and contract quantity are **not account-verified**.
- Seven major FX pairs plus XAUUSD; 2022 and 2023 training, previously exposed 2024 development, 2025 sealed.
- Two accumulation range definitions: **72 complete 5m bars from 00:00–05:55 Europe/London** followed by sweep opportunities 07:00–15:59 London; and **12-bar rolling compression** with a 5×ATR ceiling. ATR values use trailing closed bars. Session model requires complete Asian ranges and rejects missing 5-minute bars.
- For each range: swept high/low with price returning inside range; a subsequent directional displacement/market-structure confirmation; and a **later** retest confirmed at candle close. Entry is always at the next contiguous five-minute **open**, with no same-bar or future-candle selection.
- Entry A: **market structure shift + 3-candle fair value gap + retest**. Entry B: **sweep + directional range-mid reclaim + later retest**. These are explicit price-pattern hypotheses, not proof of institutional market manipulation.
- Exit A: stop at sweep invalidation buffer, 2R bracket target. Exit B: stop, opposite-range-liquidity target with a conservative 1R minimum, or confirmed structure invalidation at the **next open**. Neither exit has a five-, ten- or fifteen-minute elapsed-time cap.
- Carry A: position stays only until a **16:40 New York close** session-flat cutoff (flatten close of 16:35 five-minute bar); no new funded entry beginning at 16:35 or later. Carry B: overnight permitted until structural/bracket closure or supported price path ends; if real swap terms are unavailable, resulting multi-day outcomes remain unpriced and do not enter funded returns. Missing price-bar gaps are censored, never bridged by assumed fills.
- Four sizing alternatives: 0.25%, 0.50%, 1.00% of current equity at protective stop, or fixed 0.01 lot. Three separate lanes: (A) force minimum lot when margin permits and clearly label any risk-budget breach; (B) risk-and-margin-fundable sizing; (C) hypothetical every-signal shadow. **No hypothetical unfundable return goes into the real-capital P/L**; concurrent signals are logged as occupied in funded accounts rather than disappearing.
- Modeled cost: zero commission; FX 2.0 pip bid/ask spread and adverse 0.3 pip slippage per side; XAUUSD 0.45 price spread or separate 1.72 wide-spread scenario, 0.07 adverse price slippage per side. All are hypothetical fixed execution assumptions, not measured historical Standard STP ask quotes.
- Conditional model lot conversion: 100,000 base units per major FX lot and 100 ounces per gold lot, 0.01 minimum/step, FX leverage 500:1, XAUUSD leverage 200:1. **Those are not a read of the user's actual TradeLocker XAUUSD symbol record**. All source symbol properties must be replaced from the actual instrument details before broker-matched profitability conclusions.
- Account drawdown halt currently uses completed-position equity, not intrabar mark-to-market maintenance enforcement. The candle replay resolves ambiguous stop-and-target bars **stop first**; intraminute fill ordering, swap, spread variation and gap funding remain evidence gaps.

Total requested full-factorial grid: **192 scenarios per symbol × 8 symbols = 1,536**. Optional gold-wide-spread sensitivity adds 192 separate scenarios (not a replacement for the baseline). Do not aggregate these overlapping market paths as one $1,000 portfolio.

### Verified public facts (not individual live account quotes)

- GatesFX publishes STP Standard **zero commission** and **up-to-1:500** advertised leverage: https://gatesfx.com/account-types .
- The TradeLocker instrument detail API exposes `lotSize`, `minLot`, `lotStep`, and `leverage` for a specific instrument and route: https://public-api.tradelocker.com/reference/getinstrumentdetails .
- Public GatesFX `instruments` page quotes ECN Raw values; those are **not Standard STP historical execution samples**.
- The earlier user-provided gold quote spread of 1.72 is a single observation, not a 2022–2024 STP time series.

## Scripts and artifacts

| Asset | Function |
| --- | --- |
| `docs/xmi-amd-retest-stp-20261107.catalog.json` | Frozen modes, symbols, risk settings, verified-vs-modeled fields, holdout guard |
| `scripts/xmi-amd-retest-core.mjs` | Causal session / rolling range, sweep, displacement, retest signal detector |
| `scripts/xmi-amd-retest-execution.mjs` | Zero-commission bid/ask cash replay, risk-budget/forced-min/shadow accounting, structural or bracket exits |
| `scripts/xmi-amd-export-bars.py` | Converts the existing audited private HistData M1 ZIPs to complete M5 bid OHLC with source manifest |
| `scripts/xmi-amd-retest-runner.mjs` | CLI runs the 192-factorial per-symbol, per-fold research matrix with optional private ledgers |
| `scripts/xmi-amd-baseline-compare.mjs` | Read-only comparison to the untouched saved 24 leader baselines |
| `tests/xmi-amd-retest.test.mjs` | 11 synthetic deterministic regression cases |

The 11 JavaScript scenarios passed in a synthetic in-memory test harness on 2026-11-07, including causal entries, complete Asian sessions, holdout rejection, 0.25% lot affordability, force-min over-budget labeling, bid/ask friction, shadow-only P/L exclusion, unfilled margin, unresolved positions and reproducibility. This is **not** evidence of historical profitability. For reproducible local Node verification, run:

```bash
node --test tests/xmi-amd-retest.test.mjs
```

## How to launch the real historical replay from the original private cache

The following reads the original historical ZIPs locally and emits only private CSV/results, not vendor price rows to Git. Keep `$research_dir` outside the repository.

```bash
# 1. Convert the already-audited history. The source reader covers 2022–24 ONLY.
python scripts/xmi-amd-export-bars.py \\
  --cache "$research_dir/histdata" --symbol XAUUSD --years 2022 2023 2024 \\
  --output "$research_dir/private/xauusd-2022-2024-5m.csv"

# 2. Screen 2022 and 2023 independently before touching reused 2024 development.
node scripts/xmi-amd-retest-runner.mjs \\
  --input "$research_dir/private/xauusd-2022-2024-5m.csv" \\
  --symbol XAUUSD --fold training_2022 --gold-wide true \\
  --output "$research_dir/private/xauusd-amd-training-2022.json"
node scripts/xmi-amd-retest-runner.mjs \\
  --input "$research_dir/private/xauusd-2022-2024-5m.csv" \\
  --symbol XAUUSD --fold training_2023 --gold-wide true \\
  --output "$research_dir/private/xauusd-amd-training-2023.json"

# 3. Compare a train fold with unchanged historical baselines.
node scripts/xmi-amd-baseline-compare.mjs \\
  --amd "$research_dir/private/xauusd-amd-training-2022.json" \\
  --output "$research_dir/private/xauusd-amd-baseline-2022.json"
```

The same commands apply to EURUSD, GBPUSD, USDJPY, USDCHF, AUDUSD, USDCAD and NZDUSD; omit `--gold-wide` for FX. Run 2024 halves only after freezing candidate parameters on 2022–2023, preserving them as **previously examined development**, not new independent out-of-sample evidence. The 2025 holdout must not be inspected.

### Actual account details

For a sanitized per-symbol file, include only allowed fields such as `lotSize`, `minLot`, `lotStep`, `symbolLeverage`, `spreadPrice`, `slippagePriceEachSide`, `swapLongUsdPerLotPerNight`, `swapShortUsdPerLotPerNight`, and `specStatus`. The runner accepts `--symbol-spec /private/XAUUSD.json`. Do not provide credentials, balances, account IDs, or unverified values marked as verified.

## Research caveats before a profitability conclusion

1. **No actual AMD market replay yet:** private ZIP files are not currently present for tool execution. The branch is implementation with synthetic tests, not historical findings.
2. **No verified historical Standard STP spreads/slippage** and no verified symbol lot/margin details for this account. A single gold quote observation cannot calibrate the prior three years.
3. **No point-in-time macro calendar integration** in the new AMD runner yet; results must not be directly called equivalent to older event-filtered systems. News and rollover risk require a matched controlled sensitivity.
4. **No full tick-level verification, maintenance-margin liquidation modeling, or intrabar mark-to-market drawdown** in this research-only path. Gap-censored unresolved trades and unknown swaps are excluded from funded P/L.
5. Existing older benchmark models included different commissions and exits. The baseline comparator is descriptive, **not** a matched-fill causal A/B improvement test.
6. **Zero qualified AMD strategies.** The 2025 sealed holdout has not been inspected. No user money, API keys, broker orders, live application pages, or production deployment changed.

**Next rigorous research action:** validate the actual symbol details for all eight instruments; ingest original private 2022–2023 bars and macro calendars; run all three no-skip lanes and compare only executable scenarios with old baselines on matching folds and matching STP costs. Keep shadow and forced-overrisk results separately labeled.
