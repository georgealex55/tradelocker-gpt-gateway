# XMI profitability-first: matched gross/net expectancy and break-even spread audit

**Research date:** 2026-11-07. **Source branch:** `feature/xmi-session-research-20261106`. **Analysis branch:** `research/xmi-profitability-gross-net-spread-20261107`. **Read-only:** no trading-rule changes, no historical data changes, no order execution, no production merge, no 2025 holdout read.

## Executive findings

Two distinct, already-registered cohorts are analyzed separately; their overlapping market years and tests cannot be pooled into an independent portfolio or live return.

1. **24 calendar-filtered development leaders (2024):** 3,999 completed simulated trades across 24 leader strategies and 48 independently initialized 2024 half-year account folds, gross `USD +1019.30`, modeled friction `USD +1718.92`, and net `USD -699.63`. 22 of 24 have positive gross P/L, 20 flip from gross-positive to non-positive net, and 2 remain net positive. The 2022–2023 training cases instead show gross `USD +134.79`, friction `USD +2084.61`, net `USD -1949.82`, and **0 net-positive leaders**.
2. **Latest 27 fixed-0.01-lot, zero-commission diagnostics (2024):** 651 completed simulated trades, gross `USD -12.27`, spread-plus-slippage `USD +317.91`, and net `USD -330.18`. 9 of 27 had positive gross results yet **all 27 had negative net results**. 18 were already gross-negative. 6 of 27 have nonnegative, accounting-only break-even spreads at unchanged slippage (none passes the strategy qualification gates).
3. **Not merely commission:** the 27-case replay intentionally sets commission to zero; the cost loss persists.
4. **Exit and capital diagnostics:** among latest 27 cases, 390/651 (59.9%) close by time cap and 1,741 minimum-size skips appear. These are descriptive counts; P/L by exit reason and causal skip opportunity cost require trade-level ledgers.

## Sources, comparability and checks

- 24-leader source: [complete-calendar saved leader fold metrics](https://github.com/georgealex55/tradelocker-gpt-gateway/blob/feature/xmi-session-research-20261106/docs/xmi-session-calendar-rerun-2022-2024.json), Git blob SHA `253fe19eda33e5d89b0477a8371e57628b2e7a8e`.
- 27-case source: [registered new-entry fixed-size development fold metrics](https://github.com/georgealex55/tradelocker-gpt-gateway/blob/feature/xmi-session-research-20261106/docs/xmi-session-new-entries-20261107.json), Git blob SHA `300c4812a4d0a177663fa2f96f6669387603b131`.
- Input count check: 24 calendar leaders and 27 later scalping diagnostic choices. Gross minus recorded cost equals net in every later row within USD 0.002. Exit counts reconcile with their reported completed trades. Internal validation warnings: **0** (none).
- All 2024 results are repeatedly used **development** evidence. Both halves begin at USD 1,000 independently; do not interpret sums as a single compounded USD 1,000 account. Original 24-leader cases use earlier spread, slippage **and commission** assumptions; latest 27 are zero-commission with different entry strategies and minimum-lot sizing. **Do not causally compare their dollar totals as an A/B intervention.**

## A. 24 calendar-filtered leaders — matched fold-accounting comparison

| Symbol | Lane | Trades (2024) | Gross USD | Friction USD | Net USD | Break-even all-in friction as % of current | Training net USD (2022+23) |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| AUDUSD | open | 200 | +23.97 | +66.33 | -42.36 | 36.14% | -50.84 |
| AUDUSD | close | 162 | +11.84 | +58.08 | -46.24 | 20.38% | -50.30 |
| AUDUSD | intraday | 173 | +7.23 | +57.75 | -50.52 | 12.52% | -41.82 |
| EURUSD | open | 150 | +9.06 | +49.83 | -40.77 | 18.18% | -70.71 |
| EURUSD | close | 158 | +34.79 | +69.30 | -34.51 | 50.20% | -71.21 |
| EURUSD | intraday | 162 | +37.88 | +65.67 | -27.79 | 57.69% | -76.38 |
| GBPUSD | open | 197 | +22.21 | +71.28 | -49.07 | 31.16% | -87.62 |
| GBPUSD | close | 159 | +23.54 | +59.07 | -35.53 | 39.85% | -72.77 |
| GBPUSD | intraday | 156 | +43.81 | +59.73 | -15.92 | 73.35% | -59.65 |
| NZDUSD | open | 153 | -11.04 | +52.14 | -63.18 | -21.17% | -76.90 |
| NZDUSD | close | 159 | +21.20 | +67.32 | -46.12 | 31.50% | -58.31 |
| NZDUSD | intraday | 155 | -4.28 | +51.81 | -56.09 | -8.25% | -53.82 |
| USDCAD | open | 165 | +23.86 | +61.39 | -37.53 | 38.86% | -88.32 |
| USDCAD | close | 170 | +6.51 | +55.38 | -48.88 | 11.75% | -51.19 |
| USDCAD | intraday | 153 | +2.94 | +40.75 | -37.81 | 7.22% | -20.84 |
| USDCHF | open | 150 | +10.23 | +54.96 | -44.74 | 18.61% | -78.15 |
| USDCHF | close | 150 | +39.24 | +54.89 | -15.65 | 71.49% | -98.64 |
| USDCHF | intraday | 177 | +32.69 | +64.62 | -31.93 | 50.59% | -71.74 |
| USDJPY | open | 198 | +78.60 | +82.80 | -4.20 | 94.93% | -174.82 |
| USDJPY | close | 154 | +11.92 | +48.86 | -36.93 | 24.40% | -70.19 |
| USDJPY | intraday | 161 | +36.09 | +55.72 | -19.63 | 64.78% | -89.30 |
| XAUUSD | open | 180 | +207.14 | +207.90 | -0.76 | 99.63% | -185.33 |
| XAUUSD | close | 182 | +150.49 | +136.62 | +13.87 | 110.16% | -182.47 |
| XAUUSD | intraday | 175 | +199.36 | +126.72 | +72.64 | 157.33% | -68.48 |

The seventh column is gross divided by the original modeled friction; 100% means the **same frozen fills** are exactly break-even before changing execution paths. Negative percentages indicate gross loss before friction, so nonnegative friction cannot make the case profitable. It is **not** a pure-spread threshold because commissioned fills and foreign-exchange conversions are not separated in these public aggregates.

### Aggregated 24-leader diagnostics (NOT portfolio results)

| Fold group | Completed trades | Gross P/L | Modeled friction | Net P/L | Gross-positive leader cases | Net-positive leader cases |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Training 2022–23 | 5048 | +134.79 | +2084.61 | -1949.82 | 9 / 24 | 0 / 24 |
| Development 2024 H1+H2 | 3999 | +1019.30 | +1718.92 | -699.63 | 22 / 24 | 2 / 24 |

**Notable gold NY intraday (unchanged calendar-filtered model):** Training 2022–23: gross USD +169.12, friction USD +237.60, net USD -68.48 over 272 trades. 2024 development: gross USD +199.36, friction USD +126.72, net USD +72.64 over 175 trades. Thus favorable development results do not establish stable net expectancy in training.

## B. Latest 27 zero-commission fixed-0.01-lot diagnostics — exact frozen-fill break-even accounting

### Formula and what it does NOT establish

For each frozen 2024 two-fold fill set: modeled friction `C`, booked before-cost gross `G`, baseline spread `S`, fixed round-trip adverse slippage `Q` (both sides), and effective FX-converted position-price exposure `E=C/(S+Q)`. The **fixed-fill accounting** break-even spread is

`S_BE = G/E - Q`.

Assumptions: zero commission, proportional spread and slippage for every completed fill, unchanged number/size/timing/direction of trades, unchanged fills/stops/targets, and no changed entry or margin eligibility. These quantities are derived from existing booked gross and cost; **they are not actual reduced-spread replays.** Slippage `Q` is 0.6 pip round-trip for FX and USD 0.14 per gold ounce round-trip. Baseline `S` is 2.0 pips for FX, USD 0.45/oz for baseline gold, and USD 1.72/oz for wider-spread gold. Negative `S_BE` means the frozen trades would lose even with zero spread at unchanged modeled slippage. FX thresholds are in **pips**, gold thresholds in **USD/oz** assuming the modeled gold contract. Broker historical bid/ask and actual contract specs remain unverified.

| Symbol (model) | Lane | 2024 trades | Gross USD | Friction USD | Net USD | Gross/trade USD | Cost/trade USD | Accounting break-even spread |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| AUDUSD (base) | open | 11 | -0.02 | +2.86 | -2.88 | -0.002 | 0.260 | -0.618 |
| AUDUSD (base) | close | 24 | -2.65 | +6.24 | -8.89 | -0.110 | 0.260 | -1.704 |
| AUDUSD (base) | intraday | 18 | -1.77 | +4.68 | -6.45 | -0.098 | 0.260 | -1.582 |
| EURUSD (base) | open | 16 | -0.60 | +4.16 | -4.76 | -0.037 | 0.260 | -0.972 |
| EURUSD (base) | close | 43 | -0.63 | +11.18 | -11.81 | -0.015 | 0.260 | -0.747 |
| EURUSD (base) | intraday | 59 | -0.84 | +15.34 | -16.18 | -0.014 | 0.260 | -0.742 |
| GBPUSD (base) | open | 5 | -0.49 | +1.30 | -1.79 | -0.098 | 0.260 | -1.580 |
| GBPUSD (base) | close | 12 | -2.34 | +3.12 | -5.46 | -0.195 | 0.260 | -2.554 |
| GBPUSD (base) | intraday | 26 | +5.79 | +6.76 | -0.97 | 0.223 | 0.260 | 1.628 |
| NZDUSD (base) | open | 19 | -2.67 | +4.94 | -7.61 | -0.140 | 0.260 | -2.005 |
| NZDUSD (base) | close | 2 | -0.91 | +0.52 | -1.43 | -0.456 | 0.260 | -5.162 |
| NZDUSD (base) | intraday | 7 | -1.78 | +1.82 | -3.60 | -0.254 | 0.260 | -3.140 |
| USDCAD (base) | open | 8 | +0.56 | +1.54 | -0.98 | 0.070 | 0.192 | 0.344 |
| USDCAD (base) | close | 26 | +1.11 | +4.91 | -3.81 | 0.043 | 0.189 | -0.013 |
| USDCAD (base) | intraday | 9 | +1.00 | +1.73 | -0.73 | 0.111 | 0.192 | 0.902 |
| USDCHF (base) | open | 6 | -2.11 | +1.80 | -3.91 | -0.352 | 0.299 | -3.655 |
| USDCHF (base) | close | 21 | -1.05 | +6.19 | -7.24 | -0.050 | 0.295 | -1.043 |
| USDCHF (base) | intraday | 36 | +3.72 | +10.79 | -7.07 | 0.103 | 0.300 | 0.296 |
| USDJPY (base) | open | 19 | +2.38 | +3.29 | -0.91 | 0.125 | 0.173 | 1.280 |
| USDJPY (base) | close | 19 | -2.51 | +3.29 | -5.80 | -0.132 | 0.173 | -2.581 |
| USDJPY (base) | intraday | 39 | -3.72 | +6.83 | -10.55 | -0.095 | 0.175 | -2.018 |
| XAUUSD (wide) | open | 19 | +1.52 | +35.34 | -33.82 | 0.080 | 1.860 | -0.060 |
| XAUUSD (wide) | close | 16 | -0.72 | +29.76 | -30.48 | -0.045 | 1.860 | -0.185 |
| XAUUSD (wide) | intraday | 29 | +0.40 | +53.94 | -53.54 | 0.014 | 1.860 | -0.126 |
| XAUUSD (base) | open | 62 | +19.10 | +36.58 | -17.48 | 0.308 | 0.590 | 0.168 |
| XAUUSD (base) | close | 90 | -23.00 | +53.10 | -76.10 | -0.256 | 0.590 | -0.396 |
| XAUUSD (base) | intraday | 10 | -0.04 | +5.90 | -5.94 | -0.004 | 0.590 | -0.144 |

### All nine gross-positive rows, sorted by accounting break-even spread within differing instrument units

**Do not compare the numeric gold threshold to FX pips; units differ.**

| Symbol / lane / model | Trades | Current model spread | Break-even spread | Gross USD | Cost USD | Net USD |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| GBPUSD · intraday · base | 26 | 2.000 | 1.628 | +5.79 | +6.76 | -0.97 |
| USDJPY · open · base | 19 | 2.000 | 1.280 | +2.38 | +3.29 | -0.91 |
| USDCAD · intraday · base | 9 | 2.000 | 0.902 | +1.00 | +1.73 | -0.73 |
| USDCAD · open · base | 8 | 2.000 | 0.344 | +0.56 | +1.54 | -0.98 |
| USDCHF · intraday · base | 36 | 2.000 | 0.296 | +3.72 | +10.79 | -7.07 |
| XAUUSD · open · base | 62 | 0.450 | 0.168 | +19.10 | +36.58 | -17.48 |
| USDCAD · close · base | 26 | 2.000 | -0.013 | +1.11 | +4.91 | -3.81 |
| XAUUSD · open · wide | 19 | 1.720 | -0.060 | +1.52 | +35.34 | -33.82 |
| XAUUSD · intraday · wide | 29 | 1.720 | -0.126 | +0.40 | +53.94 | -53.54 |

### Cohort totals, separated to avoid conflating alternative gold-spread scenarios

| Cohort | Trades | Gross USD | Costs USD | Net USD | Gross-positive variants | Nonnegative break-even spreads |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| FX, 21 strategies | 425 | -9.53 | +103.29 | -112.82 | 6 | 5 |
| Gold, baseline-spread, 3 strategies | 162 | -3.94 | +95.58 | -99.52 | 1 | 1 |
| Gold, wider-spread, 3 strategies | 64 | +1.20 | +119.04 | -117.84 | 2 | 0 |

## Largest identifiable sources of losses and research priority

1. **Trading friction dominates the 2024 gross-positive losses.** Of 24 established leaders, 20 had positive pre-cost gross and were negative after friction. In the latest batch, 9 new diagnostic choices flip to negative; none survives the baseline cost profile.
2. **Unstable/negative before-cost expectancy persists.** The established 24-leader training set has only 9 gross-positive of 24 and no net-positive leader; latest batch has 18 gross-negative choices on already reused 2024 development data. Even eliminating all spread would leave some losing positions at fixed slippage and unchanged fills.
3. **Short holding caps and low risk/minimum-lot friction may be binding.** 390/651 later fills exit by time and 1741 later signal attempts fail sizing; these are not proven causes of negative P/L without private trade-level fill-path data.
4. **Pricing assumptions are unverified.** A higher gold-spread scenario materially raises cost to USD 1.86/oz per one-ounce fixed fill versus USD 0.59/oz low spread. The registered two scenarios are different selections and have different trade sets; their aggregate returns are **not** a matched proof that the spread difference alone caused a specified P/L delta.
5. **Calendar effects and coverage are additional confounds.** 2023 has known missing session windows, and the historical calendar is retrospective, not contemporaneous. Do not use the 2025 sealed holdout before a genuinely preregistered candidate qualifies.

## Next research-only action (no rule changes yet)

Obtain the private matched fill ledgers and broker-specific XAUUSD contract/quote specifications to compute *per-entry* spread cash cost, slippage cash cost, commissions, gross MAE/MFE, direction-conditioned expectancy, close reason P/L, and cost-adjusted feasible trade eligibility. Audit entry/exit efficiency and cost thresholds across 2022 and 2023 **without using reused 2024 as a selection target**. If full historical paired bid/ask quotes are not accessible, present break-even spread and costs as sensitivity boundaries, never executable backtest claims. Keep original production, historical code, position-sizing logic, and 2025 holdout unchanged.

A machine-readable [75-row audit CSV](./xmi-profitability-matched-frozen-summaries-20261107.csv) accompanies this report (24 leaders × two period groups + 27 newer choices). It records independent experiment rows and their fixed-fill accounting sensitivities, not new trade fills.
