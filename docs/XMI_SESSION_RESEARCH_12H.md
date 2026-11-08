# XMI Forex and spot gold session research

This branch runs a historical study on independent simulated USD 1,000 accounts. The universe is EUR/USD, GBP/USD, USD/JPY, USD/CHF, AUD/USD, USD/CAD, NZD/USD, and spot XAU/USD. Results are grouped by market and by opening, closing, and intraday windows.

## Reproduce the development screens

The runner requires Python with NumPy, pandas, and SciPy, plus a C++17 compiler. The legacy signal replay also uses Node.js 22.15 or later and the repository's npm dependencies.

```bash
research_dir=/absolute/path/to/xmi-research
python scripts/xmi-session-data.py --cache "$research_dir/histdata" --years 2022 2023 2024
OPENBLAS_NUM_THREADS=1 python scripts/xmi-session-research.py screen \
  --cache "$research_dir/histdata" --output "$research_dir/expanded.json" --profile expanded --workers 4
OPENBLAS_NUM_THREADS=1 python scripts/xmi-session-research.py screen \
  --cache "$research_dir/histdata" --output "$research_dir/targeted.json" --profile targeted --workers 4
npm ci --no-audit --no-fund
OPENBLAS_NUM_THREADS=1 python scripts/xmi-session-research.py screen \
  --cache "$research_dir/histdata" --output "$research_dir/legacy.json" --profile legacy --workers 1
```

The downloader caches the original public HistData Generic ASCII M1 bid ZIPs. Timestamps use fixed EST, converted to UTC before applying London and New York daylight saving rules. The loader checks dates, OHLC bounds and positive prices, sorts out-of-order rows, removes only identical duplicate minutes, and fails on conflicting duplicate prices. A strategy can enter only in a session window with every minute present. This predeclared coverage filter avoids fabricated bars and can exclude sparse periods. Record the included session counts before comparing candidates. Treat any systematic gap as a data limit.

Training accounts reset at the start of 2022 and 2023. The two validation accounts reset at the start and midpoint of 2024. Results from these accounts support selection. Report their net P&L as the sum of separate runs and the highest of their individual drawdowns. The holdout is calendar 2025 UTC. This screen reads 2022–2024 archives only.

| Lane | Windows in local time |
| --- | --- |
| Opening | London 08:00–10:00, New York 08:00–10:00, gold US activity window 08:20–10:20 New York |
| Closing | London 15:00–17:00 and 15:30–16:30, New York 15:00–16:45, gold US midday window 12:30–13:45 New York |
| Intraday | London 10:00–15:00 or New York 10:00–15:00 |

The gold windows are research definitions for OTC spot activity. Dual-window variants use one account per instrument, shared across the two opening windows or the two closing windows.

## Strategy coverage and execution

- The four registry families use the closed-candle EMA cross, RSI recovery, prior Donchian breakout, and EMA plus RSI momentum rules. The 5-minute entry direction matched the repository registry on a EUR/USD sample. Stops and exits use the session study's execution assumptions.
- The preset screen models the chart's scalp, day, swing-bias, and pair-specific rules as executable entries. Swing context uses completed 4H candles with session-limited exits. Day trend runs without VWAP because every minute volume in the development archives was zero. Exact VWAP needs verified usable volume. The parked custom XMI preset needs its original hard-confirm rules before it can be tested.
- The legacy replay imports the existing USD/CHF V1 indicator and signal code, uses its soft-regime signal output, and derives the short-only A2 entry and channel exit from the existing structure timeline. It applies this study's capital, lot-size, cost, and time limits. The historical macro calendar and the live shadow risk configuration are outside this comparison.
- Opening research covers range breakouts, retests, failures, and opening impulses. Closing research covers earlier-session continuation, reversal, and channel breakouts. Intraday research covers trend pullbacks, reversion, range sweeps, and channel continuation.
- Signals read completed bars only. Entries use the next minute open within the active window. Positions close at the stop, target, opposite registry signal, time limit, or window boundary. A2 uses its short channel exit with a protective stop and session limit. If stop and target are both touched in a minute, the stop takes priority. An adverse price gap uses the next observed open. No account holds overlapping positions.
- Base execution assumes 2.0 FX pips of spread, 0.3 pips slippage per side and USD 3.50 per 100,000 units per side. XAU/USD uses USD 0.45 spread per ounce, USD 0.07 slippage per side and USD 0.035 per ounce per side. These are model inputs. Use 1.5× and 2× spread and slippage for stress. USD/JPY, USD/CHF, and USD/CAD P&L converts to USD at the modeled exit.
- Position sizes round down in 1,000 FX units or 1 gold ounce. The leverage assumptions are 30:1 FX and 20:1 gold. Entries that fall below the position minimum are skipped. The modeled risk levels are 0.25%, 0.5%, and 1% of current equity. The replay pauses the account on 10% marked drawdown. The 0.1-ounce gold case is a separate sensitivity check.

HistData file specification and official bid/ask export reference. [HistData](https://www.histdata.com/f-a-q/data-files-detailed-specification/) · [Dukascopy](https://www.dukascopy.com/api/data/get/historical-data-export)

## Freeze and holdout

For a candidate to advance from the screen, require positive net P&L and at least 25 trades in each of the four development periods, at least 150 trades in both validation halves combined, and validation-half profit factors above 1.05. After development is complete, select at most one candidate per market and lane. Rank by worst-fold expectancy in R, then validation dollars and drawdown. Freeze and record candidate rules and hashes before running 2025.

```bash
python scripts/xmi-session-data.py --cache "$research_dir/histdata" --years 2025
python scripts/xmi-session-research.py freeze --cache "$research_dir/histdata" \
  --input "$research_dir/expanded.json" "$research_dir/targeted.json" "$research_dir/legacy.json" \
  --output "$research_dir/frozen.json"
```

Persist the small freeze manifest before running the holdout. If there are no finalists, keep 2025 sealed.

```bash
python scripts/xmi-session-research.py holdout --cache "$research_dir/histdata" \
  --input "$research_dir/frozen.json" --output "$research_dir/holdout.json"
```

Qualification requires at least 200 distinct completed holdout trades, positive net expectancy, profit factor above 1.50, and peak-to-trough drawdown below 10%. The candidate also needs positive net P&L and drawdown below 10% under 1.5× spread and slippage. Report the 2× stress case and weekly block-bootstrap interval separately. Record the final decision for each market and lane. Preserve failed results and use a different untouched period for any revised rules after the holdout.

## Hourly continuation

1. Audit session completeness and cross-check a stratified development sample against available independent quotes.
2. Measure spread by session with valid paired bid/ask samples. Respect provider rate limits and keep cost scenarios labeled if paired data is incomplete.
3. Improve spot gold opening entries using pre-open context and opening-range confirmation.
4. Improve Forex opening entries separately across the seven majors.
5. Test London and New York closing variants and the gold midday activity window.
6. Improve Forex intraday continuation and mean-reversion regime filters.
7. Improve gold intraday rules and test sensitivity to ounce increments.
8. Evaluate causal BOS and double-top/bottom signals. Run exact VWAP only with verified nonzero volume.
9. Review parameter neighborhoods, yearly stability, weekly trade clustering, slippage, and spread stress. Simulate shared-account overlap only when timestamped trade streams support it.
10. Freeze eligible finalists before opening 2025.
11. Replay the frozen finalists on 2025 once and record the qualification decision.
12. Publish the final ranked research report with coverage, counts, dollar results, expectancy, profit factor, drawdown, costs, and rule definitions.

Keep the run ledger and small manifests on this branch. Keep raw data and large intermediate result files outside Git. If data, account sizing, or an entry rule cannot be verified, record the gap and move to the next executable comparison.

## Checkpoint 0 · 2026-11-06

Completed 88,857 configurations across four development periods with 8,472,885 original minute bars. After removing 1,379 identical duplicate bars and 39,306 bars outside the research week's hours, 8,432,200 bars remained. All three profiles returned zero finalists under the advancement rules. The 2025 price series remains outside strategy evaluation.

| Profile | Configurations | Development output SHA-256 |
| --- | ---: | --- |
| Expanded | 36,855 | `f48c5c371891c7549e6cf2690475f150f4a2ec87180d04385ba536fc858f21cc` |
| Targeted | 51,948 | `10aa9acde0a0a676f6cf95406fda08f794573bd19d4834a5f6d1304cf402dc8a` |
| Legacy USD/CHF | 54 | `02a9feb49c15d108b12bd6956e676a497912ccb84c8a3330071b3ec686c78007` |

Among configurations with 200 or more validation trades and below 10% validation drawdown, the highest 2024 P&L was a gold New York intraday momentum variant. It returned USD 186.97 across the two validation accounts from 222 trades with a profit factor of 1.33 and maximum drawdown of 6.51%. Both training accounts lost money, totaling USD 124.62 in losses.

The next hourly increment should quantify why 2023 has reduced session coverage. For example, the EUR/USD New York open had 156 complete weekdays of 260 in 2023 versus 259 of 262 in 2024. The Jan 9, 2024 Dukascopy sample matched HistData closing quotes exactly across 1,438 EUR/USD and 1,380 XAU/USD minutes. This confirms timestamp and price decoding on that sample. Treat it as one apparent underlying feed when assessing independent confirmation. Broader paired bid/ask collection hit rate limits. Every 2022–2024 HistData minute volume field was zero.

## Checkpoint 1 · 2026-11-06

The New York coverage shortfall was concentrated from February 20 through July 28, 2023. The table counts complete weekday windows. Weekday denominators include holidays.

| Instrument and local window | 2023 full year | 2024 full year | Feb 20–Jul 28, 2023 |
| --- | ---: | ---: | ---: |
| EUR/USD London open, 08:00–10:00 | 258/260 | 259/262 | |
| EUR/USD New York open, 08:00–10:00 | 156/260 | 259/262 | 13/115 |
| EUR/USD New York intraday, 10:00–15:00 | 134/260 | 242/262 | 1/115 |
| XAU/USD New York open, 08:00–10:00 | 156/260 | 259/262 | 15/115 |
| XAU/USD New York intraday, 10:00–15:00 | 131/260 | 252/262 | 0/115 |

EUR/USD lost exactly the first or second hour of 85 New York opening windows in that interval. The bundled HistData status reports list recurring hour-length gaps in the fixed-EST source timestamps for both EUR/USD and XAU/USD, including March 20 and July 28. Over the 13,800 New York opening minute slots in the affected interval, at least one of the eight instruments was absent in every slot. All eight were absent together for 133 minutes. Treat the missing intervals as archive gaps with symbol-specific timing. FXCM's public weekly EUR/USD and USD/JPY archives returned HTTP 403 for all 12 sampled files, so the cause and actual missing quotes could not be confirmed against an independent feed. [HistData format](https://www.histdata.com/f-a-q/data-files-detailed-specification/) · [FXCM archive](https://github.com/fxcm/MarketData/blob/master/CandleData/README.md)

Replayed 4,084 fixed configurations from Checkpoint 0 with the same four USD 1,000 development accounts per configuration. The comparison used all complete windows and a matched subset with the same local ISO week and weekday present in 2022, 2023, and 2024, plus 120 consecutive pre-window minutes in each year. Existing indicator history remains in place. The match uses timestamp availability and is a sensitivity check. Each arm ran at base costs and at 1.5× spread and slippage with unchanged commissions. All 4,084 base rows matched the earlier screen's metrics exactly. There were zero development passes under the original filter in each of the four cases. No 2025 price data was used.

| XAU/USD 15m New York intraday momentum | 2024 trades | 2024 net across both halves | Profit factor | Max drawdown |
| --- | ---: | ---: | ---: | ---: |
| All complete windows, base costs | 222 | +USD 186.97 | 1.33 | 6.51% |
| All complete windows, 1.5× costs | 219 | +USD 93.63 | 1.16 | 6.65% |
| Matched windows, base costs | 98 | +USD 33.15 | 1.12 | 6.07% |
| Matched windows, 1.5× costs | 96 | +USD 30.56 | 1.12 | 5.56% |

The matched gold account lost USD 92.02 in 2023 and hit the drawdown pause. The positive 2024 result is sensitive to the available dates and costs. [Coverage and replay manifest](xmi-session-coverage-checkpoint-01.json)

```bash
OPENBLAS_NUM_THREADS=1 python scripts/xmi-session-coverage.py \
  --cache "$research_dir/histdata" --include-legacy --workers 8 \
  --normalized-cache "$research_dir/normalized-development" \
  --output "$research_dir/increment-01-coverage-replay-final.json"
```

Run after installing the legacy replay dependencies. The optional normalized cache contains UTC epoch minutes and a 4-by-N bid OHLC array in open, high, low, close order, with source hashes in each file. Keep the price cache outside Git. The next comparison should use verified paired quotes on complete development windows where available, and retain the modeled cost scenarios wherever paired quotes remain unavailable.

## Checkpoint 2 · 2026-11-06

Recovered January 2024 Generic ASCII bid/ask tick archives for all seven FX majors and XAU/USD through HistData's free export. The eight archives held 17,144,922 quote rows. The first published bid matched the minute-bar open in all 253,749 overlapping minutes. Each paired sample used the ask from that same tick. HistData supplies both series, so the comparison checks internal alignment. Independent feed confirmation is still unavailable. [HistData file specification](https://www.histdata.com/f-a-q/data-files-detailed-specification/)

Estimated a fixed 90th-percentile spread for each session from January 1–15 UTC. The replay used January 16–31 UTC and only compared measured and modeled spreads on identical complete windows. London and New York windows follow the local clocks defined above. Commission and slippage stayed at the original values for the measured-spread arm. The conservative arm took the higher of the modeled spread and measured percentile, then tested it at base and 1.5× spread and slippage. The replay uses a synthetic ask at the fixed spread.

| Calibration | Measured session spread at the 90th percentile | Modeled base |
| --- | ---: | ---: |
| Seven FX majors | 0.30–1.40 pips | 2.00 pips |
| XAU/USD | USD 0.350–0.360 per ounce | USD 0.450 per ounce |

All 48 calibrated symbol and session combinations had a measured percentile below the modeled spread. AUD/USD New York close at 15:00–16:45 had only two complete calibration windows against a minimum of five, so its 69 configurations kept modeled costs. The conservative arms matched the original model exactly on all 4,015 calibrated configurations. Across those same configurations, substituting the sampled percentile improved net P&L for 3,274, worsened it for 347, and left 394 unchanged. This covers two weeks of replay on one feed, with at most 60 trades for any configuration or cost case. Keep the original spreads and stress settings for the multiyear screen.

The XAU/USD 15m New York intraday momentum reference produced 10 trades and lost USD 12.21 at the modeled spread, USD 13.92 at the measured percentile, and USD 16.54 at 1.5× modeled spread and slippage. In the measured-percentile case, the lower spread increased one position by one ounce. The trade timestamps were identical and the larger position increased the net loss despite lower total trading costs. The four original development folds for the same configuration reproduced exactly with default costs. No holdout price data was read. [Paired quote audit and replay manifest](xmi-session-spread-checkpoint-02.json)

```bash
OPENBLAS_NUM_THREADS=1 python scripts/xmi-session-spreads.py \
  --cache "$research_dir/histdata" --ticks "$research_dir/paired-histdata" \
  --paired-cache "$research_dir/normalized-paired-202401" --include-legacy --workers 8 \
  --output "$research_dir/increment-02-spreads-final.json"
```

Use the original January Generic ASCII tick ZIPs in the private cache as `<lowercase-symbol>-2024-01-ticks.zip`. The optional normalized cache contains aligned UTC minute spreads in quote-price units. The new spread override is opt-in and changes the engine's source hash. Rebuild candidate screen artifacts under the current engine before freezing them. Next, compare gold opening-range variants with pre-open context on the full development history at original and stressed costs.

## Checkpoint 3 · 2026-11-06

Screened 6,624 new XAU/USD opening configurations across the four existing 2022–2024 development folds. Each fold and cost scenario used a separate USD 1,000 account. The London 08:00–10:00 and New York 08:00–10:00 local windows ran separately and together. The gold-specific 08:20–10:20 New York research window ran separately. The replay used 1-ounce minimums and increments, 20:1 modeled leverage, 0.25%, 0.5%, or 1% equity risk, and the original USD 0.450/oz spread, USD 0.070/oz slippage per side, and USD 0.035/oz commission per side. Stress multiplied spread and slippage by 1.5 with commission fixed.

The screen compared 15-, 30-, and 60-minute opening ranges with 5-, 15-, and 30-minute decision candles anchored to each local session start. Entries required either a close outside the range, a sweep followed by a close back inside, or an outside close followed by a retest. The breakout and sweep buffer was 0.1 ATR. All arms required a complete session and the preceding 60 minutes. The filtered arms divided the last close minus the first open of that hour by its high–low range. The aligned and countertrend arms required a drift magnitude of at least 0.25 in the respective direction. The balanced arm required magnitude below 0.25. The control used no drift filter.

The earliest entry was the minute after a full post-range decision candle, with a second post-range candle required for a retest. Entry had to precede the window cutoff. Trades used stops of 1.5, 2.25, or 3.0 ATR with a minimum stop-to-modeled-cost ratio of 2.0. Targets were 1.4R or 2.0R. The replay allowed up to two trades per window, one position at a time, with a maximum hold of 90 minutes and a flat position at cutoff.

| Gold opening window | Complete sessions with 60m prefix, 2022 / 2023 / 2024 | Configurations | At least 150 validation trades and drawdown below 10% |
| --- | --- | ---: | ---: |
| London 08:00–10:00 | 257 / 250 / 258 | 1,656 | 23 |
| New York 08:00–10:00 | 258 / 140 / 259 | 1,656 | 17 |
| Gold 08:20–10:20 New York | 258 / 139 / 259 | 1,656 | 8 |
| London and New York in one account | 515 / 390 / 517 | 1,656 | 40 |

Zero advanced. The highest-net 2024 configuration among those with at least 150 trades and drawdown below 10% was a 15-minute failed-breakout reversal aligned with pre-open drift in the combined London and New York account. It earned USD 54.49 across the two validation halves on 153 trades, with a 1.17 profit factor and 9.77% maximum drawdown. It hit the drawdown pause in both training years. With stressed costs, validation lost USD 49.50 on 128 trades and hit the drawdown pause. Five configurations met the positive-net, 25-trade minimum in both training years without a drawdown pause. The leaders picked on training results alone lost USD 27.85 in New York and USD 22.15 in the combined window during 2024 validation.

The 5,079 expanded and 7,722 targeted gold configurations reproduced their prior metrics exactly under the updated engine. Neither baseline advanced a gold finalist. Verified causal timing on synthetic candles, winter and summer window starts on real data, and lane cutoffs and one-ounce sizing on the leading configuration's trades. Calendar 2025 remained outside strategy evaluation. [Gold opening audit and replay manifest](xmi-session-opening-checkpoint-03.json)

```bash
OPENBLAS_NUM_THREADS=1 python scripts/xmi-session-research.py screen --profile opening-context \
  --symbols XAUUSD --workers 1 --cache "$research_dir/histdata" \
  --output "$research_dir/increment-03-opening-context-xauusd.json"
```

The opening-context profile uses the same screen and freeze input format as the original profiles. It requires the original development filter plus positive net and drawdown below 10% in every development fold under 1.5× spread and slippage. Reproduce any older screen intended for freeze against the final engine source hash. Next, run the opening-context profile across the seven FX majors using their 1,000-unit steps, then compare London, New York, and combined opening results by instrument.

## Checkpoint 5 · 2026-11-06

The seven-major opening-context comparison from Checkpoint 4 has no saved results on the research branch or in the inherited cache and remains pending.

Screened 10,692 closing configurations on 2022–2024 HistData minute bid bars, including 9,072 across the seven FX majors and 1,620 for XAU/USD. Each development fold and cost scenario used an independent USD 1,000 account. London windows were 15:00–17:00 and 15:30–16:30 local time. The New York window was 15:00–16:45 local time. Gold also used 12:30–13:45 New York as a research reference window. The combined London and New York account used the full closing windows without overlap. The replay filled the next minute after a closed signal, starting at the window's first minute and flattening by the cutoff.

The closing-context grid tested EMA continuation, RSI reversal and channel breakout with a 60- or 120-minute pre-window price reference and 5-, 15- and 30-minute decision bars. It used 0.25%, 0.5% and 1% equity risk, 1.5, 2.25 and 3.0 ATR stops, 1.4R and 2.0R targets, a minimum stop-to-cost ratio of 2.0, at most three trades per window and a 90-minute maximum hold. The original spread, slippage, commissions, margin limits and lot steps applied. Stress multiplied spread and slippage by 1.5 and held commission fixed.

| Highest net among closing configurations with 150 or more 2024 trades and drawdown below 10% | Trades | Net USD | Profit factor | Max drawdown | Stress net USD |
| --- | ---: | ---: | ---: | ---: | ---: |
| USD/CHF 5m London reversal | 158 | −31.65 | 0.65 | 2.85% | −45.38 |
| XAU/USD 5m London reversal | 151 | −32.64 | 0.88 | 5.49% | −49.33 |

The 2024 P&L and trade counts combine the two independent validation halves. Zero configurations advanced under the original development filter plus the four-fold cost stress check. No new standalone New York close, late London close or gold midday configuration reached the 150-trade and drawdown comparison threshold. The older targeted baseline's gold leader earned USD 73.31 on 229 validation trades with profit factor 1.16, and still failed the development gate. The older FX closing leaders remained negative. Verified the previous baseline leaders' metrics and checked position ordering, session cutoffs and unit steps on the selected trades. Calendar 2025 stayed sealed. [Closing results and reproducibility manifest](xmi-session-closing-checkpoint-05.json)

```bash
OPENBLAS_NUM_THREADS=1 python scripts/xmi-session-research.py screen --profile closing-context \
  --workers 8 --cache "$research_dir/histdata" --output "$research_dir/increment-05-closing.json"
```

The next planned comparison covers FX intraday trend continuation and mean-reversion regime filters. Retain the separate opening follow-up in the research queue.

## Checkpoint 6 · 2026-11-06

Screened 9,072 Forex intraday configurations across seven majors on verified 2022–2024 HistData minute bid bars. Each fold and cost case started at USD 1,000. The London and New York windows were 10:00–15:00 local time with DST applied independently. Entry followed the closed signal at the next minute open within the window. The replay closed positions by the cutoff with a maximum 90-minute hold.

The grid covered pullbacks, mean reversion, channel continuation and range sweeps on 5-, 15- and 30-minute bars. Matched pullback and mean-reversion variants used an ADX threshold of 20 or 25 on either the decision timeframe or the last completed hourly candle. Other parameters stayed fixed within each pair. The broader grid used 0.25%, 0.5% and 1% risk, 1.5, 2.25 and 3.0 ATR stops, 1.4R and 2.0R targets, and a stop at least twice modeled costs. FX sizing used 1,000-unit increments and 30:1 modeled leverage. Base costs were 2 pips of spread, 0.3 pips of slippage per side and USD 3.50 per standard lot per side. Stress increased spread and slippage by 50% with commissions fixed.

| Best 2024 result with at least 150 trades and drawdown below 10% | Trades | Net USD | Profit factor | Max drawdown | Stress net USD |
| --- | ---: | ---: | ---: | ---: | ---: |
| GBP/USD 15m London mean reversion with hourly ADX | 175 | −16.72 | 0.83 | 2.62% | −47.92 |
| USD/JPY 5m New York mean reversion with hourly ADX | 162 | −17.21 | 0.80 | 2.83% | −27.21 |

Zero configurations passed the development screen. Using hourly ADX improved 2024 net P&L in 13 of 58 matched pullback pairs and 76 of 159 matched mean-reversion pairs where both variants met the 150-trade and drawdown comparison threshold. Both earlier supported baseline leaders were negative. The legacy baseline lacked a configuration meeting the comparison threshold. Verified higher-timeframe availability, selected fills and 1,000-unit sizing. Calendar 2025 remains sealed. [Results and reproducibility manifest](xmi-session-intraday-checkpoint-06.json)

```bash
OPENBLAS_NUM_THREADS=1 python scripts/xmi-session-research.py screen --profile intraday-context \
  --symbols EURUSD GBPUSD USDJPY USDCHF AUDUSD USDCAD NZDUSD --workers 7 \
  --cache "$research_dir/histdata" --output "$research_dir/increment-06-intraday-fx.json"
```

Next, apply the intraday comparison to gold and compare the 1-ounce and 0.1-ounce modeled sizing steps.

## Checkpoint 7 · 2026-11-06

Replayed 1,296 XAU/USD intraday strategy configurations at both a 1.0-ounce and 0.1-ounce minimum and increment, for 2,592 sizing-specific configurations and 20,736 independent account replays across four folds and two cost cases. Each account started at USD 1,000. The replay used verified HistData minute bid bars for 2022–2024 and the Checkpoint 6 pullback, mean-reversion, channel continuation and sweep grid on 5-, 15-, and 30-minute decision bars. London and New York ran separately from 10:00 to 15:00 local time with DST. Entries followed fully closed signals at the next minute open before cutoff, with a 90-minute maximum hold and a flat position by cutoff.

Margin used 20:1 modeled leverage and a 90% equity allocation cap for entry margin. Risk budgets were 0.25%, 0.5%, and 1%. Base costs were USD 0.45/oz spread, USD 0.07/oz adverse slippage per side, and USD 0.035/oz commission per side. Stress raised spread and slippage by 50% and held commission fixed. Both minimums are modeled sensitivities. Complete London sessions numbered 256, 138, and 259 by year. New York had 252, 131, and 252. Missing sessions reduce comparability across years, especially in 2023.

| Best net in each arm with 150 or more validation trades and drawdown below 10% | Trades | Gross before costs USD | Net USD | PF | Max DD | Stress net USD |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| London channel continuation, 1.0 oz | 199 | 138.18 | −45.30 | 0.925 | 9.69% | −107.82 |
| London channel continuation, 0.1 oz | 211 | 54.88 | −0.43 | 0.998 | 2.62% | −25.16 |
| New York pullback, 1.0 oz | 160 | 121.00 | +8.14 | 1.024 | 4.33% | −58.86 |
| New York pullback, 0.1 oz | 203 | 190.16 | +25.23 | 1.046 | 9.07% | −104.58 |

The London leaders used different risk budgets. The two New York leaders were an exact sizing pair using 5-minute bars, 1% risk, ADX threshold 20, a 3 ATR stop and a 1.4R target. Fractional sizing eliminated that pair's 109 validation minimum-size skips, while stressed drawdown reached 10.01%. Across all matched configurations, fractional sizing increased completed validation trades in 1,060 of 1,296 pairs and reduced minimum-size skips in 1,207. Net P&L improved in 261 pairs and fell in 1,035. Zero configurations passed even the base development screen.

The earlier expanded and targeted intraday leaders replayed exactly at one ounce. They earned USD 105.95 and USD 186.97 respectively in 2024, at profit factors of 1.174 and 1.330, and both failed the development screen. The legacy profile covers USD/CHF only. Audited 2,899 leader fills for lane timing, overlap, maximum holding time, ounce multiples and modeled costs. The full run hash, archive hashes, configuration IDs and fold results for leaders are in the [reproducibility manifest](xmi-session-gold-sizing-checkpoint-07.json). Calendar 2025 was outside the replay.

```bash
OPENBLAS_NUM_THREADS=1 python scripts/xmi-session-gold-sizing.py \
  --cache "$research_dir/histdata" --output "$research_dir/increment-07-gold-sizing.json"
```

Next, test causal break-of-structure and double-top/bottom definitions using only confirmed swings. Exact VWAP is blocked by the zero-volume minute archives.

## Checkpoint 8 · 2026-11-06

Screened 4,608 break-of-structure and double-top/bottom configurations on all seven FX majors and XAU/USD, using the verified 2022–2024 HistData minute bid archives. This was 576 configurations per instrument, each with four separate USD 1,000 accounts at base costs and another four under 1.5× spread and slippage. The 2025 holdout was outside the replay. Exact VWAP remains blocked because the archive reports zero minute volume. No volume proxy was used.

These are modeled, symmetric closed-bar rules on 5-, 15- and 30-minute candles. A pivot is a strict high or low against two or three candles on either side. It becomes available at the close of the last required right-side candle. Break of structure uses the first later close crossing the latest confirmed swing high or low. The double pattern compares consecutive same-side pivots 2 radii to 24 bars apart, with prices within 0.35 ATR and a neckline at least one ATR deep. The first later close through the neckline signals the reversal. Levels expire after 24 bars from confirmation, with all pattern state cleared on missing candle intervals. Simultaneous opposite breaks cancel. Synthetic fixtures verified both reversal directions, a swing break, gap resets and prefix invariance.

DST-aware opening windows were 08:00–10:00 in each city. Closing windows were London 15:00–17:00 and New York 15:00–16:45. Intraday was 10:00–15:00 in each city. The replay filled at the next minute open after a fully closed signal, strictly before cutoff, and flattened by the cutoff or the 90-minute holding cap. Risk was 0.25% or 0.5% of equity with 1.5 or 2.25 ATR stops, a stop at least twice modeled costs and 1.4R or 2R targets. FX used 1,000-unit minimums and steps, 30:1 leverage, 2 pips spread, 0.3 pips slippage per side and USD 3.50 per standard lot per side. Gold used 1-ounce minimums and steps, 20:1 leverage, USD 0.45/oz spread, USD 0.07/oz slippage per side and USD 0.035/oz commission per side. Commission stayed fixed in stress. The archive hashes and complete-session counts are in the manifest.

| Best 2024 result with 150 or more trades and drawdown below 10% | Trades | Gross before costs USD | Net USD | Profit factor | Max drawdown | Stress net USD |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| USD/JPY 15m New York opening structure break | 155 | +25.69 | −21.40 | 0.797 | 2.70% | −35.37 |
| USD/JPY 15m London closing structure break | 152 | −1.09 | −50.17 | 0.570 | 4.22% | −53.94 |
| USD/JPY 30m London intraday structure break | 186 | +49.36 | −8.18 | 0.925 | 3.18% | −22.09 |

Zero advanced, including before cost stress. Of 535 setups meeting the trade count and drawdown comparison floor, the leading double pattern lost USD 45.35 on GBP/USD intraday. The best opening double pattern lost USD 124.16 on gold. No closing double pattern reached the comparison floor. The targeted baseline remained ahead in each lane by 2024 net at USD 13.75, USD 73.31 and USD 186.97 for open, close and intraday respectively, while its leaders failed the development screen. The expanded baseline intraday leader earned USD 105.95 and the legacy baseline had no leader meeting the comparison floor. Verified entry and cutoff timing on 2,255 completed leader trades. [Results and reproducibility manifest](xmi-session-structure-checkpoint-08.json)

```bash
OPENBLAS_NUM_THREADS=1 python scripts/xmi-session-research.py screen --profile structure-context \
  --workers 8 --cache "$research_dir/histdata" --output "$research_dir/increment-08-structure.json"
```

Next, review parameter neighborhoods, year-by-year consistency, clustered weekly results and cost sensitivity. Keep the separate seven-major opening-context follow-up visible in the ledger.

## Checkpoint 9 · 2026-11-06

Audited robustness across eight development screens with 122,445 distinct strategy and sizing configurations after deduplication. The source screens covered all seven FX majors and XAU/USD. Chose at most one configuration per instrument and lane using 2022 and 2023 alone. Both training years had to earn positive net P&L on at least 25 trades without a drawdown halt. Ranked eligible choices by the weaker training year's expectancy in R, then combined training net. Six additional leaders selected by 2024 results serve as descriptive comparisons only.

Replayed the 22 seeds and 81 distinct immediate neighbors, changing one setting at a time among risk, ATR stop and reward while keeping symbol, session, timeframe, rule and other settings fixed. All 103 reproduced their original base results exactly. There were 1,236 account replays across the four 2022–2024 folds and three cost scenarios, each starting with USD 1,000. Base fees and sizing follow the original engine, including the separate 0.1-ounce minimum and increment where specified. The 1.5× and 2× scenarios multiplied spread and adverse slippage only. Commission stayed fixed. Weekly uncertainty used 10,000 seeded block resamples of active weeks of completed validation trades.

| Configuration | 2022 net USD | 2023 net USD | 2024 trades | 2024 net USD | 2024 PF | Max drawdown | Net at 1.5× / 2× USD |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| USD/CAD 60m late London close Donchian, selected on training | +2.19 | +1.56 | 28 | +20.63 | 1.815 | 0.79% | +5.11 / −7.49 |
| XAU/USD 15m New York intraday momentum, selected on validation | −32.63 | −91.98 | 222 | +186.97 | 1.330 | 6.51% | +93.63 / +19.60 |

USD/CAD was the only one of 16 training-selected seeds with positive combined validation. Its three adjacent settings also had positive base validation, but the weekly expectancy interval crossed zero (−USD 0.32 to +USD 1.78 per trade) and the validation sample failed the 150-trade development gate. Its session was London 15:30–16:30 local. Gold used New York 10:00–15:00 local, failed in both training years and had a weekly interval of −USD 0.02 to +USD 1.74 per trade. These windows used DST and next-minute entry within the window with flattening by cutoff. Neither configuration advanced. Across all 103 configurations, 17 earned positive combined validation net, zero passed the base development gate, and zero earned positive net in all four folds under 1.5× costs with drawdown below 10% and no halt.

The shared-account portfolio remains untested. There were no eligible constituents and pooling fills from independent accounts would reuse their standalone sizing. The Forex opening-context comparison in Checkpoint 4 still has no completed result. The 2025 holdout remains sealed. Next, reconcile the development screen inventory and record the freeze decision before any holdout replay. [Configuration IDs, archive hashes and robustness results](xmi-session-robustness-checkpoint-09.json)

```bash
OPENBLAS_NUM_THREADS=1 python scripts/xmi-session-robustness.py \
  --cache "$research_dir/histdata" --output "$research_dir/increment-09-robustness.json" \
  --input "$research_dir"/{latest-expanded-screen,latest-targeted-screen,legacy-screen,increment-03-opening-context-xauusd,increment-05-closing,increment-06-intraday-fx,increment-07-gold-sizing,increment-08-structure}.json
```

## Checkpoint 10 · 2026-11-06

Completed the pending Checkpoint 4 seven-major FX opening comparison. The batch screened 34,776 configurations on verified 2022–2024 HistData minute bid archives, with 4,968 per instrument and independent USD 1,000 accounts per fold and cost case. The unchanged opening-context grid used 15-, 30- and 60-minute opening ranges, 5-, 15- and 30-minute decision candles, and breakout, failed breakout and retest entries. The same 60-minute pre-open drift filters as the gold study applied. A complete window and preceding hour were required. New York complete windows with the prefix fell to 136–143 across the seven pairs in 2023 versus 237–259 in 2024.

London and New York each used 08:00–10:00 local time with DST. Separate and combined-window accounts entered at the next minute open after a full post-range decision candle, or after the second such candle for retests, and flattened by cutoff. The model used 1,000-unit minimums and increments, 30:1 leverage, 0.25%, 0.5% or 1% risk, 2 pips spread, 0.3 pips slippage per side and USD 3.50 per standard lot per side. Stress multiplied spread and slippage by 1.5 and held commission fixed.

| Leading 2024 FX opening setup in each window with 150 or more trades and drawdown below 10% | Trades | Gross before costs USD | Net USD | Profit factor | Max drawdown | Stress net USD |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| USD/JPY London | 228 | +71.35 | −33.40 | 0.844 | 4.27% | −40.93 |
| USD/JPY New York | 150 | +47.88 | −15.07 | 0.879 | 3.00% | −29.73 |
| USD/JPY combined London and New York | 200 | +56.70 | −10.15 | 0.921 | 2.92% | −34.74 |

Zero passed the base or stressed development screen. The earlier targeted USD/JPY opening benchmark at +USD 13.75 was higher in 2024 and also failed development. The best combined new setup was a 5-minute failed breakout aligned with pre-open drift on a 15-minute opening range.

Reran 117,837 previously screened configurations on the current engine, including expanded, targeted, legacy, gold opening, closing, FX intraday and gold sizing. Their archives, coverage and every result row matched the earlier outputs exactly. The legacy rerun used the lockfile-verified trading-signals 8.3.0 dependency. With the new FX openings and the current-engine structure screen, the inventory contains 157,221 distinct strategy-and-sizing configurations. The standard freeze consumed 154,629 configurations. A separate identical rerun checked the 2,592 gold sizing sensitivity cases against the same base and stress gates. There were zero eligible candidates in either set.

The [immutable freeze](xmi-session-frozen-checkpoint-10.json) records an empty shortlist and no holdout archive hashes. Its canonical hash is `bdeb88ffa4306410b9bdf55b804408c03b49817f5254a0149e0dd56c51d90f96`. The [screen audit](xmi-session-screen-audit-checkpoint-10.json) records the input hashes, coverage, configuration IDs and descriptive leaders by instrument and lane. The 2025 holdout was untouched. The next checkpoint can verify the frozen decision and record that no holdout trades were eligible for replay. Keep any timing and coverage audit on development data.

## Checkpoint 11 · 2026-11-06

Verified the canonical hash of the Checkpoint 10 empty freeze against its screen audit and the current engine. The holdout command, pointed at an empty cache directory, returned an empty results array. It ran zero strategies and read zero 2025 archives. The output SHA-256 is `b0ad6d6b1afc5956b2e4d1e06085daec4c3577f1103d84b834fbb1db92a8cfb5`. There are zero qualifiers because zero strategies reached the holdout.

On 2022–2024 data, replayed the 24 descriptive leaders, one for each instrument and lane, under base, 1.5× and 2× spread and slippage with unchanged commission. Each of the 288 independent replays started at USD 1,000. Archive hashes matched the freeze. All 24 base benchmarks reproduced, as did the existing 1.5× benchmarks where available. Checked 22,245 completed trade records against planned entries, trade direction, independent DST-aware local window calculations, fold boundaries, no same-account overlap, maximum holding time and lot increments. Also verified friction and commission arithmetic on 12,504 USD-quoted trade records. USD-base trade costs reproduced through replay, and the per-fill conversion was outside the independent arithmetic check.

Four descriptive leaders earned positive 2024 net at base costs. Only XAU/USD New York intraday momentum stayed positive at both 1.5× and 2× costs. It lost money in both training years. No descriptive leader reached all four numeric qualification thresholds even on the 2024 validation sample. These are development results selected from the 2024 sample. The [leader audit](xmi-session-leader-audit-checkpoint-11.json) records configuration IDs, the freeze reference, 2022–2024 fold results and validation metrics under all three cost cases. Next, publish the final rankings and gate-by-gate report using the frozen inventory and these cost replays.

```bash
OPENBLAS_NUM_THREADS=1 python scripts/xmi-session-audit-leaders.py \
  --cache "$research_dir/histdata" --freeze docs/xmi-session-frozen-checkpoint-10.json \
  --screen-audit docs/xmi-session-screen-audit-checkpoint-10.json \
  --output "$research_dir/increment-11-leader-audit.json"
```

## Checkpoint 12 · Final XMI research report

**Zero strategies qualified.** The 2022–2024 development inventory contained 157,221 distinct strategy-and-sizing configurations across seven FX majors and spot XAU/USD. None cleared development. The frozen shortlist was empty, so the 2025 holdout remained sealed and generated zero trades. There is no forward-paper performance evidence.

### 2024 validation ranking

Each lane ranks one leader per instrument by combined 2024 net P&L among configurations with at least 150 trades and under 10% drawdown. These are descriptive ranks selected on 2024 data. Each training year and each validation half began at USD 1,000 in a separate account. Dollar results and trades add across the two validation halves. Drawdown is the larger half-year equity drawdown. Gross is net plus modeled execution costs. Profit factor divides positive after-cost trade P&L by absolute negative after-cost trade P&L.

#### Session open

| Rank | Instrument | Setup | Trades | Gross USD | Net USD | USD/trade | PF | Max DD | Net 1.5× / 2× USD | Failed gates |
| ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| 1 | XAU/USD | 15m opening context failure aligned · dual open | 153 | +177.25 | +54.49 | +0.36 | 1.171 | 9.77% | −49.50 / −85.90 | L, H, P, C |
| 2 | USD/JPY | 5m opening failure · london open | 162 | +166.59 | +13.75 | +0.08 | 1.043 | 5.69% | −16.24 / −25.08 | L, H, P, C |
| 3 | GBP/USD | 5m opening context failure plain · ny open | 160 | +36.18 | −19.92 | −0.12 | 0.753 | 1.88% | −26.79 / −36.92 | L, P, C |
| 4 | USD/CAD | 5m opening failure · ny open | 155 | +41.91 | −22.49 | −0.15 | 0.786 | 1.97% | −21.90 / −7.96 | L, P, C |
| 5 | EUR/USD | 15m opening context failure plain · ny open | 161 | +26.26 | −30.83 | −0.19 | 0.689 | 2.02% | −46.90 / −35.97 | L, P, C |
| 6 | USD/CHF | 5m rsi recovery · london open | 168 | +27.16 | −34.10 | −0.20 | 0.624 | 3.59% | −58.84 / −83.59 | L, H, P, C |
| 7 | AUD/USD | 15m opening failure · london open | 158 | +9.97 | −42.17 | −0.27 | 0.392 | 3.40% | −53.00 / −20.09 | L, P, C |
| 8 | NZD/USD | 15m opening context failure plain · london open | 156 | +8.56 | −44.24 | −0.28 | 0.321 | 2.94% | −59.68 / −57.41 | L, P, C |

#### Session close

| Rank | Instrument | Setup | Trades | Gross USD | Net USD | USD/trade | PF | Max DD | Net 1.5× / 2× USD | Failed gates |
| ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| 1 | XAU/USD | 15m trend momentum · dual close | 229 | +247.55 | +73.31 | +0.32 | 1.159 | 7.85% | −11.81 / −45.57 | L, H, P, C |
| 2 | EUR/USD | 15m trend momentum · dual close | 160 | +31.00 | −22.46 | −0.14 | 0.690 | 2.11% | −32.66 / −24.96 | L, P, C |
| 3 | USD/CHF | 5m close reversal · london close | 160 | +34.85 | −23.67 | −0.15 | 0.731 | 2.10% | −33.90 / −3.83 | L, P, C |
| 4 | GBP/USD | 5m close reversal · london close | 186 | +35.90 | −32.74 | −0.18 | 0.760 | 3.57% | −38.06 / −19.62 | L, P, C |
| 5 | USD/JPY | 15m trend momentum · dual close | 167 | +17.69 | −35.30 | −0.21 | 0.636 | 2.71% | −41.47 / −34.64 | L, P, C |
| 6 | USD/CAD | 15m donchian breakout · london close | 186 | +16.63 | −42.61 | −0.23 | 0.626 | 2.79% | −60.84 / −62.13 | L, P, C |
| 7 | NZD/USD | 5m close reversal · london close | 158 | +7.84 | −49.91 | −0.32 | 0.439 | 3.35% | −37.79 / −16.15 | L, P, C |
| 8 | AUD/USD | 15m trend momentum · dual close | 182 | +8.48 | −53.56 | −0.29 | 0.427 | 3.05% | −56.57 / −32.26 | L, P, C |

#### Intraday

| Rank | Instrument | Setup | Trades | Gross USD | Net USD | USD/trade | PF | Max DD | Net 1.5× / 2× USD | Failed gates |
| ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| 1 | XAU/USD | 15m trend momentum · ny intraday | 222 | +350.65 | +186.97 | +0.84 | 1.330 | 6.51% | +93.63 / +19.60 | L, H, C |
| 2 | USD/JPY | 30m structure bos · london intraday | 186 | +49.36 | −8.18 | −0.04 | 0.925 | 3.18% | −22.09 / −28.55 | L, P, C |
| 3 | GBP/USD | 15m intraday mean hourly · london intraday | 175 | +41.03 | −16.72 | −0.10 | 0.826 | 2.62% | −47.92 / −59.40 | L, P, C |
| 4 | EUR/USD | 15m rsi recovery · ny intraday | 159 | +55.69 | −19.55 | −0.12 | 0.836 | 2.68% | −53.78 / −64.57 | L, P, C |
| 5 | AUD/USD | 30m trend momentum · ny intraday | 153 | +20.27 | −30.22 | −0.20 | 0.701 | 2.50% | −39.97 / −17.78 | L, P, C |
| 6 | USD/CAD | 15m intraday sweep · london intraday | 156 | +17.25 | −32.68 | −0.21 | 0.654 | 4.00% | −36.17 / −30.17 | L, P, C |
| 7 | USD/CHF | 5m rsi recovery · ny intraday | 220 | +42.59 | −37.80 | −0.17 | 0.734 | 4.38% | −70.30 / −102.79 | L, P, C |
| 8 | NZD/USD | 30m structure bos · ny intraday | 164 | +9.09 | −45.03 | −0.27 | 0.449 | 3.24% | −62.27 / −60.64 | L, P, C |

### Advancement and qualification

- **Development gates.** V requires at least 150 combined validation trades. N requires at least 25 trades in each of the four folds. L requires strictly positive net P&L in each fold. H requires no drawdown halt in any fold. P requires profit factor strictly above 1.05 in each validation half. C is the robustness check requiring positive net P&L, drawdown below 10% and no halt in each fold at 1.5× spread and slippage. The base failures alone eliminated every candidate.
- **Holdout gates.** At least 200 distinct completed trades, positive net expectancy, profit factor strictly above 1.50, drawdown strictly below 10% without a halt, positive net and drawdown below 10% without a halt at 1.5× costs, clean data and timing, and stability across nearby settings and market periods. The 2× case is a separate sensitivity check. With zero frozen candidates, these gates were unevaluated on 2025.
- **Closest observations.** New York gold momentum made USD 186.97 at base costs, USD 93.63 at 1.5× and USD 19.60 at 2× in 2024. It lost USD 32.63 in 2022 and USD 91.98 in 2023, and its weekly 95% expectancy interval included zero. The training-selected USD/CAD late-London Donchian breakout made USD 20.63 at a 1.815 profit factor but had only 28 validation trades and lost USD 7.49 at 2× costs.

### Configurations and execution

| Profile | Distinct configurations |
| --- | ---: |
| expanded | 36,855 |
| targeted | 51,948 |
| legacy | 54 |
| opening-context | 6,624 |
| closing-context | 10,692 |
| intraday-context | 9,072 |
| gold-sizing | 2,592 |
| structure | 4,608 |
| fx opening | 34,776 |

The 88,857 baseline configurations included EMA cross, RSI recovery, Donchian breakout, EMA plus RSI momentum, modeled public presets and the documented USD/CHF legacy replay. The 68,364 additions tested opening-range confirmation, pre-open drift, closing reversal and continuation, higher-timeframe intraday filters, fractional gold sizing, and confirmed swing and double-pattern rules. The 117,837 parity reruns, 103 robustness configurations and 288 leader account replays do not increase the distinct count.

The engine used 5-, 15- and 30-minute decision candles and selected 60-minute rules. London and New York opens were 08:00–10:00 local. London closes were 15:00–17:00 or 15:30–16:30 local, New York close was 15:00–16:45, and intraday was 10:00–15:00 in each city. Gold also used 08:20–10:20 and 12:30–13:45 New York activity windows. Entries were at the next minute open after a completed signal and strictly before the local cutoff. Positions flattened by cutoff. The replay handled adverse gaps at the next observed open, gave the stop priority on ambiguous bar ranges and stopped new trading after a 10% marked drawdown.

| Model | Spread | Slippage per side | Commission per side | Minimum and step | Leverage |
| --- | ---: | ---: | ---: | --- | ---: |
| Spot FX | 2.0 pips | 0.3 pips | USD 3.50 per 100,000 units | 1,000 units | 30:1 |
| Spot XAU/USD | USD 0.45/oz | USD 0.07/oz | USD 0.035/oz | 1 oz, with separate 0.1 oz sensitivity | 20:1 |

Entry margin was capped at 90% of equity. Risk budgets were 0.25%, 0.5% or 1% of equity. Below-minimum sizes were skipped. USD-base FX P&L was converted to dollars at the modeled exit. Stress increased spread and slippage with unchanged commission. Costs are modeled using a bid archive and paired samples from the same provider.

### Coverage and remaining work

HistData Generic ASCII one-minute bid archives covered 2022–2024, ending roughly 22 months before this report. Source timestamps were fixed EST and converted to UTC before applying DST-aware session clocks. Verified all 24 development archive hashes against the freeze. Retained counts exclude exact duplicates and off-week minutes.

| Instrument | 2022 minutes | 2023 minutes | 2024 minutes |
| --- | ---: | ---: | ---: |
| EUR/USD | 370,948 | 321,259 | 370,587 |
| GBP/USD | 370,579 | 321,272 | 370,264 |
| USD/JPY | 370,682 | 321,760 | 370,230 |
| USD/CHF | 367,500 | 319,429 | 369,210 |
| AUD/USD | 369,646 | 320,686 | 368,970 |
| USD/CAD | 369,483 | 319,971 | 369,094 |
| NZD/USD | 368,516 | 319,631 | 368,607 |
| XAU/USD | 352,769 | 307,315 | 353,792 |

The archive had recurring 2023 session gaps. EUR/USD New York open had 156 of 260 complete weekdays in 2023 versus 259 of 262 in 2024 before the pre-open prefix requirement. Affected windows were excluded. The paired January 2024 HistData ticks checked bid alignment and spread plausibility. Dukascopy rate limits and FXCM access failures left broad independent feed confirmation unresolved. Exact VWAP was blocked by zero recorded minute volume. The undefined custom preset, a shared-capital portfolio, 2025 and forward performance were unevaluated. The portfolio had no eligible constituents. Twelve Data was excluded.

A practical paper next step is to log fresh paired quotes and simulated fills with zero orders, using fixed rules and separate USD 1,000 accounts. Use gold intraday momentum only as an execution benchmark. Compare actual observed spreads, minimum sizes and timing to the model, and require a new preregistered candidate to pass development before using sealed holdout data or starting a qualifying forward-paper run.

[Frozen shortlist](xmi-session-frozen-checkpoint-10.json) · [Screen counts, configuration IDs and coverage](xmi-session-screen-audit-checkpoint-10.json) · [Fold and cost replays](xmi-session-leader-audit-checkpoint-11.json)

## Follow-up · January 2024 paired-quote execution replay

Replayed the 24 existing instrument-and-session leaders from the completed development study. The entry rules, timeframes, position risk, stops and targets came from their recorded configurations. The test used an independent USD 1,000 account for each strategy and each of three execution cases, for 72 replays. The replay period was January 1–31, 2024 UTC, inside the original validation period. Indicators used the verified 2022–2024 minute bid archives. The 2025 shortlist is empty and the holdout is sealed.

The eight HistData archives contain 17,144,922 paired tick records. All 253,749 overlapping minutes matched the minute archive on bid open, high, low and close. Each evaluated session had a quote in every minute and full bid candle parity. The 24 setups covered 610 eligible windows counted across configurations. Source timestamps are fixed EST. The replay converts them to UTC and applies the London and New York clocks with daylight saving rules. Both archives come from the same provider. This measures execution sensitivity within an already-studied month. [HistData archive specification](https://www.histdata.com/f-a-q/data-files-detailed-specification/)

### Test specs

| Component | Setting |
| --- | --- |
| Instruments | EUR/USD, GBP/USD, USD/JPY, USD/CHF, AUD/USD, USD/CAD, NZD/USD and spot XAU/USD |
| Decision candles | 5, 15 and 30 minutes, with entries after the signal candle closes |
| Opening windows | London 08:00–10:00 and New York 08:00–10:00 local, separately or in a dual-window account |
| Closing windows | London 15:00–17:00 and New York 15:00–16:45 local, separately or in a dual-window account |
| Intraday windows | London or New York 10:00–15:00 local |
| Rules replayed | Opening-range failures, RSI recovery, regime-filtered mean reversion, close reversals, channel breakouts, range sweeps, break of structure and EMA/RSI momentum |
| Risk and margin | 0.25%, 0.5% or 1% of current equity by configuration, one open position per account, 90% entry-margin cap and a 10% marked-drawdown halt |
| FX units and costs | 1,000-unit minimum and step, 30:1 modeled leverage, 2-pip fixed spread, 0.3-pip slippage per side and USD 3.50 commission per 100,000 units per side |
| Gold units and costs | 1-ounce minimum and step, 20:1 modeled leverage, USD 0.45/oz fixed spread, USD 0.07/oz slippage per side and USD 0.035/oz commission per side |
| Spread comparison | Fixed modeled spread on the historical bid path, observed bid/ask, and 1.5× the greater of observed or modeled spread with 1.5× slippage. Commission stayed fixed. |

Long entries used ask and long exits used bid. Shorts reversed the sides. USD-base FX gains converted at the exit ask and losses at the exit bid. Stops filled on the first observed triggering quote, including adverse gaps. Targets capped favorable gaps at the target. Adverse events took precedence when quotes shared a timestamp. Time exits used the first quote of the final permitted minute, inside the session. The earlier minute replay priced opposite-signal exits at the just-closed minute close. This replay waits for the first quote after confirmation. These timing changes make comparisons across engines descriptive.

### January results

| Setup | Observed trades | Observed net USD | Observed PF | Observed max DD | Fixed net USD | Stress net USD |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| USD/JPY 5m London failed breakout | 24 | +46.20 | 2.589 | 0.98% | +36.99 | +15.68 |
| XAU/USD 15m New York intraday momentum | 16 | +7.80 | 1.174 | 3.57% | +5.11 | +0.95 |
| NZD/USD 5m London close reversal | 14 | +2.14 | 1.533 | 0.39% | +1.23 | −0.99 |

The USD/JPY rule waits for the London 08:00–08:15 opening range, then fades a closed 5-minute candle that pushes beyond the range by 0.1 ATR and closes inside. It uses a 1.7 ATR stop, 2.2R target and 0.5% risk. Its stress case completed 10 trades. The gold rule buys an RSI14 cross above 55 with EMA10 above EMA30 and sells a cross below 45 with EMA10 below EMA30. It uses a 1.7 ATR stop, 2.2R target and 1% risk.

Observed bid/ask raised net P&L for 20 of 24 configurations relative to fixed spread. Ten earned positive net at observed costs and eight did under stress. Each observed-cost account had at most 24 completed trades. The USD/JPY setup lost money in both training years. The qualification standard still requires at least 200 distinct holdout trades, positive net expectancy, profit factor strictly above 1.50, drawdown strictly below 10% and passing cost, timing and stability checks. The replay qualifies zero strategies.

All 72 cases reproduced on the normalized cache, including trade-ledger digests. Synthetic cases checked gap handling, target caps, short-side ask stops, same-timestamp ordering, the drawdown halt, USD-base conversion and opposite-signal exit timing. The manifest stores exact configurations, archive hashes, window counts and results, plus hashes of simulated trade logs. The next batch can extend the fixed USD/JPY and XAU/USD benchmarks to additional verified development months under the same execution policy.

[Replay manifest](xmi-session-quote-replay-202401.json)

```bash
OPENBLAS_NUM_THREADS=1 python scripts/xmi-session-quote-replay.py \
  --cache "$research_dir/histdata" --ticks "$research_dir/paired-histdata" \
  --normalized "$research_dir/normalized-ticks-202401" \
  --output "$research_dir/paired-quote-replay-202401.json"
```

## Follow-up · News and rollover controls

Added calendar blackouts and a rollover backstop to the research quote replay. The news windows reuse the existing XMI event settings. Standard releases block entries from 60 minutes before until 30 minutes after. FOMC events use 90 minutes before and 60 minutes after. A relevant currency in either leg makes the blackout apply. Gold uses USD events. Open positions close on the first observed quote in the last permitted minute before the blackout starts.

Rollover uses America/New_York local time, with a modeled entry block from 16:45 through 17:15 and flattening before 16:45. Friday's block extends through Sunday 17:15. Winter and summer boundaries are calculated separately. The 17:00 reference comes from OANDA's published FX and gold financing rules. The execution broker's contract schedule and holiday adjustments remain unverified. Current research lanes end by New York 16:45, so the rollover backstop changed none of the 72 original quote replay cases. [OANDA financing policy](https://www.oanda.com/ca-en/trading/financing-costs/)

The new runner defaults to strict calendar coverage. It blocks news-controlled trades when the calendar lacks full coverage for the period and the instrument's currencies. A partial calendar requires an explicit diagnostic option. The January sample contains 11 verified scheduled USD releases from BLS, BEA and the Federal Reserve, including CPI, payrolls, JOLTS, GDP, PCE and the FOMC decision, minutes and press conference. It is marked partial because other USD announcements, other currencies, speeches and unscheduled headlines are incomplete. Event times come from official historical pages. Contemporaneous changes to the original calendars are unarchived. [BLS calendar](https://www.bls.gov/schedule/2024/01_sched.htm) · [BEA GDP release](https://www.bea.gov/news/2024/gross-domestic-product-fourth-quarter-and-year-2023-advance-estimate) · [BEA PCE release](https://www.bea.gov/news/2024/personal-income-and-outlays-december-2023) · [FOMC statement](https://www.federalreserve.gov/newsevents/pressreleases/monetary20240131a.htm)

The diagnostic comparison replayed the same 24 January 2024 setups with USD 1,000 per account and fixed, observed and stressed costs. It compared unfiltered entries, news controls, rollover controls and both controls together. Every unfiltered result and simulated trade-log hash matched the prior replay. At observed spreads the news controls blocked 29 otherwise considered entries and forced 10 early exits. Net P&L improved for six setups, worsened for seven and was unchanged for eleven.

| January setup at observed spread | Original trades | Original net USD | Controlled trades | Controlled net USD | Controlled PF | Controlled max DD | Controlled stress net USD |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| USD/JPY London failed breakout | 24 | +46.20 | 24 | +46.20 | 2.589 | 0.98% | +15.68 |
| XAU/USD New York intraday momentum | 16 | +7.80 | 15 | +10.58 | 1.252 | 3.35% | +4.13 |
| XAU/USD closing momentum | 20 | −25.49 | 19 | −22.93 | 0.467 | 3.27% | −30.39 |

Seven regression tests covered incomplete-calendar blocking, currency scope, explicit timezone offsets, inclusive boundaries, winter and summer rollover, weekend reopening and closing a synthetic position before a release. Ten boundary cases matched the existing JavaScript blackout helper. Strict mode produced zero news-controlled trades with the incomplete sample. All 216 controlled diagnostic cases reproduced after the checks. Zero strategies qualified. Calendar breadth and future months remain research work, and the 2025 holdout remains sealed.

[Calendar input](xmi-news-calendar-202401.json) · [Comparison and input hashes](xmi-session-event-controls-202401.json)

The new research entrypoint is strict by default. Use the explicit partial-calendar flag only for a labeled diagnostic run.

```bash
OPENBLAS_NUM_THREADS=1 python scripts/xmi-session-event-controls.py \
  --cache "$research_dir/histdata" --ticks "$research_dir/paired-histdata" \
  --normalized "$research_dir/normalized-ticks-202401" \
  --calendar docs/xmi-news-calendar-202401.json \
  --allow-partial-news --output "$research_dir/event-controls-202401.json"
python -m unittest discover -s tests -p test_xmi_event_controls.py
```

## Follow-up · Complete historical calendars · 2026-11-07

Completed the 2022–2024 provider calendar for USD, EUR, GBP, JPY, CHF, AUD, CAD and NZD. Spot XAU/USD uses USD and global events; both currency legs apply to Forex pairs. The 36 original Forex Factory monthly pages contain all 1,096 expected calendar days and 14,501 source rows. Importing the eight currencies and global events retains 13,735 events. CNY-only rows are outside this study. Every month contains each research currency. Mirrored page states agree, rendered and serialized row counts match, IDs are unique, and every imported timed event agrees with its provider calendar day. Source pages were retrieved on 2026-11-07 UTC; these are retrospective schedules covering dates roughly 1.9–4.8 years before retrieval.

| Currency | 2022 events | 2023 events | 2024 events |
| --- | ---: | ---: | ---: |
| USD | 1266 | 1293 | 1407 |
| EUR | 1001 | 1029 | 1022 |
| GBP | 656 | 663 | 622 |
| JPY | 425 | 424 | 428 |
| CHF | 163 | 172 | 180 |
| AUD | 371 | 349 | 350 |
| CAD | 345 | 344 | 351 |
| NZD | 241 | 238 | 245 |

These currency counts exclude global events. The complete import includes all published provider impact levels and holidays. High-impact events, central-bank policy decisions and press conferences, currency holidays, and global medium/high-impact events generate 3,039 blackout records. Lower-impact events remain visible with an observe action. Of the blackout records, 517 have tentative, unspecified or variable times and use their entire provider calendar day with pre/post buffers. Full-day boundaries use Europe/London, including 23- and 25-hour DST days. BoJ variable-time decisions keep a full-day block even when the later actual release time is known. No actual, forecast, previous or revised economic values are included in the normalized input.

Standard timed releases use the existing XMI 60-minute-before/30-minute-after policy. Central-bank decisions and press conferences use 90 minutes before/60 minutes after, extending the existing FOMC policy to the other currencies. Entries remain next-bar executions after fully closed signals, and open positions flatten before a blackout. The 16:45–17:15 America/New_York rollover backstop, Friday-to-Sunday block and existing account/fee/size constraints remain active. This calendar contains public currency holidays; the execution broker's instrument-specific holidays, financing and maintenance schedule still require its contract calendar.

All 22 timing/date checks against official sources passed across the eight currencies, including winter/summer US release times, the Bank of Canada's January 2024 timing change and the BoJ variable release. This is independent spot verification, not a claim that every source row was separately verified. A community CSV was rejected for erroneous midnight policy-event times and inconsistent offsets. It was excluded from both the completed calendar and the replay. The normalized calendar SHA-256 is `ea2e7e62a799eb13886f87a81bd1ad542a7c208ea8f85df870218c4be23e8e2f`; every monthly source hash and official check is recorded in [the coverage audit](xmi-calendar-coverage-2022-2024.json).

The strict January 2024 paired-quote replay tested the same 24 fixed instrument/lane configurations at fixed, observed and stressed costs, with an independent USD 1,000 account for each case. It completed 216 controlled cases and reproduced all 216 exactly on a second run. All 72 uncontrolled cases and trade-log hashes still match the earlier benchmark; rollover-only results also match. No incomplete-calendar skips remain. At observed spreads, news controls blocked 175 considered entries and forced 10 early exits. Net P&L improved for eight setups and worsened for sixteen. All 24 trade logs differ from the earlier partial-calendar comparison. The following rows are separate accounts and must not be added together as a portfolio:

| January setup | Unfiltered net USD | Partial calendar net USD | Complete calendar net USD | Complete trades | Complete PF | Complete max DD | Complete stress net USD |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| USD/JPY London failed breakout | +46.20 | +46.20 | +26.15 | 14 | 2.948 | 0.87% | +4.88 |
| USD/JPY London intraday BOS | -0.66 | +1.59 | +7.10 | 13 | 2.392 | 0.44% | +7.31 |
| XAU/USD New York intraday momentum | +7.80 | +10.58 | -7.46 | 12 | 0.809 | 3.07% | -6.32 |
| XAU/USD opening failed breakout | +15.21 | +26.09 | +3.50 | 8 | 1.345 | 1.19% | -0.97 |
| XAU/USD closing momentum | -25.49 | -22.93 | -26.88 | 16 | 0.375 | 3.67% | -32.73 |

Thirteen regression tests passed, covering coverage failure, currency scope, observe-only rows, full-day uncertainty, non-US policy buffers, DST, rollover and forced exits. The strict replay SHA-256 is `af222d350eb51d5dddfc436b7ddfe6e53b7049ae276564203246208613efa8ed`. Exact configurations, costs, instrument units, date ranges, archive hashes and simulated trade-log hashes are in [the complete-calendar replay](xmi-session-calendar-complete-202401.json).

Zero strategies qualify. Every January account is below 200 completed trades, January is development evidence, and the calendar is a retrospective provider snapshot. Historical schedule edits, contemporaneous impact labels and surprise headlines remain outside the verified evidence. The 2022–2024 calendar is complete relative to the retrieved provider pages; a complete point-in-time news archive has not been established. The full historical strategy sweep has not yet been rerun with these calendars. The 2025 price holdout remains sealed. Production and staging services were unchanged, and no orders or paid data were used.

Next bounded batch: replay the fixed 24 configurations on the 2022–2024 minute archives under the same calendar policy, separating train/validation and modeling costs explicitly; expand quote verification only when independently verified paired archives exist. Do not select new parameters from January's results or open the 2025 holdout. Obtain broker-specific maintenance/holiday rules and contemporaneous schedule evidence before treating these controls as qualification evidence.

Rebuild the private normalized input from the cached public pages, or use `--download` once when the cache is absent. The downloader does not bypass rate limits. Keep vendor pages and the normalized full event calendar outside Git:

```bash
python scripts/xmi-session-calendar.py \
  --cache "$research_dir/economic-calendar-sources" \
  --anchors docs/xmi-calendar-validation-anchors.json \
  --output "$research_dir/XMI_Economic_Calendar_2022_2024.json" \
  --manifest "$research_dir/calendar-coverage-rebuilt.json"
```

## Follow-up · Full calendar rerun · 2026-11-07

Completed the full saved-grid rerun with the new 2022–2024 economic calendar. The HistData price archives, strategy rules and parameter grids were unchanged. All nine saved grid files matched their committed audit hashes and the original research engine identity. The inventory contains 157,221 unique effective strategy/sizing configurations across EUR/USD, GBP/USD, USD/JPY, USD/CHF, AUD/USD, USD/CAD, NZD/USD and spot XAU/USD. All configurations ran at base and 1.5× spread/slippage stress across 2022, 2023, 2024 H1 and 2024 H2: 1,257,768 independent USD 1,000 account replays.

| Saved grid | Configurations rerun |
| --- | ---: |
| expanded | 36,855 |
| targeted | 51,948 |
| legacy | 54 |
| opening-context | 6,624 |
| closing-context | 10,692 |
| intraday-context | 9,072 |
| gold-sizing | 2,592 |
| structure | 4,608 |
| fx-opening | 34,776 |

The strict calendar covers all eight currencies and global events, with standard 60-minute-before/30-minute-after blackouts and 90-minute-before/60-minute-after policy-event windows. Tentative/unknown/variable times use a full Europe/London provider day with buffers. Both FX currency legs apply; gold uses USD/global events. Entries remain after fully closed signals. The minute engine blocks any entry minute overlapping a restriction and closes at the preceding permitted minute's close before a blackout. It preserves each original session end and trade cap. This is minute-bar execution with modeled costs; the earlier January paired-quote replay uses observed quotes and a different forced-exit timestamp, so the two samples must be identified separately.

Base costs are 2 pips spread and 0.3 pip adverse slippage per side for FX, plus USD 3.50 per 100,000 base units per side. Gold uses USD 0.45 spread per ounce, USD 0.07 adverse slippage per ounce per side and USD 0.035 commission per ounce per side. The stress case multiplies spreads and slippage by 1.5 with unchanged commissions. Position sizing and stop/cost filters recalculate at stressed costs. FX minimum and step remain 1,000 base units at 30:1 leverage. Gold tests retain the saved 1.0- and 0.1-ounce minimum/increment arms at 20:1 leverage. The original risk budgets, margin limits, pessimistic ambiguous stops, gap handling, lane flattening and 10% drawdown halt remain in force.

Zero configurations pass the development screen, and zero satisfy all numerical validation qualification gates together. Across matched configurations, the calendar improves 2024 net P/L in 112,585 (71.6%), worsens it in 27,382 and leaves it unchanged in 17,254. These are per-configuration comparisons, not portfolio returns. Only ten configurations have positive 2024 net P/L with at least 150 trades, drawdown below 10% and no halt; all ten are gold. None reaches the complete qualification gates. All seven FX instruments' supported lane leaders remain net negative at modeled costs.

The following table ranks the highest-net descriptive configuration per instrument and session lane among configurations with at least 150 validation trades, maximum validation fold drawdown below 10% and no validation halt. It is a comparison threshold, not the qualification threshold of at least 200 trades. Every instrument/lane had a configuration meeting that comparison threshold. The two 2024 halves each start at USD 1,000; net P/L and trade counts sum those separate accounts, and drawdown is the higher half-year value. The rows do not form a portfolio, and these validation-selected leaders have not earned a holdout test.

| Lane | Instrument | 2024 trades | Gross P/L before costs USD | Costs USD | Net P/L USD | Expectancy USD | PF | Max fold DD | Stressed net USD |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| open | XAUUSD | 180 | +207.14 | 207.90 | -0.76 | -0.004 | 0.998 | 9.43% | -134.42 |
| open | USDJPY | 198 | +78.60 | 82.80 | -4.20 | -0.021 | 0.975 | 3.08% | -13.98 |
| open | USDCAD | 165 | +23.86 | 61.39 | -37.53 | -0.227 | 0.479 | 2.40% | -38.85 |
| open | EURUSD | 150 | +9.06 | 49.83 | -40.77 | -0.272 | 0.402 | 2.90% | -52.14 |
| open | AUDUSD | 200 | +23.97 | 66.33 | -42.36 | -0.212 | 0.485 | 3.49% | -64.42 |
| open | USDCHF | 150 | +10.23 | 54.96 | -44.74 | -0.298 | 0.493 | 2.78% | -33.70 |
| open | GBPUSD | 197 | +22.21 | 71.28 | -49.07 | -0.249 | 0.525 | 3.92% | -63.28 |
| open | NZDUSD | 153 | -11.04 | 52.14 | -63.18 | -0.413 | 0.154 | 3.20% | -78.98 |
| close | XAUUSD | 182 | +150.49 | 136.62 | +13.87 | +0.076 | 1.038 | 6.94% | -47.52 |
| close | USDCHF | 150 | +39.24 | 54.89 | -15.65 | -0.104 | 0.801 | 1.97% | -27.96 |
| close | EURUSD | 158 | +34.79 | 69.30 | -34.51 | -0.218 | 0.659 | 3.64% | -29.79 |
| close | GBPUSD | 159 | +23.54 | 59.07 | -35.53 | -0.223 | 0.687 | 3.45% | -37.76 |
| close | USDJPY | 154 | +11.92 | 48.86 | -36.93 | -0.240 | 0.573 | 3.35% | -29.04 |
| close | NZDUSD | 159 | +21.20 | 67.32 | -46.12 | -0.290 | 0.508 | 2.83% | -44.20 |
| close | AUDUSD | 162 | +11.84 | 58.08 | -46.24 | -0.285 | 0.442 | 2.64% | -44.46 |
| close | USDCAD | 170 | +6.51 | 55.38 | -48.88 | -0.288 | 0.498 | 3.45% | -39.36 |
| intraday | XAUUSD | 175 | +199.36 | 126.72 | +72.64 | +0.415 | 1.163 | 6.08% | +12.27 |
| intraday | GBPUSD | 156 | +43.81 | 59.73 | -15.92 | -0.102 | 0.852 | 2.14% | -38.88 |
| intraday | USDJPY | 161 | +36.09 | 55.72 | -19.63 | -0.122 | 0.821 | 4.11% | -35.39 |
| intraday | EURUSD | 162 | +37.88 | 65.67 | -27.79 | -0.172 | 0.719 | 2.71% | -21.55 |
| intraday | USDCHF | 177 | +32.69 | 64.62 | -31.93 | -0.180 | 0.694 | 3.09% | -58.05 |
| intraday | USDCAD | 153 | +2.94 | 40.75 | -37.81 | -0.247 | 0.465 | 2.66% | -48.33 |
| intraday | AUDUSD | 173 | +7.23 | 57.75 | -50.52 | -0.292 | 0.502 | 3.54% | -56.56 |
| intraday | NZDUSD | 155 | -4.28 | 51.81 | -56.09 | -0.362 | 0.312 | 3.72% | -69.95 |

The gold New York intraday EMA+RSI momentum leader uses 15-minute decision bars, 1% risk, a 1.7 ATR stop, 2.2R target and a 1-ounce minimum/increment. Its local entry window is 10:00–15:00 America/New_York with DST, flattened by 15:00. Its matched 2024 net falls from USD 186.97 without calendar controls to USD 72.64 with them: gross USD 199.36 less USD 126.72 costs, 175 trades, USD 0.415 net expectancy, PF 1.163 and 6.08% maximum validation fold drawdown. Stressed net is USD 12.27 at PF 1.027. It also loses USD 99.56 in the 2023 training account and triggers that account's 10% drawdown halt. It fails sample size, profit factor and stability requirements.

The following counts are independent marginal gate counts and overlap. The intersection is zero:

| Validation gate | Configurations meeting it |
| --- | ---: |
| At least 200 validation trades | 3,761 |
| Positive net validation expectancy | 6,158 |
| Validation profit factor strictly above 1.5 | 1,966 |
| Validation max fold drawdown strictly below 10%, with no halt | 127,354 |
| Positive stressed validation P/L and drawdown below 10% | 5,528 |
| All numerical validation gates together | 0 |
| Development and four-fold stress screen | 0 |

All 18 regression tests pass, including real C++ execution through a synthetic news gap, inclusive interval boundaries, full-period coverage failure and preserved session caps. 196 unfiltered account replays reproduce the saved baseline metrics. All 157,221 result IDs, saved baseline rows and profile memberships were independently checked against the input inventories. All eight full result-file hashes and row coverage checks passed. The prior 24 fixed leaders were matched in the new results. 9,047 retained leader trades were checked for blackout overlaps and ordering. The initial USD/CHF batch stopped because the isolated worktree lacked the existing locked trading-signals 8.3.0 dependency. After linking the existing local installation, USD/CHF replayed from the start; its incomplete first-attempt rows were excluded. Seven completed instrument files were reused. The runner now checks that dependency before starting a full grid.

The completed calendar is retrospective, with later schedule edits and impact reclassifications unverified. Existing 2023 price gaps remain excluded under the same complete-window rules. No historical spreads were invented for the full period. Broker-specific holidays/maintenance and contemporaneous calendar evidence remain unverified. The 2025 archive and holdout results remain untouched; there are zero finalists and zero qualifiers. Production and staging services were unchanged, and no orders, private production credentials or paid data were used.

[Full rerun summary, configurations, session windows, data hashes and costs](xmi-session-calendar-rerun-2022-2024.json) · [Independent gate audit and prior-leader comparisons](xmi-session-calendar-rerun-audit-2022-2024.json)

Next bounded work: independently verify paired execution costs on additional development months and recover contemporaneous event schedules before changing the strategy grid. Keep the 2025 holdout sealed. No configuration currently supports advancement to paper execution.

```bash
OPENBLAS_NUM_THREADS=1 python scripts/xmi-session-calendar-screen.py \
  --cache "$research_dir/histdata" --saved-screens "$research_dir" \
  --calendar "$research_dir/XMI_Economic_Calendar_2022_2024.json" \
  --output "$research_dir/calendar-screen-new" --workers 8
OPENBLAS_NUM_THREADS=1 python scripts/xmi-session-calendar-audit.py \
  --input "$research_dir/calendar-screen-new" \
  --output "$research_dir/calendar-screen-new-audit.json" --workers 8
```

## Follow-up · Gold news-window attribution · 2026-11-07

Diagnosed the same frozen 15-minute XAU/USD New York intraday EMA+RSI momentum configuration used in the complete-calendar replay. No parameters or blackout rules changed. The two 2024 validation accounts each started at USD 1,000 with the same base and stressed costs. Six baseline, full-calendar and stressed validation account replays exactly reproduced their saved results. The reconstructed raw-event intervals exactly matched the original merged blackout policy.

Completed 626 bounded account replays: the six parity accounts, 55 event-type removals at two cost cases across both halves, and 200 merged-window removals at base costs across both halves. Each removal is a diagnostic counterfactual with every other restriction retained. The table shows the change in the two-account 2024 net when all relevant instances of that one event type are removed. A positive recovery means that event-type block reduced modeled profit; a negative recovery means the block protected modeled profit. Overlapping event types can keep a window blocked even when one type is removed. These conditional effects are nonlinear and must not be added together.

| Event type removed | Instances | Net profit recovered USD | Resulting 2024 net USD | Resulting stressed net USD |
| --- | ---: | ---: | ---: | ---: |
| WEF Annual Meetings | 5 | +39.36 | +112.00 | +11.55 |
| 30-y Bond Auction | 3 | +20.26 | +92.91 | +23.77 |
| Prelim UoM Consumer Sentiment | 7 | +15.65 | +88.29 | +20.52 |
| 10-y Bond Auction | 1 | +14.76 | +87.40 | +8.99 |
| New Home Sales | 1 | +11.92 | +84.57 | +23.90 |
| ISM Manufacturing PMI | 12 | +4.97 | +77.62 | +26.99 |
| Fed Chairman Powell Testifies | 4 | +2.89 | +75.53 | +15.16 |
| OPEC-JMMC Meetings | 6 | +2.45 | +75.09 | +23.87 |

The WEF Annual Meetings block has the largest event-type opportunity cost at USD 39.36. Removing it increases modeled base-cost net from USD 72.64 to USD 112.00, while stressed net falls from USD 12.27 to USD 11.55. Higher base-cost profit therefore does not imply better execution-cost robustness. CPI, core CPI, regular non-farm payrolls, ADP and core PCE type-removal cases leave this configuration's net unchanged. The intraday lane starts at 10:00 America/New_York, after their modeled morning blackout windows.

Some controls protect profit. These rows show the P/L change if the event type is removed:

| Event type removed | Change in 2024 net USD |
| --- | ---: |
| FOMC Meeting Minutes | -9.15 |
| G20 Meetings | -11.60 |
| ISM Services PMI | -12.26 |
| Revised UoM Consumer Sentiment | -13.21 |
| Bank Holiday | -18.30 |

Trade-level accounting reconciles the USD 114.324954 reduction from the unfiltered run. Fifty original entries disappear, including 24 winners and 26 losers with combined original net USD 72.570243. Forty-five overlap an entry blackout directly; five have no direct entry overlap and are left as downstream path effects, with original net USD 25.774000. Three new entries lose USD 23.653347. The 172 shared entries lose USD 18.101365 relative to their originals: six earlier exits account for USD 17.884365 of that reduction, and the remaining shared-entry effects account for USD 0.217000. No absent trade is assigned to an announcement solely because an event happened later.

Twenty-one regression tests pass, including three new independent accounting checks for overlapping bundles, unexplained path effects and merged component membership. The private result contains all 55 event-type diagnostics, all 200 dated window diagnostics and the six early-exit event matches. Raw calendar rows and the dated window list were excluded from Git. The full private-result SHA-256 is `21dad35177da0de3b3e5d0116271e6aef6811e622698fe48fcf3bcbc99147ce1`. [Aggregate diagnostics and input hashes](xmi-session-news-attribution-2024.json)

This measures opportunity costs of the model's blackout policy. It does not establish that an announcement caused a price move or that the omitted trades were executable at the fixed modeled spreads. The provider calendar remains retrospective; announcement and holiday execution costs are unverified. These are validation diagnostics, not new qualified strategies. The 2025 archive remains sealed, and production and staging services are unchanged. No orders were submitted.

Next bounded work: inspect the classification and contemporaneous timing evidence for the broad WEF/OPEC blocks, and independently sample execution costs for the Treasury auction and FOMC windows. Keep these hypotheses separate from any future frozen strategy evaluation.

```bash
OPENBLAS_NUM_THREADS=1 python scripts/xmi-session-news-attribution.py \
  --cache "$research_dir/histdata" \
  --calendar "$research_dir/XMI_Economic_Calendar_2022_2024.json" \
  --output "$research_dir/gold-news-attribution-new.json"
```

## Follow-up · Preregistered news-policy refinement · 2026-11-07

Implemented four research-only event-aware policy candidates and compared them on the same 24 fixed instrument/lane leaders across all eight instruments. The original strategy parameters, risk budgets, sizing, costs, session clocks, entry timing and risk halts remain unchanged. This bounded comparison tested 96 policy/benchmark configurations and 1,152 independent USD 1,000 account cases: four policies × 24 benchmarks × four periods × three cost cases. Production and staging controls remain unchanged.

| Policy | Medium-impact global meetings | Timed macro block before/after | Policy decisions, press conferences and minutes |
| --- | --- | --- | --- |
| strict_60_30 | Full existing blackout | 60/30 minutes | 90/60 minutes |
| scoped_60_30 | Observe-only research overlay | 60/30 minutes | 90/60 minutes |
| scoped_45_30 | Observe-only research overlay | 45/30 minutes | 90/60 minutes |
| scoped_30_30 | Observe-only research overlay | 30/30 minutes | 90/60 minutes |

The meeting-scope rule applies uniformly when provider source_currency is All and impact is medium, excluding holidays and central-bank policy events. It contains no name/date exceptions chosen from profitable 2024 windows. High-impact global events and uncertain currency-specific events retain their full provider-day blocks and original buffers. Holidays retain their full-day blocks. The 16:45–17:15 America/New_York rollover backstop and Friday-to-Sunday restriction remain intact. Tentative events never acquire invented precise times. General speeches classified as macro events follow the timed macro buffer; the wider 90/60 policy buffer applies to the existing FOMC/central-bank event kinds.

The [candidate catalog](xmi-session-news-policy-candidates-20261107.json) and input hashes were fixed before computing this batch's results. The training-only selector requires at least 25 trades, positive net P/L, PF strictly above 1.05, marked equity drawdown strictly below 10% and no halt in every 2022 and 2023 account at 1×, 1.5× and 2× spread/slippage costs. It ranks eligible candidates by their worst training account, retaining the earlier, more conservative policy on a tie. When no candidate passes, it explicitly falls back to strict_60_30. The entire training selection was written and hashed before starting this batch's 2024 replays. A separate 2022-only choice was also evaluated on already-used 2023 data; no benchmark had an eligible 2022-only policy.

Zero policies pass the full training screen for any of the 24 benchmarks. No policy produces positive base-cost P/L in both training years for any benchmark. Every benchmark therefore retains the strict fallback. The following counts compare each policy's 2024 net to that benchmark's strict result, not a pooled portfolio:

| Policy | Training policy passes /24 | 2024 benchmarks improved /24 | 2024 benchmarks worsened /24 | Median 2024 net change USD |
| --- | ---: | ---: | ---: | ---: |
| strict_60_30 | 0 | 0 | 0 | +0.00 |
| scoped_60_30 | 0 | 4 | 20 | -4.60 |
| scoped_45_30 | 0 | 4 | 20 | -5.21 |
| scoped_30_30 | 0 | 4 | 20 | -5.23 |

The same gold New York intraday momentum benchmark illustrates the tradeoff. Each 2024 half starts at USD 1,000 independently; P/L and counts combine those two accounts, and drawdown is the higher fold drawdown. These are reused development results:

| Policy | 2024 net USD | PF | Trades | Max fold DD | 1.5× cost net USD | 2× cost net USD |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| strict_60_30 | +72.64 | 1.163 | 175 | 6.08% | +12.27 | -51.91 |
| scoped_60_30 | +96.56 | 1.201 | 189 | 5.19% | +4.28 | -50.08 |
| scoped_45_30 | +98.74 | 1.205 | 190 | 5.19% | +6.88 | -121.72 |
| scoped_30_30 | +102.93 | 1.214 | 191 | 5.19% | +10.07 | -42.01 |

The scoped 30/30 version improves gold's base-cost net by USD 30.29, but reduces its 1.5× cost net from USD 12.27 to USD 10.07 and remains negative at 2× costs. It has only 191 validation trades and PF 1.214. Its 2023 base-cost training account loses USD 100.67 and triggers the drawdown halt. The scoped 45/30 version also triggers a 2024 drawdown halt at 2× costs. Adjacent-window and cost behavior therefore do not justify adopting a looser policy. Strict remains the research default, and zero strategies qualify or advance to paper execution.

The policy selector uses 2022–2023 only, but the benchmark choices and hypotheses were already influenced by 2024. Calling the new 2024 figures fresh out-of-sample results would be incorrect. Limiting this comparison does not erase the earlier 157,221-configuration screen or the 55 event-type/200 window diagnostics. No PBO, CSCV or statistical-significance guarantee has been calculated. Chronological evaluation and explicit trial accounting follow the concerns described by [Bailey et al.](https://www.davidhbailey.com/dhbpapers/backtest-prob.pdf) and the [time-series validation documentation](https://scikit-learn.org/stable/modules/generated/sklearn.model_selection.TimeSeriesSplit.html).

Workspace maintenance removed the earlier local price cache. The code and latest report/calendar evidence were recovered, and all 24 HistData ZIPs were restored once using the existing public downloader. Every archive matches its original committed SHA-256. No 2025 archive was downloaded or opened. The calendar retains its original audited hash, and the known 2023 missing price windows remain excluded. A private reusable input checkpoint now contains exactly those 24 archives: `XMI_Verified_HistData_2022_2024.zip` (81,767,923 bytes), SHA-256 `e5aa9dc266cb645c6f37842a0468fa3791ccbec4ee7cde15b6c0db587dbc224c`. No raw vendor rows are included in the Git changes.

All 28 relevant regression tests passed. Seven new checks cover uniform global-event scope, retained holiday/high-impact/uncertain-time blocks, central-bank buffer preservation, macro boundaries, rollover, failed-stress fallback and rejection of validation folds by the selector. All 192 strict base/stress account results match the earlier checkpoint exactly. All 40,657 retained validation trades across the candidate policies and cost cases passed blackout and ordering audits. Input hashes, configurations, costs, selection records, trade-log hashes and all per-period metrics are in [the full comparison](xmi-session-news-refinement-20261107.json). The [preregistration](xmi-session-news-refinement-preregistration-20261107.json) and [training selection freeze](xmi-session-news-refinement-freeze-20261107.json) preserve the decision order.

The 2025 holdout remains sealed. Retrospective event labels/timing and unobserved event-specific bid/ask execution costs still prevent qualification claims. No orders, paid data, private production credentials or production/staging changes were used. Next bounded work should investigate the strategy's entry/exit edge and independently observed execution costs; the evidence does not support relaxing the current default news protections.

```bash
OPENBLAS_NUM_THREADS=1 python scripts/xmi-session-news-refinement.py \
  --cache "$research_dir/histdata" \
  --calendar "$research_dir/XMI_Economic_Calendar_2022_2024.json" \
  --output "$research_dir/news-refinement-new" --workers 8
```

## Follow-up · Fixed entry-and-exit diagnostic batch · 2026-11-07

Completed the authorized baseline-plus-three-experiment batch on the frozen gold New York intraday EMA10/EMA30 plus RSI55/45 cross strategy. The scope is this one documented 15-minute gold benchmark. All four cases keep the same USD 1,000 starting equity per account, 1% risk budget, 1.7 ATR stop, 2.2R target, 210-minute maximum hold, NY 10:00–15:00 DST-aware lane and flattening, 1-ounce minimum/increment, modeled 20:1 leverage, session trade cap, strict news/rollover rules and drawdown halt.

The [fixed hypothesis catalog](xmi-session-entry-exit-candidates-20261107.json) was written and hashed before computing the baseline diagnostics or alternative results. Tests were separate, with no combinations or threshold changes: (1) allow a new entry only when the fully closed signal candle is within one ATR of EMA10; (2) exit at the exact next minute's open after a subsequent fully closed 15-minute candle crosses EMA10 against the position; and (3) wait 30 full clock minutes after the stop minute before another entry. The signal-candle distance rule does not promise a fill-price distance when the next open gaps.

The original execution source is unchanged. A separate diagnostic kernel includes that frozen kernel and exports an additional entrypoint. The entry cap leaves the original opposite-signal exit timeline intact. Invalidation market exits use the next open without reading that minute's later high/low. Stop gaps and capped favorable target gaps retain precedence. Stop cooldowns use UTC elapsed minutes, not counts of available rows, and begin after the exit minute to avoid inventing an intraminute stop timestamp. Target, timeout and ordinary opposite-signal exits do not start the additional cooldown.

First audited the baseline 2022–2023 trades at base costs. There were 272 trades and 155 losses. MFE/MAE use initial bid-price stop distance as one R, separately from the engine's cost-inclusive cash-risk R. For intraminute stop/target/risk exits, the unknown exit-minute range is excluded; only fully held earlier minutes and the known fill endpoint count. These are conservative excursion lower bounds. Progress-time observations are minute-close upper bounds, not invented tick times. No new entry or exit rule uses the later excursion measurements.

| Training diagnostic | Observation |
| --- | ---: |
| Median favorable excursion | 0.603R |
| Median adverse excursion | 0.529R |
| Median modeled round-trip cost / initial stop distance | 0.131R |
| Losing trades observed to reach at least +0.5R | 47 / 155 |
| Losing trades observed to reach at least +1R | 18 / 155 |
| Losing trades with some positive modeled net excursion | 111 / 155 |
| Target exits | 18 / 272 |

The 272 original training trades included 71 stops, 18 targets, 179 time/lane/news exits, one risk-halt exit and three opposite-signal exits. The time/lane/news reason is combined and must not be interpreted as a pure timeout count. Observing earlier favorable movement does not by itself validate a tighter exit: the actual early-EMA experiment below performs worse.

Ran 48 distinct independent account cases: four variants × four periods × three cost cases. The cost cases retain USD 0.45/oz base spread, USD 0.07/oz adverse slippage per side and USD 0.035/oz commission per side, with 1×, 1.5× and 2× spread/slippage multipliers and unchanged commissions. Margin, minimum trade size, cost floors, gap risk and equity halts remain active. Every case's metrics and simulated trade-ledger digest reproduced on a second complete pass after fill-level audits were added. Each pass also performed 12 original-kernel baseline replays for parity; these are verification replays, not additional candidate configurations.

The training-only choice was frozen before this batch's 2024 evaluations. It reused the registered requirement of at least 25 trades, positive net P/L, PF above 1.05, drawdown below 10% and no halt in every 2022/2023 account at all three costs. No variant passed; baseline remains an unqualified fallback. The base-cost training results show the instability:

| Case | 2022 net USD | 2023 net USD | Halted in either training year |
| --- | ---: | ---: | --- |
| Original baseline | +31.08 | -99.56 | Yes |
| Signal close within 1 ATR of EMA10 | -64.75 | -100.10 | Yes |
| Exit on a later adverse EMA10 cross | -26.87 | -94.34 | Yes |
| 30-minute cooldown after a stop | -22.22 | -94.46 | Yes |

The following 2024 figures combine two separately reset USD 1,000 half-year accounts. Net P/L and trade counts are summed; drawdown is the higher fold value. This is reused development evidence, since the benchmark and hypotheses were already influenced by 2024:

| Case | Trades | Gross before costs USD | Costs USD | Net USD | PF | Max fold DD | 1.5× cost net USD | 2× cost net USD |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Original baseline | 175 | +199.36 | 126.72 | +72.64 | 1.163 | 6.08% | +12.27 | -51.91 |
| Signal close within 1 ATR of EMA10 | 147 | +135.20 | 105.60 | +29.60 | 1.083 | 6.15% | -11.82 | -53.90 |
| Exit on a later adverse EMA10 cross | 217 | +124.70 | 155.76 | -31.06 | 0.935 | 8.16% | -82.76 | -176.89 |
| 30-minute cooldown after a stop | 174 | +221.20 | 126.06 | +95.14 | 1.221 | 5.33% | +27.83 | -45.42 |

The cooldown improves 2024 net by USD 22.50 and maximum validation fold drawdown from 6.08% to 5.33%. It blocks five otherwise considered entry signals at base costs, but changes the later trading path and reduces the final trade count by only one. Its improvement is mostly higher gross P/L (USD 21.84), with USD 0.66 lower modeled costs. It still loses USD 22.22 in 2022 and USD 94.46 in 2023, triggering the 2023 drawdown halt. Its PF 1.221, 174 validation trades and negative 2× cost net fail the required gates.

The one-ATR entry cap reduces net by USD 43.04: gross P/L falls more than its cost savings. The early-EMA exit produces 125 invalidation exits at base costs, increases validation trades from 175 to 217 and raises costs from USD 126.72 to USD 155.76 while reducing gross P/L. It loses USD 31.06 at base costs and triggers a drawdown halt at 2× costs. These two hypotheses are not supported by this batch. No variant is promoted, and zero strategies qualify.

All 38 relevant regression tests passed, including ten new execution/diagnostic tests for original-kernel parity in USD-quoted and USD-base models, next-open exit timing, ignored post-exit bar ranges, gap priority, retained opposite-signal exits, clock-based stop cooldowns across gaps, absence of cooldown after targets, conservative excursion bounds, serializable diagnostics and later-candle invalidation timing. All 4,694 simulated fills per complete pass were audited for news/rollover overlap and ordering; candidate fills additionally passed entry-cap, closed-signal and cooldown checks. All 12 baseline account metrics and logs match the frozen original, and the three combined validation ledger digests match the prior committed records.

The [full result and verification hashes](xmi-session-entry-exit-20261107.json), [preregistration](xmi-session-entry-exit-preregistration-20261107.json) and [training freeze](xmi-session-entry-exit-freeze-20261107.json) preserve the evidence and chronology. Exact verified gold ZIPs and the audited calendar were reused with no vendor downloads. The known 2023 missing price windows, retrospective calendar limits and modeled full-period spreads remain limitations. No raw vendor rows or individual simulated ledgers were added to Git; the private evidence package preserves the complete simulated ledgers and excursion records.

The 2025 archive remains sealed. No production/staging changes, real or paper orders, paid data or private production credentials were used. No combined variants, new indicator settings, new targets or risk-budget changes were tested. Next bounded work should examine the fixed baseline's losing trade mechanisms and independently verified execution costs. The cooldown failed the current gates and requires independent evidence before any promotion.

```bash
OPENBLAS_NUM_THREADS=1 python scripts/xmi-session-entry-exit.py \
  --cache "$research_dir/histdata" \
  --calendar "$research_dir/XMI_Economic_Calendar_2022_2024.json" \
  --output "$research_dir/entry-exit-new"
```

## Follow-up · Strict scalping and training loss conditions · 2026-11-07

Scope was explicitly narrowed to scalping. The previous gold benchmark had 15-minute signals and a 210-minute maximum hold; it is retained only as a labeled intraday diagnostic. For this bounded scalp batch, the operational maximum is 15 elapsed minutes. All new candidates use closed 1-minute or 5-minute signals, exact next-minute entries, 5/10/15-minute hard clock caps, lane/news flattening, and separate USD 1,000 accounts. This maximum is a research definition adopted for the user's scalping constraint.

The candidate catalog was saved and hashed before any new replay or loss stratification. It covers all seven requested FX pairs plus spot XAU/USD: 504 configurations per instrument, 4,032 total. Each instrument uses the four registry baselines (EMA10/30 cross, RSI30/70 recovery, prior Donchian20 breakout, EMA10/30 plus RSI55/45 momentum), the documented modeled scalp preset (EMA20/50, RSI55/45, MACD histogram alignment), and two lane-specific families: 15-minute opening-range breakout/failure, 60-minute-context close continuation/reversal, or ADX25 trend pullback/ADX20 mean reversion. Signal definitions are inherited from the frozen research engine; the preset is an objective interpretation, not an exact broker implementation.

Every configuration uses a 1.5 ATR14 stop and 1.0 stop-distance target, with independent 0.25% and 0.5% equity-risk budgets. Those settings were fixed for this batch; there was no adaptive target, stop, indicator-threshold or market-regime search. Same-close opposite-signal exits are disabled uniformly. The original production/chart code and original replay source are unchanged. A separate scalp wrapper caps exit limits by UTC timestamps as well as row counts, preserving session counters through news blackouts. A missing minute cannot extend the maximum holding period.

| Reference lane | DST-aware local entry window | Latest ordinary fill minute / flat cutoff |
| --- | --- | --- |
| London open | 08:00–10:00 Europe/London | 09:59 / 10:00 |
| New York open | 08:00–10:00 America/New_York | 09:59 / 10:00 |
| London close | 15:00–17:00 Europe/London | 16:59 / 17:00 |
| New York close | 15:00–16:45 America/New_York | 16:44 / 16:45 |
| London intraday scalps | 10:00–15:00 Europe/London | 14:59 / 15:00 |
| New York intraday scalps | 10:00–15:00 America/New_York | 14:59 / 15:00 |

Only fully complete source-minute session windows are eligible. Actual fills also require a closed signal, safe news minute, sufficient risk/margin capacity and remaining session cap (open 2, close 3, intraday 5). Opening-range methods wait for the range and a subsequent closed decision bar; they cannot enter during their formation range. Positions flatten earlier at their bracket, 5/10/15-minute cap or last safe minute before news. The table's flat cutoff is the boundary after the final permitted source minute, not a guaranteed tick fill at that second.

Reused all 24 verified HistData ZIPs for 2022–2024, with no vendor downloads, plus the unchanged audited calendar SHA-256 `ea2e7e62a799eb13886f87a81bd1ad542a7c208ea8f85df870218c4be23e8e2f`. The inputs contain 8,472,885 original minute bars; exact source hashes, first/last timestamps, duplicate/sort audits and complete/missing window counts are preserved per instrument in the result. A private reusable normalized NumPy cache was created and its source and array hashes checked before reuse. As of 2026-11-07 these are approximately 1.9–4.8-year-old historical observations, not current trading conditions. No Twelve Data series was read.

The EUR/USD New York-open completeness issue remains: 2023 has 156/260 complete weekday windows versus 259/262 in 2024 (2022: 259/260). Incomplete windows were excluded and no prices were interpolated. The calendar is retrospective, with uncertain events treated as full-day blackouts; it is not a verified point-in-time release archive. Strict macro 60/30-minute, central-bank 90/60-minute, holiday/uncertainty and New York rollover controls remain active. No volume, order-flow or manipulation intent is inferred from minute OHLC.

Base costs remain 2.0 FX pips spread, 0.3 pip adverse slippage per side, and USD 3.50 per 100,000 base units per side. Gold uses USD 0.45/oz spread, USD 0.07/oz slippage per side and USD 0.035/oz commission per side: USD 0.66/oz round trip at base assumptions. The 1.5× and 2× cases multiply spread/slippage while retaining commissions. These are conservative models; there is no claim of observed full-period spreads. USD-base P/L and quote friction convert at exit. FX minimum/increment is 1,000 units, leverage 30:1; gold minimum/increment is 1 ounce, leverage 20:1. Entry margin is limited to 90% of equity; risk sizing rounds down and skips below-minimum fills. The original 10% marked-drawdown halt and pessimistic stop/target/gap handling remain active.

A separate audit checks every realized path against a modeled maintenance threshold of 50% of its initially reserved margin. No tested path breached it. A breach would reject the path rather than invent a broker-specific liquidation fill. The synthetic extreme-gap regression does trigger this rejection and bankruptcy flag. Broker liquidation rules and intraminute liquidity remain unverified; this audit is not a claim of historical broker execution.

The Q1 loss analysis reproduced the prior baseline's exact two training ledgers before classifying entry conditions. Features come only from the fully closed signal candle. Volatility is ATR14 / signal close × 10,000, with low/middle/high boundaries fixed from the 2022 complete NY-lane decision bars (5,040 bars): 14.311715 and 20.410663 basis points. The boundaries were then retained for 2023. The following partitions are descriptive; they are not new trading filters and overlapping tables must not be added together.

| Prior intraday training condition | Trades | Net USD | PF |
| --- | ---: | ---: | ---: |
| All 2022–2023 training fills | 272 | -68.48 | 0.903 |
| Low ATR/price regime | 87 | +42.08 | 1.196 |
| Middle ATR/price regime | 142 | -76.86 | 0.786 |
| High ATR/price regime | 43 | -33.71 | 0.740 |
| ADX14 below 20 | 97 | -8.01 | 0.969 |
| ADX14 20 to below 25 | 73 | -24.30 | 0.875 |
| ADX14 at least 25 | 102 | -36.17 | 0.855 |

The earlier baseline generated USD 169.12 before costs and paid USD 237.60, leaving a USD 68.48 net loss. In 2023 it lost USD 19.70 before costs and USD 99.56 after costs; cheaper execution alone would not rescue that year's observed path. All five New York entry-hour groups were negative after modeled costs. Higher ADX readings did not identify a profitable group. The low-volatility subset's PF 1.196 remains below 1.5 and has only 87 training trades; selecting it retrospectively would be another unqualified hypothesis. The 2023 account halted after 80 trades, and missing windows further limit representativeness. These associations do not establish a cause of losses.

Executed 24,192 independent training account cases (4,032 configurations × 2 years × 3 costs), then froze one diagnostic benchmark per instrument/lane before any new 2024 replay. A configuration needed at least 25 trades, positive net, PF > 1.05, DD < 10%, no halt and no maintenance breach in every training-year/cost account to be training-eligible. Zero configurations passed. The 24 frozen choices are explicitly unqualified training-ranked fallbacks, selected by the registered ranking; they are not finalists. No 2024 metric influenced this batch's freeze.

Evaluated those 24 fixed choices on 2024 H1/H2 at all three costs: 144 new development account cases. Also independently repeated their 144 selected training accounts with identical metrics, audits and ledger hashes, plus the two prior intraday baseline checks. Total distinct scalp account cases: 24,336. Training audits covered 1,950,408 simulated fills across configuration/cost cases; the new 2024 cases covered 6,840. These overlapping simulations are not 1.95 million distinct out-of-sample trades. Maximum audited elapsed holding upper bound was 15 minutes. An independent streaming inventory check reconciled every configuration ID, account, trade-audit count and saved training-file hash.

All 24 frozen benchmarks lost at 2024 base costs; none had 200 completed 2024 trades. Maximum base PF was 0.370 (USD/JPY NY-open RSI recovery, 95 trades, -43.23 USD net). All chose 5-minute signals and 0.25% risk under the fixed training ranking. That does not prove those settings are optimal or viable. The following tables rank the frozen diagnostic benchmarks within each lane by 2024 PF; 2024 has already been repeatedly used and remains development evidence. Net/gross/cost/trade totals combine two separately reset USD 1,000 half-year accounts; DD is the higher fold DD. They do not describe one compounded USD 1,000 year or a shared portfolio.

### Frozen open scalp diagnostics · reused 2024

| Instrument | Rule | Window | Signal / max hold | Trades | Gross USD | Costs USD | Net USD | Expectancy USD | PF | Max fold DD | 1.5× net USD | 2× net USD |
| --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| USDJPY | rsi-recovery | ny-open | 5m / 15m | 95 | +9.36 | 52.59 | -43.23 | -0.455 | 0.370 | 3.02% | -51.35 | -64.68 |
| GBPUSD | rsi-recovery | ny-open | 5m / 10m | 95 | +6.74 | 52.80 | -46.06 | -0.485 | 0.223 | 2.84% | -60.13 | -67.49 |
| EURUSD | rsi-recovery | ny-open | 5m / 15m | 78 | +6.30 | 54.78 | -48.48 | -0.621 | 0.177 | 3.20% | -58.98 | -67.87 |
| USDCAD | rsi-recovery | ny-open | 5m / 15m | 106 | +7.26 | 86.39 | -79.13 | -0.746 | 0.177 | 4.40% | -94.95 | -105.97 |
| XAUUSD | ema-trend | ny-open | 5m / 5m | 15 | -3.21 | 9.90 | -13.11 | -0.874 | 0.099 | 1.36% | -7.44 | -0.12 |
| NZDUSD | rsi-recovery | ny-open | 5m / 15m | 85 | +11.80 | 72.93 | -61.13 | -0.719 | 0.092 | 3.77% | -74.52 | -83.01 |
| AUDUSD | rsi-recovery | ny-open | 5m / 15m | 105 | -6.46 | 88.11 | -94.57 | -0.901 | 0.058 | 5.45% | -105.16 | -114.80 |
| USDCHF | rsi-recovery | ny-open | 5m / 5m | 107 | -4.73 | 76.72 | -81.45 | -0.761 | 0.053 | 4.53% | -93.27 | -101.68 |

### Frozen close scalp diagnostics · reused 2024

| Instrument | Rule | Window | Signal / max hold | Trades | Gross USD | Costs USD | Net USD | Expectancy USD | PF | Max fold DD | 1.5× net USD | 2× net USD |
| --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| USDCHF | ema-trend | london-close | 5m / 10m | 167 | -2.38 | 102.06 | -104.44 | -0.625 | 0.140 | 5.66% | -115.01 | -119.64 |
| GBPUSD | close-continuation | london-close | 5m / 15m | 55 | -12.37 | 26.40 | -38.77 | -0.705 | 0.122 | 2.39% | -38.89 | -40.38 |
| USDJPY | rsi-recovery | ny-close | 5m / 15m | 75 | +1.10 | 56.08 | -54.98 | -0.733 | 0.118 | 3.14% | -65.32 | -73.75 |
| AUDUSD | rsi-recovery | ny-close | 5m / 15m | 76 | +4.98 | 68.97 | -63.99 | -0.842 | 0.083 | 3.28% | -75.04 | -79.86 |
| USDCAD | close-continuation | london-close | 5m / 5m | 55 | -3.13 | 32.50 | -35.63 | -0.648 | 0.065 | 2.13% | -39.96 | -46.37 |
| NZDUSD | rsi-recovery | ny-close | 5m / 15m | 77 | +7.66 | 75.57 | -67.91 | -0.882 | 0.051 | 3.72% | -80.27 | -84.65 |
| XAUUSD | close-reversal | ny-close | 5m / 5m | 27 | +2.86 | 17.82 | -14.96 | -0.554 | 0.018 | 1.41% | -14.32 | -13.95 |
| EURUSD | rsi-recovery | ny-close | 5m / 5m | 91 | -3.90 | 85.14 | -89.04 | -0.978 | 0.012 | 4.54% | -101.11 | -102.76 |

### Frozen intraday scalp diagnostics · reused 2024

| Instrument | Rule | Window | Signal / max hold | Trades | Gross USD | Costs USD | Net USD | Expectancy USD | PF | Max fold DD | 1.5× net USD | 2× net USD |
| --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| USDJPY | intraday-pullback | ny-intraday | 5m / 15m | 138 | -5.11 | 66.58 | -71.69 | -0.520 | 0.227 | 4.51% | -82.85 | -93.04 |
| GBPUSD | intraday-pullback | ny-intraday | 5m / 15m | 147 | -13.16 | 72.93 | -86.09 | -0.586 | 0.209 | 4.92% | -93.36 | -104.36 |
| EURUSD | intraday-pullback | ny-intraday | 5m / 15m | 126 | +5.13 | 82.83 | -77.70 | -0.617 | 0.170 | 5.24% | -88.67 | -102.76 |
| USDCAD | intraday-pullback | ny-intraday | 5m / 15m | 154 | +0.65 | 101.73 | -101.08 | -0.656 | 0.165 | 7.06% | -117.65 | -126.13 |
| USDCHF | intraday-pullback | ny-intraday | 5m / 15m | 129 | -3.85 | 80.61 | -84.46 | -0.655 | 0.149 | 4.44% | -96.15 | -105.69 |
| AUDUSD | intraday-pullback | ny-intraday | 5m / 15m | 150 | +8.80 | 112.20 | -103.40 | -0.689 | 0.120 | 5.62% | -125.09 | -133.86 |
| XAUUSD | intraday-mean | ny-intraday | 5m / 10m | 16 | -0.93 | 10.56 | -11.49 | -0.718 | 0.057 | 1.19% | -6.16 | +0.00 |
| NZDUSD | intraday-pullback | ny-intraday | 5m / 10m | 139 | -9.11 | 107.25 | -116.36 | -0.837 | 0.052 | 6.40% | -134.65 | -142.46 |

Higher modeled costs can remove fills when the risk budget can no longer fund the minimum ounce/lot. Gold intraday at 2× costs records zero fills and zero P/L; that is not cost robustness. Per-fold minimum-size skips, costs, stop/target/timeout counts, halts, ledger digests and full config IDs are in the machine-readable results. The tables compare the identical frozen rules, with dynamically risk-sized fills; stressed accounts need not contain the same trades.

| Qualification gate | Result for 24 frozen scalp diagnostics |
| --- | --- |
| Positive base net expectancy | 0 pass |
| Base PF strictly above 1.5 | 0 pass |
| At least 200 distinct completed base validation trades | 0 pass |
| Base maximum equity DD strictly below 10%, no halt | 24 pass |
| Positive net and DD < 10% under both 1.5× and 2× modeled costs | 0 pass |
| Stable eligible 2022/2023 training at all modeled costs | 0 pass |
| No observed maintenance-margin audit breach | 24 pass |
| Untouched out-of-sample/holdout evidence | Not evaluated; 2025 sealed |
| All gates | 0 qualifiers |

All 40 relevant tests passed: 12 new scalp tests plus 13 event-control, 5 calendar-screen and 10 prior entry/exit tests. The new tests verify 5/10/15-minute clock bounds, gaps, next-open signal alignment, no same-close opposite exits, gold minimum sizing, USD-base fee/P&L conversion, pre-news flattening, rejection of long holds, future-price-independent entry features, deterministic threshold boundaries, unique bounded inventory and maintenance-breach rejection. The new tests and wrapper are separate; the earlier experiment's rules/results remain intact.

No 2025 archive was read, no strategy advanced to holdout or execution, and no production/staging code, service, order, purchase or private production credential was used. This batch did not test tick scalping, sub-minute signals, pair-specific or structure presets, gold-specific alternative hours, trailing/breakeven exits, verified variable spreads, a shared-capital portfolio or a new volatility/ADX trading filter. The next bounded step is scalp cost/size feasibility using independent quote evidence or an explicitly labeled diagnostic model; no cheaper spread should be assumed merely to produce a profitable backtest. Any new regime-gated scalp must be separately registered and tested without selecting on its 2024 result.

Reproduce with the verified private cache and calendar:

```bash
OPENBLAS_NUM_THREADS=1 python scripts/xmi-session-scalping.py \
  --cache "$research_dir/histdata" \
  --calendar "$research_dir/XMI_Economic_Calendar_2022_2024.json" \
  --normalized "$research_dir/scalp-normalized" \
  --output "$research_dir/scalp-new" --workers 6
```

Immutable output SHA-256 values:

- `results.json`: `7c4b5f63f187a2ce7341be6a3da5fd9c09f8281fce3d262320d5e0758a70e69e`
- `preregistration.json`: `f3c6426975ac806d9afde858f64b99af8d90daba958d4794cd9cf84d566fb3fa`
- `training-selection-freeze.json`: `5c533141a77ff23c67aa476f5e9af9134963e6083470ecf81404486b96c453de`
- `training-loss-conditions.json`: `2bbcde42e1e246eb93548b0e8d894f788285437d7f7fe0dfac2ae9907b2c83d2`

## Follow-up · Entry-only target-to-cost scalp filter · 2026-11-07

Completed the requested matched refinement of the 24 previously frozen scalp benchmarks, one per instrument/lane. All eight instruments remain in scope. This is 96 benchmark/filter combinations: unchanged rules with no filter or a minimum intended gross target equal to 2×, 3× or 5× full modeled round-trip cost. It is not a new search of all 4,032 base strategies, nor a claim that the old unqualified benchmarks were finalists. All 24 retain their original 5-minute signals, 5/10/15-minute maximum holds and 0.25% equity-risk budget. Each independent account starts with exactly USD 1,000. No targets, stops, costs, lot sizes, session rules or risk levels were altered to make a filter pass.

The catalog and wrapper were hashed before replay. A rejected signal receives a nonfinite execution distance and is skipped by the unchanged kernel; all signal rows and session-end identities remain in place. The full account path is then re-simulated. Entry remains the exact minute after a fully closed signal; brackets, hard UTC time limit, pre-news flattening, session cap and margin guards remain unchanged. Filtering an earlier trade can change later fills, so results are not obtained by deleting losing trades from a saved ledger.

The ratio uses the intended gross target, not a predicted favorable move or a later realized exit. In quote-price units it is:

`reward × stop distance / [spread + 2 × adverse slippage + 2 × USD commission per unit per side × conversion]`

For USD-quoted instruments the conversion is 1. For USD-base FX it is the intended target bid level, computed from the entry-open bid, direction and closed-signal ATR. Both target gross P/L and price friction convert to USD at that entry-known target level; commissions remain USD. No future quote, realized target hit, MFE/MAE or exit outcome enters the decision. A generous intended target does not establish that it can be reached within the maximum holding time.

Reused all verified 2022–2024 HistData ZIPs, the existing hashed normalized cache, original engine sources and audited calendar. No vendor downloads were made. Complete source hashes, normalized hashes, archive date ranges and session coverage remain recorded for each instrument. FX costs remain 2.0 pips spread, 0.3 pip slippage per side and USD 3.50 per 100,000 units per side, with 1,000-unit minimum/increment and 30:1 leverage. Gold retains USD 0.45/oz spread, USD 0.07/oz slippage per side and USD 0.035/oz commission per side, a one-ounce minimum/increment and 20:1 leverage. 1.5× and 2× cases stress spread/slippage, not commission. These are modeled full-period costs, not verified tick spreads.

London reference windows remain 08:00–10:00 open, 15:00–17:00 close and 10:00–15:00 intraday in Europe/London. New York windows remain 08:00–10:00 open, 15:00–16:45 close and 10:00–15:00 intraday in America/New_York. All new positions still flatten within their 5/10/15-minute limit and before lane/news cutoffs. Strict macro 60/30-minute, central-bank 90/60-minute, uncertainty/holiday and 16:45–17:15 New York rollover controls remain active. There are no date-specific exceptions.

Ran 576 training accounts (24 benchmarks × 4 floors × 2 years × 3 costs), wrote the training-only selection freeze, then ran 576 reused-2024 H1/H2 development accounts. All 288 no-filter accounts matched the prior frozen metrics, audits and simulated-ledger hashes exactly. They are included in the 1,152 account cases, not additional configurations. An independent audit reconciled all 18,323 training and 9,366 development fills against saved ledgers, sample counts, net P/L, cost-floor eligibility, 15-minute holding bounds and margin checks. There were 384 zero-fill accounts across all periods/costs/floors and no maintenance-audit breaches. The overlapping simulations cannot be pooled into a qualifying out-of-sample sample.

No threshold passed the registered training requirements: at least 25 trades, net > 0, PF > 1.05, DD < 10%, no halt or maintenance breach in every training-year/cost account. The 24 training-chosen floors are unqualified diagnostic choices, with the original no-filter case retained on ranking ties. No 2024 result was used for this batch's selection. Eighteen choices reduced base-cost 2024 losses; the other six retained no filter. Every training-selected choice was still negative at 2024 base costs. No strategy advanced to 2025.

The following table compares all fixed floors descriptively across the 24 benchmarks. Each floor's dollar and trade totals sum 48 separately reset USD 1,000 half-year accounts; these are not returns on a single account or a portfolio. A flat account is never scored as profitable.

| Fixed floor | Completed base-cost 2024 trades | Benchmarks with fills | Positive-net benchmarks | Gross USD | Costs USD | Net USD |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| None | 2,308 | 24 | 0 | +4.32 | 1593.45 | -1589.12 |
| 2× | 1,127 | 24 | 0 | -30.98 | 577.66 | -608.63 |
| 3× | 413 | 21 | 0 | +7.50 | 147.49 | -139.99 |
| 5× | 57 | 9 | 4 | -1.39 | 15.17 | -16.56 |

Loss reduction mainly reflects less activity and lower costs; it is not a validated positive expectancy. The 5× floor leaves only 57 trades across all 24 benchmarks and 15 benchmarks with no fills. Its four positive cases have only 1–5 trades each. GBP/USD open at 5× has PF 2.344 and +USD 0.43 from three trades, but zero trades under either stressed cost. It was not the training-selected floor. USD/JPY close at 5× has five trades, +USD 0.36 and PF 1.197; its 2× stress has no fills. The other positive cases have one or two trades and no losing trades, so PF is undefined rather than a defensible infinite score. None supplies the required 200-trade sample or training/cost robustness.

The next tables show only the floors chosen before 2024, ordered within each lane by base 2024 PF. Each row's totals combine its two independent USD 1,000 half-year accounts. DD is the higher fold value; all rows are research diagnostics, not promoted strategies.

### Training-selected open cost filters · reused 2024

| Instrument | Floor | No-filter trades / net USD | Filtered trades | Gross USD | Costs USD | Net USD | Expectancy USD | PF | Max fold DD | 1.5× net USD | 2× net USD |
| --- | ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| USDJPY | 3 | 95 / -43.23 | 42 | +7.40 | 15.67 | -8.28 | -0.197 | 0.614 | 0.82% | -12.26 | -8.70 |
| GBPUSD | 3 | 95 / -46.06 | 31 | +5.51 | 10.23 | -4.72 | -0.152 | 0.560 | 0.49% | -2.55 | -0.30 |
| EURUSD | 2 | 78 / -48.48 | 34 | +7.91 | 17.16 | -9.25 | -0.272 | 0.408 | 0.87% | -7.69 | -1.03 |
| USDCAD | 2 | 106 / -79.13 | 33 | -3.89 | 18.61 | -22.49 | -0.682 | 0.280 | 1.48% | -3.87 | -0.69 |
| NZDUSD | 2 | 85 / -61.13 | 16 | +2.13 | 8.91 | -6.78 | -0.424 | 0.253 | 0.83% | -2.38 | -0.02 |
| USDCHF | 2 | 107 / -81.45 | 41 | -1.45 | 21.59 | -23.05 | -0.562 | 0.175 | 1.84% | -10.60 | -7.92 |
| XAUUSD | 2 | 15 / -13.11 | 14 | -1.60 | 9.24 | -10.84 | -0.774 | 0.141 | 1.14% | +0.00 | +0.00 |
| AUDUSD | 2 | 105 / -94.57 | 19 | -6.88 | 9.57 | -16.45 | -0.866 | 0.125 | 1.22% | -3.13 | -0.28 |

### Training-selected close cost filters · reused 2024

| Instrument | Floor | No-filter trades / net USD | Filtered trades | Gross USD | Costs USD | Net USD | Expectancy USD | PF | Max fold DD | 1.5× net USD | 2× net USD |
| --- | ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| USDCHF | 3 | 167 / -104.44 | 16 | +1.27 | 5.90 | -4.62 | -0.289 | 0.342 | 0.33% | -0.71 | +0.00 |
| USDJPY | 0 | 75 / -54.98 | 75 | +1.10 | 56.08 | -54.98 | -0.733 | 0.118 | 3.14% | -65.32 | -73.75 |
| GBPUSD | 2 | 55 / -38.77 | 51 | -14.62 | 23.76 | -38.38 | -0.753 | 0.115 | 2.35% | -14.82 | -11.22 |
| AUDUSD | 0 | 76 / -63.99 | 76 | +4.98 | 68.97 | -63.99 | -0.842 | 0.083 | 3.28% | -75.04 | -79.86 |
| USDCAD | 2 | 55 / -35.63 | 49 | -2.89 | 27.80 | -30.69 | -0.626 | 0.074 | 1.95% | -13.21 | -3.50 |
| NZDUSD | 0 | 77 / -67.91 | 77 | +7.66 | 75.57 | -67.91 | -0.882 | 0.051 | 3.72% | -80.27 | -84.65 |
| XAUUSD | 0 | 27 / -14.96 | 27 | +2.86 | 17.82 | -14.96 | -0.554 | 0.018 | 1.41% | -14.32 | -13.95 |
| EURUSD | 0 | 91 / -89.04 | 91 | -3.90 | 85.14 | -89.04 | -0.978 | 0.012 | 4.54% | -101.11 | -102.76 |

### Training-selected intraday cost filters · reused 2024

| Instrument | Floor | No-filter trades / net USD | Filtered trades | Gross USD | Costs USD | Net USD | Expectancy USD | PF | Max fold DD | 1.5× net USD | 2× net USD |
| --- | ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| EURUSD | 3 | 126 / -77.70 | 17 | +4.47 | 5.61 | -1.14 | -0.067 | 0.789 | 0.48% | +0.67 | +0.00 |
| GBPUSD | 3 | 147 / -86.09 | 59 | +4.39 | 19.47 | -15.08 | -0.256 | 0.481 | 1.27% | -0.95 | -0.32 |
| USDJPY | 3 | 138 / -71.69 | 80 | -3.68 | 26.07 | -29.76 | -0.372 | 0.332 | 1.84% | -17.97 | -14.07 |
| USDCAD | 2 | 154 / -101.08 | 91 | +0.06 | 51.97 | -51.91 | -0.570 | 0.223 | 3.59% | -28.55 | -2.99 |
| USDCHF | 3 | 129 / -84.46 | 21 | -6.32 | 7.76 | -14.08 | -0.670 | 0.212 | 0.99% | -2.83 | +0.00 |
| AUDUSD | 2 | 150 / -103.40 | 51 | +0.06 | 30.36 | -30.30 | -0.594 | 0.190 | 2.10% | -6.56 | -1.76 |
| XAUUSD | 0 | 16 / -11.49 | 16 | -0.93 | 10.56 | -11.49 | -0.718 | 0.057 | 1.19% | -6.16 | +0.00 |
| NZDUSD | 2 | 139 / -116.36 | 32 | -8.39 | 19.47 | -27.86 | -0.871 | 0.053 | 1.44% | -1.98 | -1.03 |

The largest PF among training-selected cases is EUR/USD NY-intraday at 3×: PF 0.789, 17 trades and -USD 1.14 net. It is not a candidate for promotion. A higher modeled cost sometimes removes most or all entries and reduces the dollar loss; zero P/L from zero trades does not demonstrate stress robustness.

Gold exposes a structural sizing constraint under these specific assumptions. With reward=1, the target and stop distances are equal. A threshold T requires target distance ≥ T × round-trip cost C, so the minimum one-ounce stop-plus-cost risk is at least `(T + 1) × C`. At USD 1,000 and 0.25% risk, the initial budget is USD 2.50. These are analytical lower bounds, not additional backtests:

| Gold floor | Minimum cash risk at base costs | At 1.5× spread/slippage | At 2× spread/slippage |
| --- | ---: | ---: | ---: |
| 2× | 1.980 USD | 2.865 USD | 3.750 USD |
| 3× | 2.640 USD | 3.820 USD | 5.000 USD |
| 5× | 3.960 USD | 5.730 USD | 7.500 USD |

Thus gold at 3× or 5× cannot fund even its first minimum-size trade at base costs; at stressed costs, even 2× is unaffordable. Margin and data availability can further restrict entries but cannot rescue this risk-budget inequality. This explains the no-fill cases without inventing a different broker contract or raising risk. Gold 2× open still takes 14 base-cost development trades and loses USD 10.84. No 0.1-ounce or higher-risk sensitivity was run in this matched filter batch.

| Qualification gate | Result |
| --- | --- |
| Stable training at all three cost levels | 0 / 96 threshold cases pass |
| Positive expectancy among training-selected development cases | 0 / 24 pass |
| PF > 1.5 among training-selected development cases | 0 / 24 pass |
| At least 200 distinct completed base development trades | 0 / 96 threshold cases pass |
| DD < 10%, no halt for training-selected base cases | 24 / 24 pass |
| Positive stressed net at both 1.5× and 2× for training-selected cases | 0 / 24 pass |
| Untouched out-of-sample evidence | Not evaluated; 2025 sealed |
| All gates | 0 qualifiers |

All 40 relevant tests passed: 10 new cost-filter checks, 12 prior scalp, 13 event-control and 5 calendar-screen tests. New checks cover both USD currency bases, both trade directions, all fee components, inclusive threshold boundaries, unchanged zero-filter replay, rejected entries without target/cost changes, stressed eligibility, retained session caps, independence from future path changes and failure of zero-fill accounts on profit/sample gates. The complete 288-account saved-data parity and independent ledger reconciliation add historical execution evidence beyond the synthetic tests.

The known missing 2023 source windows remain excluded (EUR/USD NY-open 156/260 versus 259/262 in 2024). Archives are 2022–2024 historical observations, approximately 1.9–4.8 years old as of 2026-11-07. Retrospective calendars, modeled spreads/slippage, unavailable full-period paired quotes and broker-specific liquidation/contract details remain limitations. 2024 has already been used repeatedly and is development evidence, never fresh qualification. No quarantined Twelve Data data, fabricated volume, vendor purchases, private production credentials, production/staging changes, paper orders or real orders were used.

The filter is useful as a cost/size feasibility guard in research; this batch does not validate a winning entry strategy. The next bounded step is to verify the intended broker/feed's actual contract minimum, fees and observed spread/slippage before considering a separately labeled sizing/cost sensitivity. Do not lower modeled costs, increase risk or widen targets merely to manufacture a passing backtest. Further scalp rules need separate registration and independent evidence; 2025 remains sealed.

```bash
OPENBLAS_NUM_THREADS=1 python scripts/xmi-session-scalp-cost.py \
  --cache "$research_dir/histdata" \
  --calendar "$research_dir/XMI_Economic_Calendar_2022_2024.json" \
  --normalized "$research_dir/scalp-normalized" \
  --output "$research_dir/scalp-cost-new" --workers 6
```

Immutable full evidence SHA-256 values:

- `results.json`: `5e09c2dd80af1bd0fd8521bde8ebec82efc5a098b8577bfdc9ecb2ad66712c9c`
- `preregistration.json`: `9bd9933fcd4b9e61062549e925e4c15cb1e2613cb2dc62d1919593ee59c30a55`
- `training-selection-freeze.json`: `1cf0766b02c650c65331cd68f9d1e1ea38e74d684b8f4e8cb9ce660383f66097`
- `independent-audit.json`: `88ada0ac4a5d53907291c078509c09f55446afd072ec9067e0c42763831fc9bf`

## Follow-up · Zero-commission scalp rerun in lots and dollars · 2026-11-07

Completed a full registered scalp-grid rerun with lot/cash reporting, zero-commission scenarios, recalculated historical margin and an independently audited fixed-0.01-lot comparison. The original engine, earlier experiments and production/chart code are unchanged. All independent accounts start with exactly USD 1,000. Every new signal is on a fully closed 1-minute or 5-minute bar, with a 5/10/15-minute maximum holding cap, exact next-minute entry and flattening within its session/news lane. No position is held overnight or through the configured rollover blackout.

The new catalog was hashed before the first replay. It reuses all 504 registered variants per instrument from the strict scalp batch, adding the four previously defined target-to-cost floors (none, 2×, 3×, 5×). The base variant settings remain unchanged: four registry baselines, the modeled public scalp preset and two lane-specific rule families per window, 1.5 ATR14 stop, 1.0 stop-distance target and independent 0.25%/0.5% risk budgets. This is a deterministic grid, not a new random or adaptive signal search. At each cost, the floor uses only the intended bracket, closed-signal ATR and entry-known cost model. It does not use future excursions or remove losing trades from saved logs.

Two clearly separated profiles were tested. The first sets commission to zero for all eight instruments while retaining the prior modeled FX spread/slippage and lower gold spread. The second applies only to gold and uses a higher fixed spread as a sensitivity. Neither profile is a verified historical broker quote feed. Model parameters are generic research inputs; no private account records, affiliations, screenshots or raw vendor quote rows are published with them.

| Parameter | Zero-commission profile | Higher-spread gold profile |
| --- | --- | --- |
| Instruments | Seven requested major FX pairs and XAU/USD | XAU/USD only |
| Commission | Zero | Zero |
| FX spread and adverse slippage | 2.0 pips and 0.3 pip per side, modeled | Not applicable |
| Gold spread in quoted-price units | 0.45, modeled | 1.72, fixed sensitivity |
| Gold adverse slippage in quoted-price units | 0.07 per side, modeled | 0.07 per side, modeled |
| FX leverage | 500:1 conditional scenario | Not applicable |
| Gold leverage | 200:1 conditional scenario | 200:1 conditional scenario |
| Minimum/increment | 0.01 lots, modeled | 0.01 lots, modeled |

Risk sizing rounds down to the modeled lot step and rejects unaffordable minimum trades. Margin is recalculated at each entry, capped at 90% of cash equity, with USD-base and USD-quoted conversions handled separately. A price-independent cash margin is not reused across years. The gold price-to-dollar contract multiplier remains an assumption, as do the actual broker minimum/step and instrument-specific leverage. These results therefore describe conditional simulations. Under the modeled gold multiplier and 200:1 leverage, 0.01 lot at a synthetic price of 4,070 requires approximately USD 20.35 margin; historical entries at different prices have different cash requirements.

The fixed-size arm caps each selected account at exactly 0.01 lot while retaining that selected variant's risk ceiling, session cap, costs, hold, stop, target and cost floor. A fixed lot is skipped if it exceeds that cash-risk budget or available margin; it is never forced into the account. Trade ledgers now report lot size, cash margin, initial planned stop risk, risk budget, equity before entry, costs, gross/net P/L and entry/exit times separately. Planned stop risk includes modeled friction; a gap can produce a larger realized loss. Existing adverse-gap, stop-first ambiguous-minute execution, 10% marked-drawdown halt and maintenance audit remain active.

Reference windows remain DST-aware: London open 08:00–10:00, close 15:00–17:00 and intraday 10:00–15:00 in Europe/London; New York open 08:00–10:00, close 15:00–16:45 and intraday 10:00–15:00 in America/New_York. Each position is also limited by its 5/10/15-minute clock cap and last safe news minute. Strict macro 60/30-minute, central-bank 90/60-minute, holiday/uncertainty and 16:45–17:15 New York rollover controls remain unchanged. Only complete source-minute lane windows are admitted.

Reused the same 24 verified HistData ZIPs and hashed normalized cache for 2022–2024, plus the unchanged calendar SHA-256 `ea2e7e62a799eb13886f87a81bd1ad542a7c208ea8f85df870218c4be23e8e2f`. No vendor downloads or paid data were used. Source archive hashes, first/last timestamps, duplicate/sort audits, array hashes and session completeness are saved per instrument. The 2023 EUR/USD New York-open gap remains 156/260 complete weekday windows versus 259/262 in 2024. Missing prices were not fabricated. The archives are approximately 1.9–4.8 years old as of 2026-11-07, and the calendar is retrospective, not a point-in-time release archive. Quarantined Twelve Data series remain excluded.

The training screen completed 18,144 dynamic-size configurations: eight instruments × 2,016 combinations plus 2,016 additional gold high-spread combinations. It ran 108,864 independent training accounts (two years, three costs) and audited 4,522,451 simulated fills across those configurations/costs. These repeated simulations are not distinct out-of-sample evidence. Zero configurations passed the training gate in every year/cost: at least 25 trades, positive net, PF > 1.05, DD < 10%, no halt and no maintenance breach.

One training-ranked diagnostic fallback per instrument/profile/lane was frozen before any new 2024 replay: 27 choices. These are explicitly unqualified choices, not finalists. The development evaluation ran 162 dynamic-size accounts on 2024 H1/H2. The matched fixed-0.01-lot arm added 324 accounts across all four periods/costs, including 162 training and 162 development accounts. Total distinct new account cases: 109,350. The fixed arm adds 27 configured comparisons to the 18,144 dynamic configurations; it does not add independent market observations when logs coincide.

Additional verification reproduced all 288 original-model benchmark accounts with exact saved metrics, audits and raw ledger digests. All 162 selected dynamic training accounts reproduced after the freeze. An independent Python auditor read every saved training row, checked all 18,144 configuration IDs, 108,864 training account records, input/result hashes and the frozen ranking. It then reconciled 648 selected-account ledgers and 9,780 fills directly against source minute bars, including protective bracket prices, adverse gaps, stop-first ordering, elapsed holding time, USD-base exit conversion, lot quantities, spread/slippage cash costs, margin, planned risk budgets and equity. This accounting audit does not derive P/L by calling the C++ replay. Every check passed.

The following tables rank the zero-commission profile's frozen choices within each lane by fixed-0.01-lot base-cost PF. All rows are reused 2024 development evidence. Every fixed-size fill is 0.01 lot; the cash-risk ceiling remains the selected budget. Gross/net/cost/sample totals combine two separately reset USD 1,000 half-year accounts; DD is the higher fold DD. They are not returns on one compounded USD 1,000 year or on a shared-capital portfolio. The paired dynamic-size net is from the identical frozen rule and cost floor, using risk-budget sizing.

### Open lane · zero-commission scenario · fixed 0.01 lots

| Instrument | Rule / window | Signal / max hold | Risk ceiling | Cost floor | Trades | Gross USD | Costs USD | Net USD | Expectancy USD | PF | Max fold DD | Dynamic net USD | Margin range USD |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| USDCHF | rsi-recovery / london-open | 5m / 15m | 0.25% | 3 | 11 | +5.81 | 3.31 | +2.50 | +0.227 | 2.029 | 0.23% | +1.28 | 2.00–2.00 |
| AUDUSD | ema-trend / ny-open | 1m / 15m | 0.25% | 2 | 12 | +4.27 | 3.12 | +1.15 | +0.096 | 1.450 | 0.31% | +1.31 | 1.30–1.36 |
| NZDUSD | trend-momentum / ny-open | 1m / 5m | 0.25% | 2 | 15 | +3.83 | 3.90 | -0.07 | -0.005 | 0.979 | 0.16% | -0.38 | 1.19–1.25 |
| EURUSD | rsi-recovery / ny-open | 5m / 15m | 0.25% | 3 | 25 | +2.57 | 6.50 | -3.93 | -0.157 | 0.486 | 0.39% | -4.80 | 2.08–2.23 |
| USDCAD | rsi-recovery / ny-open | 5m / 15m | 0.25% | 3 | 28 | -0.35 | 5.29 | -5.64 | -0.201 | 0.477 | 0.43% | -14.50 | 2.00–2.00 |
| USDJPY | rsi-recovery / ny-open | 5m / 5m | 0.25% | 5 | 34 | -1.95 | 5.95 | -7.90 | -0.232 | 0.363 | 0.79% | -9.18 | 2.00–2.00 |
| XAUUSD | trend-momentum / london-open | 5m / 15m | 0.25% | 3 | 28 | -0.22 | 16.52 | -16.74 | -0.598 | 0.266 | 1.20% | -16.74 | 10.20–13.15 |
| GBPUSD | opening-failure / london-open | 5m / 10m | 0.25% | 5 | 3 | -2.53 | 0.78 | -3.31 | -1.105 | 0.000 | 0.36% | -3.31 | 2.54–2.58 |

### Close lane · zero-commission scenario · fixed 0.01 lots

| Instrument | Rule / window | Signal / max hold | Risk ceiling | Cost floor | Trades | Gross USD | Costs USD | Net USD | Expectancy USD | PF | Max fold DD | Dynamic net USD | Margin range USD |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| XAUUSD | close-reversal / london-close | 5m / 10m | 0.50% | 5 | 110 | +59.21 | 64.90 | -5.69 | -0.052 | 0.946 | 3.18% | -5.69 | 9.98–13.93 |
| AUDUSD | rsi-recovery / ny-close | 5m / 5m | 0.25% | 2 | 17 | +3.62 | 4.42 | -0.80 | -0.047 | 0.734 | 0.18% | -2.39 | 1.25–1.38 |
| USDJPY | ema-trend / london-close | 5m / 15m | 0.25% | 5 | 67 | -7.29 | 11.66 | -18.95 | -0.283 | 0.444 | 1.40% | -25.06 | 2.00–2.00 |
| USDCHF | ema-trend / london-close | 5m / 10m | 0.25% | 3 | 49 | +0.77 | 14.56 | -13.79 | -0.281 | 0.366 | 1.07% | -15.42 | 2.00–2.00 |
| GBPUSD | close-continuation / london-close | 5m / 15m | 0.25% | 3 | 42 | -4.54 | 10.92 | -15.46 | -0.368 | 0.267 | 1.09% | -23.01 | 2.49–2.68 |
| NZDUSD | rsi-recovery / london-close | 5m / 5m | 0.25% | 3 | 25 | +1.38 | 6.50 | -5.12 | -0.205 | 0.263 | 0.42% | -9.57 | 1.18–1.26 |
| USDCAD | close-continuation / london-close | 5m / 5m | 0.25% | 3 | 38 | -2.27 | 7.21 | -9.48 | -0.249 | 0.128 | 0.73% | -20.18 | 2.00–2.00 |
| EURUSD | rsi-recovery / london-close | 5m / 5m | 0.25% | 3 | 64 | -3.03 | 16.64 | -19.67 | -0.307 | 0.114 | 1.14% | -30.08 | 2.08–2.24 |

### Intraday lane · zero-commission scenario · fixed 0.01 lots

| Instrument | Rule / window | Signal / max hold | Risk ceiling | Cost floor | Trades | Gross USD | Costs USD | Net USD | Expectancy USD | PF | Max fold DD | Dynamic net USD | Margin range USD |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| USDCAD | ema-trend / ny-intraday | 5m / 10m | 0.25% | 5 | 2 | +0.96 | 0.39 | +0.58 | +0.288 | 2.219 | 0.09% | +0.10 | 2.00–2.00 |
| NZDUSD | trend-momentum / london-intraday | 1m / 5m | 0.25% | 2 | 11 | +2.38 | 2.86 | -0.48 | -0.043 | 0.841 | 0.16% | -1.14 | 1.19–1.25 |
| GBPUSD | rsi-recovery / ny-intraday | 5m / 10m | 0.25% | 5 | 38 | +4.05 | 9.88 | -5.83 | -0.153 | 0.613 | 0.94% | -5.83 | 2.49–2.68 |
| EURUSD | intraday-pullback / ny-intraday | 5m / 15m | 0.25% | 3 | 43 | +4.48 | 11.18 | -6.70 | -0.156 | 0.531 | 0.61% | -13.64 | 2.07–2.24 |
| USDJPY | rsi-recovery / london-intraday | 5m / 10m | 0.25% | 5 | 69 | -0.25 | 11.99 | -12.25 | -0.178 | 0.480 | 0.95% | -16.69 | 2.00–2.00 |
| AUDUSD | intraday-pullback / ny-intraday | 5m / 15m | 0.25% | 3 | 25 | -0.34 | 6.50 | -6.84 | -0.274 | 0.301 | 0.61% | -10.03 | 1.30–1.39 |
| XAUUSD | intraday-mean / ny-intraday | 5m / 15m | 0.25% | 2 | 19 | +1.33 | 11.21 | -9.88 | -0.520 | 0.245 | 1.16% | -9.88 | 9.97–13.12 |
| USDCHF | intraday-pullback / ny-intraday | 5m / 15m | 0.25% | 3 | 45 | -8.09 | 13.41 | -21.50 | -0.478 | 0.224 | 1.30% | -22.72 | 2.00–2.00 |

Three zero-commission profile choices were slightly profitable at base costs. At fixed 0.01 lots, USD/CHF London open made USD 2.50 from 11 trades (PF 2.029); AUD/USD New York open made USD 1.15 from 12 trades (PF 1.450); USD/CAD New York intraday made USD 0.58 from two trades (PF 2.219). The two PF readings above 1.5 have only 11 and two trades. All three have zero fills at 2× spread/slippage, and the USD/CHF/USD/CAD choices also have zero fills at 1.5×. They fail training/sample/cost stability and are not winners or candidates for execution.

Gold's lower-spread London-close reversal is the largest base development sample among these choices: 110 trades, USD 59.21 gross, USD 64.90 cost, -USD 5.69 net, PF 0.946 and 3.18% maximum fold DD. It records no fills at either stressed cost because minimum trade size/risk eligibility disappears. A flat stressed account is not robust profitability. In this selected gold case, dynamic and fixed sizing both execute only 0.01-lot positions, so their logs coincide rather than providing separate evidence.

### Gold · separate higher-spread sensitivity · fixed 0.01 lots

This profile conditionally models a 1.72 quoted-price spread with zero commission, rather than substituting a screenshot as measured 2022–2024 spreads. Contract conversion, minimum/step and instrument leverage remain assumptions. Every selected gold cost floor is zero in this higher-spread profile; the registered higher floors cannot fund a minimum trade under the specified risk budget.

| Lane | Frozen rule / window | Signal / max hold | Risk ceiling | Trades | Gross USD | Costs USD | Net USD | Expectancy USD | PF | Max fold DD | 1.5× net USD | 2× net USD |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| open | rsi-recovery / london-open | 1m / 10m | 0.25% | 27 | -3.48 | 50.22 | -53.70 | -1.989 | 0.000 | 5.24% | +0.00 | +0.00 |
| close | rsi-recovery / london-close | 5m / 5m | 0.50% | 20 | +4.52 | 37.20 | -32.68 | -1.634 | 0.046 | 2.04% | -5.44 | +0.00 |
| intraday | intraday-pullback / ny-intraday | 1m / 15m | 0.25% | 21 | -1.94 | 39.06 | -41.00 | -1.953 | 0.000 | 4.10% | +0.00 | +0.00 |

All three higher-spread gold lanes lose at base costs. The higher-spread close choice has two fills and -USD 5.44 net at 1.5× cost; the other stressed accounts have no fills. Their base fixed-lot margin requirements range roughly USD 9.97–13.67 across actual historical entry prices. No constant cash margin was reused from a different-price example.

| Gate across the 54 frozen dynamic/fixed evaluation arms | Pass count |
| --- | ---: |
| Positive base net expectancy | 6 / 54 |
| Base PF strictly above 1.5 | 2 / 54 |
| Base maximum equity DD strictly below 10%, no halt | 54 / 54 |
| At least 200 distinct completed base development trades | 0 / 54 |
| Positive stressed net, DD < 10%, no halt at both 1.5× and 2× | 0 / 54 |
| Registered training stability across both years/costs | 0 / 54 |
| No observed maintenance audit breach | 54 / 54 |
| Untouched out-of-sample evidence | Not evaluated; 2025 sealed |
| Verified historical broker contract and execution costs | Not established |
| All gates | 0 qualifiers |

All 50 relevant unit tests passed: ten new lot/risk/margin checks plus the prior 12 scalp, ten cost-floor, 13 event-control and five calendar-screen tests. New checks include unchanged legacy replay, exact account resets, fixed-lot caps, historical-price-dependent margin, independent USD-base P/L/margin conversion, risk-based minimum-size skips under higher costs, zero-commission stress filters and clock caps across gaps. The separate full-data auditor's counts and source hash are preserved in the audit manifest.

Changes in fees, modeled margin capacity, cost floors and selected configurations all contribute to this rerun. It is not a clean commission-only causal comparison with earlier headline dollar results. The fixed-versus-dynamic rows are matched within each new frozen case. No risk level was raised above the registered 0.5% limit, no target was widened, and no new signal parameters were chosen from 2024 outcomes.

No historical contract or spread series was invented. Per-account metrics, lot/cash distributions, cost stress, skipped minimum sizes, halts, bracket exit counts, all config IDs and ledger hashes are in the complete results. Private simulated trade logs contain lots, margin and cash risk; neither raw vendor rows nor individual ledgers are published to Git. No orders, paid data, private production credentials or production/staging changes were used. The original chart/application code and all prior experiment files remain unchanged. The 2025 archive remains sealed; no strategy advanced to live or paper execution.

The next bounded research step is to investigate the entry/exit edge and verified execution conditions before trying further new scalp rules. A PF above 1.5 from two or 11 trades is insufficient. The honest outcome of this rerun is zero qualifiers, with lower-cost and wider-spread scenarios reported independently.

```bash
OPENBLAS_NUM_THREADS=1 python scripts/xmi-session-lot-rerun.py \
  --cache "$research_dir/histdata" \
  --calendar "$research_dir/XMI_Economic_Calendar_2022_2024.json" \
  --normalized "$research_dir/scalp-normalized" \
  --output "$research_dir/lot-rerun-new" --workers 6
OPENBLAS_NUM_THREADS=1 python scripts/xmi-session-lot-audit.py \
  --cache "$research_dir/histdata" \
  --calendar "$research_dir/XMI_Economic_Calendar_2022_2024.json" \
  --normalized "$research_dir/scalp-normalized" \
  --output "$research_dir/lot-rerun-new"
```

Immutable SHA-256 values:

- `results.json`: `a5bef5d313b0be30ecef2e24d626ac7e73feafe4bc3a14442e88b88d78a33a77`
- `preregistration.json`: `e28fc51288be548a8952649cab5a403b3f6aca0c83595e78bea1f604e7bcfdf6`
- `training-selection-freeze.json`: `740a48175866b353e4b3cc52956844cdae70953a89373e2b59e9158960af8e6c`
- `independent-audit.json`: `bc578842b0405a986152a6cac7babd942fdd6f50c65b66e5265d3f0c719c499f`

## Post-series follow-up · new scalp entries at fixed 0.01 lots · batch 2026-11-07

Completed and audited 2026-11-08 UTC. This is a bounded follow-up to the completed hourly series, not another scheduled hourly increment. Outcome: **zero qualifiers; zero training-eligible configurations; all 27 frozen diagnostic choices lose after base costs on previously reused 2024 data.**

The user selected testing new scalp entry rules at the same fixed 0.01-lot size. Each account starts independently at exactly USD 1,000. Signals use fully closed 1m or 5m candles, enter at the next available consecutive minute, and hold at most 5, 10 or 15 elapsed minutes. The 60 consecutive closed-bar warm-up resets across gaps. Planned per-trade risk ceilings remain 0.25% and 0.50% of current account cash (initially USD 2.50 and USD 5.00). A minimum-size trade that exceeds risk or margin is skipped. No trade size or risk ceiling was raised to force a fill.

### Registered entry rules and grid

| Entry family | Objective closed-bar hypothesis | Registered choices |
| --- | --- | --- |
| entry-compression | Prior N-bar high-low width <= 2 times prior ATR14. Close outside that prior range by 0.1 current ATR; candle body >=60% of range, aligned with EMA20/50. | 4, 6 |
| entry-sweep | Low/high exceeds prior N-bar extreme by 0.1 ATR, then closes inside prior range. Rejection wick >=50% of candle range, ADX14<=25; long RSI14<45, short RSI14>55. | 6, 12 |
| entry-pullback | At least one prior N close is on the pullback side of EMA10. Current directional body closes beyond all prior N highs/lows, aligned with EMA10/30, rising/falling EMA30 over three bars, ADX14>=20 and last completed 15m EMA20/50 direction. | 2, 3 |
| entry-impulse-reversal | Parameter/10 is the prior candle true-range multiple of ATR known before that impulse. Prior directional candle RSI reaches <=35 or >=65. Current opposite body closes past 50% of prior real body but before its open. | 15, 20 |
| entry-break-retest | Close breaks prior N-bar extreme by 0.1 ATR aligned with EMA10/30. A later candle within three bars retests the most recent break level, closes beyond its 0.1 break-ATR buffer in the original direction, and has a directional body. Reject intervening invalidating closes; require same entry-window ID. Never signal a retest on the break candle. | 6, 12 |
| entry-band-return | Use previous N-bar mean and sample standard deviation to form +/-2-sigma bands. Current extreme breaches the band, then closes between that band and prior mean with a reversing body >=0.25 ATR. ADX14<=20; long RSI14<45, short RSI14>55. | 12, 24 |

These are mechanical research interpretations. Similar pattern families appeared in earlier broad research; their exact rules here were registered before this batch. An OHLC sweep or reversal does not establish manipulation intent. No volume or VWAP was invented.

The grid is 6 families × 2 parameters × 2 signal granularities × 6 reference windows × 3 holding caps × 2 risk ceilings × 4 target/cost floors (0, 2, 3, 5) = **3,456 configurations per instrument/profile**. Stops are 1.5× ATR14 and gross targets are 1R. The cost floor is the gross target divided by modeled round-trip friction; zero disables that filter. Eight instruments use the zero-commission profile; gold also has an independent wider-spread profile, giving 9 instrument/profile arms and **31,104 configurations**. All actual config IDs and account metrics are retained in the compressed full training inventory.

### Clocks, costs and capital controls

| Reference window | Local zone | Actual permitted entry-minute opens | Forced lane cutoff |
| --- | --- | --- | --- |
| london-open | Europe/London | 08:00–09:59 | 10:00 |
| ny-open | America/New_York | 08:00–09:59 | 10:00 |
| london-close | Europe/London | 15:00–16:59 | 17:00 |
| ny-close | America/New_York | 15:00–16:44 | 16:45 |
| london-intraday | Europe/London | 10:00–14:59 | 15:00 |
| ny-intraday | America/New_York | 10:00–14:59 | 15:00 |

Zones are DST-aware; these are research reference windows, not exchange auction claims for spot FX. Every position exits by the earlier lane cutoff, news blackout or elapsed holding cap. A final-minute entry can therefore last less than its nominal cap. High-impact relevant-currency releases block 60 minutes before through 30 after; FOMC blocks 90 before through 60 after. Uncertain event times block the relevant full local day. New York 16:45–17:15 is excluded, with Friday blackout extended through Sunday 17:15. This batch inherits the verified calendar and restrictions unchanged; no newly obtained historical data or calendars were introduced.

| Modeled profile | Spread | Adverse slippage | Commission | Modeled leverage |
| --- | --- | --- | --- | --- |
| FX zero commission | 2 pips | 0.3 pip per side | USD 0 | 1:500 |
| Gold lower spread | 0.45 quoted-price units | 0.07 per side | USD 0 | 1:200 |
| Gold wider spread sensitivity | 1.72 quoted-price units | 0.07 per side | USD 0 | 1:200 |

Both 1.5× and 2× stress multiply spread and slippage, and eligibility is recalculated at each cost level. Changed costs can remove fills, so a tiny stressed gain from a different surviving subset is not evidence that costs improve an entry. Gold friction at fixed 0.01 lots is USD 0.59 per completed base trade under the lower-spread model and USD 1.86 under the wider-spread model. The modeled contract multipliers are 100,000 base units per FX lot and 100 per gold lot, with minimum/step 0.01 lots. These remain conditional assumptions, not verified historical account-specific contract specifications.

Cash margin is recalculated from each historical entry price, and reserved entry margin cannot exceed 90% of cash. USD-quoted price P/L is converted directly; USD-base P/L is divided by its exit exchange rate, while USD-base margin is calculated from USD notional. Planned stop risk includes friction and conservative USD conversion. The core keeps adverse gap opens, caps favorable target gaps, resolves ambiguous stop/target candles stop first, marks adverse intrabar equity, and halts at 10% drawdown. The 50%-of-reserved-margin maintenance audit observed no selected breach; broker-specific historical liquidation fills remain unverified. Displayed margin at one modern quote is not reused as a constant across past prices.

### Data, chronology and actual work

Reused 24 previously verified HistData ZIPs for 2022–2024, covering spot FX and XAU/USD as quoted in a Forex feed. The source consists of bid minute OHLC, not full historical bid/ask ticks. Ask prices and execution friction are modeled. Provider archive observations are approximately 1.9–4.8 years old as of the registered 2026-11-07 date; this is historical simulation, not current execution evidence. Exact ZIP, normalized array, executable and configuration hashes accompany the results. The quarantined Twelve Data series was excluded; no vendor downloads or private production credentials were used.

| Instrument | Raw minute rows across 3 ZIPs | First UTC observation | Last UTC observation |
| --- | ---: | --- | --- |
| EURUSD | 1,067,882 | 2022-01-02T22:03:00+00:00 | 2024-12-31T21:58:00+00:00 |
| GBPUSD | 1,067,068 | 2022-01-02T22:01:00+00:00 | 2024-12-31T21:58:00+00:00 |
| USDJPY | 1,067,635 | 2022-01-02T22:00:00+00:00 | 2024-12-31T21:58:00+00:00 |
| USDCHF | 1,061,235 | 2022-01-02T22:10:00+00:00 | 2024-12-31T21:58:00+00:00 |
| AUDUSD | 1,064,454 | 2022-01-02T22:10:00+00:00 | 2024-12-31T21:58:00+00:00 |
| USDCAD | 1,063,682 | 2022-01-02T22:07:00+00:00 | 2024-12-31T21:58:00+00:00 |
| NZDUSD | 1,061,837 | 2022-01-02T22:30:00+00:00 | 2024-12-31T21:58:00+00:00 |
| XAUUSD | 1,019,092 | 2022-01-02T23:00:00+00:00 | 2024-12-31T21:57:00+00:00 |

Only complete, consecutive eligible session windows were used. Timestamp basis is fixed EST converted to UTC, then DST-aware reference-zone selection. Exact duplicate rows are removed; conflicting duplicates, invalid OHLC and backward-order problems are audited. No missing prices are filled. The known EUR/USD New York-open completeness issue remains **156/260 in 2023 versus 259/262 in 2024** (259/260 in 2022). Other 2023 lanes also have missing windows, so a thin sample cannot be represented as full-year coverage. Per-symbol/year/lane counts remain in the aggregate results.

The catalog and source hashes were saved before computation. Only 2022 and 2023 determined the training-only freeze. Training eligibility requires at least 25 trades, positive net, PF strictly above 1.05, DD strictly below 10%, no halt and no bankruptcy/maintenance breach in every year and every cost scenario. If none pass, the deterministic training ranking retains an explicitly unqualified diagnostic choice per instrument/profile/lane. Earlier ties retain the first registered configuration. All 27 selections are such fallbacks. **2024 has been reused repeatedly in this project and cannot establish untouched out-of-sample performance.** The new entry choices were frozen before their 2024 evaluation. Replays of already known 2024 controls were used solely to verify execution parity. **2025 remains sealed and unread.**

| Completed computation | Count |
| --- | ---: |
| New configurations | 31,104 |
| New 2022–2023 training accounts, including 3 cost levels | 186,624 |
| Completed training fills summed across configurations/accounts | 8,394,527 |
| Training-eligible configurations | 0 |
| Frozen diagnostic choices | 27 |
| New 2024 development accounts (27 × 2 half-years × 3 costs) | 162 |
| Total new training/development account cases | 186,786 |
| Prior fixed-lot control accounts reproduced exactly | 324 |
| Selected training accounts independently replayed | 162 |
| Selected accounts independently reconciled to price/cash (including 2024) | 324 |
| Selected completed fills independently price-audited | 3,868 |
| Relevant unit tests passed | 60 |

Six local workers and reusable normalized caches were used. Counts across configurations and stresses reuse the same market history; **8,394,527 is not a count of distinct out-of-sample trades**. Account totals are independent experiments, not a USD 1,000 shared-capital portfolio. No portfolio or future forward run was promoted when no entry qualified. The exhaustive audit independently reconstructed all 31,104 registered tuples and config IDs, verified inventory hashes, independently checked training ranks/frozen IDs, and reconciled selected ledger hashes, holding clocks, bracket prices, dollar P/L, currency conversions, margins, minimum size, risk and event boundaries. All audit checks passed.

Across the training grid, 11,952 configurations have at least 25 base trades in each year and 260 have positive base net in both years, counting overlapping instrument/profile/parameter cases. None passes the full training stability screen. Those counts are training diagnostics, not strategy qualifiers.

### Frozen 2024 development rankings

Each H1/H2 account starts separately at USD 1,000. Net, gross and costs below sum the two independent half-year accounts; DD is the maximum equity drawdown of either account. They are not a single compounded annual account. PF and expectancy use all distinct completed base trades for that choice. Rankings are descriptive within lane after the fixed training selection; no config was chosen or retuned from these 2024 rankings.

#### Open lane · zero-commission profile · fixed 0.01 lots

| Instrument | Frozen rule / parameter | Signal / max hold | Window | Risk ceiling / cost floor | Trades | Gross USD | Costs USD | Net USD | Expectancy USD | PF | Max fold DD |
| --- | --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| USDJPY | entry-pullback / 2 | 5m / 15m | london-open | 0.25% / 5 | 19 | +2.38 | 3.29 | -0.91 | -0.048 | 0.844 | 0.32% |
| USDCAD | entry-sweep / 6 | 1m / 10m | ny-open | 0.25% / 2 | 8 | +0.56 | 1.54 | -0.98 | -0.122 | 0.481 | 0.16% |
| GBPUSD | entry-band-return / 24 | 5m / 5m | london-open | 0.50% / 3 | 5 | -0.49 | 1.30 | -1.79 | -0.358 | 0.077 | 0.22% |
| AUDUSD | entry-impulse-reversal / 15 | 5m / 5m | london-open | 0.25% / 2 | 11 | -0.02 | 2.86 | -2.88 | -0.262 | 0.027 | 0.21% |
| USDCHF | entry-compression / 4 | 5m / 5m | london-open | 0.25% / 3 | 6 | -2.11 | 1.80 | -3.91 | -0.651 | 0.196 | 0.37% |
| EURUSD | entry-compression / 6 | 5m / 5m | london-open | 0.25% / 2 | 16 | -0.60 | 4.16 | -4.76 | -0.297 | 0.094 | 0.27% |
| NZDUSD | entry-compression / 4 | 1m / 15m | ny-open | 0.25% / 2 | 19 | -2.67 | 4.94 | -7.61 | -0.400 | 0.238 | 0.71% |
| XAUUSD | entry-sweep / 12 | 5m / 15m | london-open | 0.50% / 3 | 62 | +19.10 | 36.58 | -17.48 | -0.282 | 0.681 | 1.63% |

#### Close lane · zero-commission profile · fixed 0.01 lots

| Instrument | Frozen rule / parameter | Signal / max hold | Window | Risk ceiling / cost floor | Trades | Gross USD | Costs USD | Net USD | Expectancy USD | PF | Max fold DD |
| --- | --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| NZDUSD | entry-sweep / 6 | 5m / 15m | london-close | 0.25% / 3 | 2 | -0.91 | 0.52 | -1.43 | -0.716 | 0.000 | 0.14% |
| USDCAD | entry-sweep / 12 | 5m / 15m | ny-close | 0.25% / 2 | 26 | +1.11 | 4.91 | -3.81 | -0.146 | 0.256 | 0.27% |
| GBPUSD | entry-compression / 6 | 5m / 15m | london-close | 0.25% / 5 | 12 | -2.34 | 3.12 | -5.46 | -0.455 | 0.435 | 0.52% |
| USDJPY | entry-sweep / 12 | 5m / 10m | london-close | 0.25% / 5 | 19 | -2.51 | 3.29 | -5.80 | -0.305 | 0.308 | 0.55% |
| USDCHF | entry-sweep / 12 | 5m / 15m | london-close | 0.25% / 3 | 21 | -1.05 | 6.19 | -7.24 | -0.345 | 0.277 | 0.63% |
| AUDUSD | entry-band-return / 24 | 5m / 5m | london-close | 0.25% / 2 | 24 | -2.65 | 6.24 | -8.89 | -0.370 | 0.057 | 0.55% |
| EURUSD | entry-compression / 6 | 5m / 10m | london-close | 0.50% / 3 | 43 | -0.63 | 11.18 | -11.81 | -0.275 | 0.339 | 0.84% |
| XAUUSD | entry-compression / 4 | 1m / 15m | london-close | 0.25% / 3 | 90 | -23.00 | 53.10 | -76.10 | -0.846 | 0.377 | 3.86% |

#### Intraday lane · zero-commission profile · fixed 0.01 lots

| Instrument | Frozen rule / parameter | Signal / max hold | Window | Risk ceiling / cost floor | Trades | Gross USD | Costs USD | Net USD | Expectancy USD | PF | Max fold DD |
| --- | --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| USDCAD | entry-sweep / 6 | 1m / 5m | london-intraday | 0.25% / 2 | 9 | +1.00 | 1.73 | -0.73 | -0.081 | 0.522 | 0.10% |
| GBPUSD | entry-pullback / 2 | 5m / 10m | ny-intraday | 0.50% / 5 | 26 | +5.79 | 6.76 | -0.97 | -0.037 | 0.882 | 0.31% |
| NZDUSD | entry-break-retest / 6 | 1m / 15m | london-intraday | 0.25% / 2 | 7 | -1.78 | 1.82 | -3.60 | -0.514 | 0.165 | 0.24% |
| XAUUSD | entry-pullback / 3 | 5m / 15m | ny-intraday | 0.25% / 0 | 10 | -0.04 | 5.90 | -5.94 | -0.594 | 0.000 | 0.75% |
| AUDUSD | entry-break-retest / 6 | 1m / 10m | london-intraday | 0.25% / 2 | 18 | -1.77 | 4.68 | -6.45 | -0.358 | 0.233 | 0.43% |
| USDCHF | entry-band-return / 24 | 5m / 10m | london-intraday | 0.50% / 2 | 36 | +3.72 | 10.79 | -7.07 | -0.196 | 0.396 | 0.59% |
| USDJPY | entry-sweep / 12 | 5m / 15m | ny-intraday | 0.25% / 5 | 39 | -3.72 | 6.83 | -10.55 | -0.270 | 0.400 | 1.15% |
| EURUSD | entry-band-return / 12 | 5m / 5m | ny-intraday | 0.50% / 2 | 59 | -0.84 | 15.34 | -16.18 | -0.274 | 0.084 | 1.26% |

#### Gold · separate wider-spread sensitivity · fixed 0.01 lots

| Lane | Frozen rule / parameter | Signal / max hold | Window | Trades | Gross USD | Costs USD | Net USD | Expectancy USD | PF | Max fold DD |
| --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| open | entry-impulse-reversal / 15 | 5m / 10m | london-open | 19 | +1.52 | 35.34 | -33.82 | -1.780 | 0.034 | 2.07% |
| close | entry-impulse-reversal / 15 | 1m / 5m | ny-close | 16 | -0.72 | 29.76 | -30.48 | -1.905 | 0.000 | 1.97% |
| intraday | entry-band-return / 24 | 1m / 15m | ny-intraday | 29 | +0.40 | 53.94 | -53.54 | -1.846 | 0.000 | 5.23% |

All 27 frozen choices lose at base costs. Gold lower-spread London-open sweep: USD 19.10 before friction, USD 36.58 cost, **-USD 17.48 net** over 62 trades (PF 0.681). Its 2× cost result is +USD 2.86 from only two surviving fills, while the 1.5× result is -USD 10.35 from 17 fills. This is not robust stressed performance. The widest base sample is gold London-close compression: 90 trades, -USD 76.10 net, PF 0.377. No frozen choice reaches the required 200 distinct completed development trades.

### Stress and exact qualification gates

| Instrument / profile | Lane | 1.5× trades | 1.5× net USD | 2× trades | 2× net USD |
| --- | --- | ---: | ---: | ---: | ---: |
| EURUSD / zero_commission | open | 4 | -1.89 | 0 | +0.00 |
| EURUSD / zero_commission | close | 8 | -2.75 | 0 | +0.00 |
| EURUSD / zero_commission | intraday | 22 | -10.58 | 10 | -7.16 |
| GBPUSD / zero_commission | open | 0 | +0.00 | 0 | +0.00 |
| GBPUSD / zero_commission | close | 0 | +0.00 | 0 | +0.00 |
| GBPUSD / zero_commission | intraday | 1 | +1.70 | 0 | +0.00 |
| USDJPY / zero_commission | open | 3 | -0.28 | 0 | +0.00 |
| USDJPY / zero_commission | close | 7 | -2.59 | 0 | +0.00 |
| USDJPY / zero_commission | intraday | 12 | -5.48 | 2 | +0.25 |
| USDCHF / zero_commission | open | 1 | -2.47 | 0 | +0.00 |
| USDCHF / zero_commission | close | 1 | -0.68 | 1 | -0.83 |
| USDCHF / zero_commission | intraday | 7 | -0.65 | 2 | +0.99 |
| AUDUSD / zero_commission | open | 0 | +0.00 | 0 | +0.00 |
| AUDUSD / zero_commission | close | 6 | -2.00 | 0 | +0.00 |
| AUDUSD / zero_commission | intraday | 4 | -2.44 | 0 | +0.00 |
| USDCAD / zero_commission | open | 1 | -0.22 | 0 | +0.00 |
| USDCAD / zero_commission | close | 0 | +0.00 | 0 | +0.00 |
| USDCAD / zero_commission | intraday | 1 | -0.29 | 0 | +0.00 |
| NZDUSD / zero_commission | open | 4 | -1.90 | 0 | +0.00 |
| NZDUSD / zero_commission | close | 0 | +0.00 | 0 | +0.00 |
| NZDUSD / zero_commission | intraday | 0 | +0.00 | 0 | +0.00 |
| XAUUSD / zero_commission | open | 17 | -10.35 | 2 | +2.86 |
| XAUUSD / zero_commission | close | 0 | +0.00 | 0 | +0.00 |
| XAUUSD / zero_commission | intraday | 4 | -3.53 | 0 | +0.00 |
| XAUUSD / gold_high_spread | open | 12 | -37.71 | 1 | -4.87 |
| XAUUSD / gold_high_spread | close | 0 | +0.00 | 0 | +0.00 |
| XAUUSD / gold_high_spread | intraday | 0 | +0.00 | 0 | +0.00 |

At 1.5× costs, nine frozen choices have no fills; at 2×, 21 have none. A flat account with no fills does not pass cost robustness. The isolated positive stress outcomes involve one or two trades and do not pass both stressed levels. Cost filters and the fixed minimum size explain much of the sample collapse.

| Gate across 27 frozen diagnostic choices | Pass count |
| --- | ---: |
| Positive base net expectancy | 0 / 27 |
| Base profit factor strictly above 1.5 | 0 / 27 |
| Maximum base equity DD strictly below 10%, no halt | 27 / 27 |
| At least 200 distinct completed base trades | 0 / 27 |
| Positive net and DD <10%, no halt at both 1.5× and 2× costs | 0 / 27 |
| Registered stability across both training years and all costs | 0 / 27 |
| No observed maintenance audit breach | 27 / 27 |
| Untouched out-of-sample evidence | 0 / 27 |
| Verified historical contract and execution costs | 0 / 27 |
| All qualification gates | **0 qualifiers** |

The original core source/execution hashes remain unchanged. All 324 prior fixed-0.01-lot accounts reproduced complete metrics, audits, lot statistics and ledger digests exactly. The previous lot rerun had three small positive base fixed-lot diagnostic choices; this new training-selected entry batch has zero. That is a documented failure to improve profitability, not a reason to replace prior rules. The entry rules are the research change; fixed-lot cash accounting, news/rollover restrictions and each execution scenario were held constant. Different training-selected rules/windows/cost floors mean the 27 result rows are not a matched entry-only causal effect across every legacy configuration.

What improved: objective entry catalog, causal timing and gap guards, six closed-bar entry implementations, reproducible training-only selection, exact fixed-lot execution parity, and complete independent inventory/price audits. What remains untested or unverified: full-period broker bid/ask and contract specifications, latency/rejections, tick-order execution, fresh out-of-sample/forward behavior, broader regimes, other stop/target designs, and a capital-constrained portfolio. The latest 1m/5m batch does not rerun 15m/30m directional styles; those remain prior evidence, outside the current strict-scalping increment.

Next bounded batch: use training-only matched fill-path diagnostics to separate pre-cost entry edge from friction and calculate break-even spread thresholds, then decide whether independent historical quote verification justifies further work. Keep 2025 sealed. No candidate is ready for forward paper execution under the qualification gates. No orders, purchases, production/staging service changes or chart/application changes occurred. No raw vendor rows, private account information or individual simulated ledgers are published to Git.

```bash
OPENBLAS_NUM_THREADS=1 python scripts/xmi-session-new-entries.py \
  --cache "$research_dir/histdata" \
  --calendar "$research_dir/XMI_Economic_Calendar_2022_2024.json" \
  --normalized "$research_dir/scalp-normalized" \
  --output "$research_dir/new-entries" --workers 6
OPENBLAS_NUM_THREADS=1 python scripts/xmi-session-new-entries-audit.py \
  --cache "$research_dir/histdata" \
  --calendar "$research_dir/XMI_Economic_Calendar_2022_2024.json" \
  --normalized "$research_dir/scalp-normalized" \
  --output "$research_dir/new-entries"
```

Immutable SHA-256 values:

- `results.json`: `82d3fb14b54b7ec5e1743c390705c8927dd943695d32f5e2207f32fdf9623f8e` (committed as `docs/xmi-session-new-entries-20261107.json`)
- `preregistration.json`: `5804ef2269cda30387dea3eb0fa2cf323241aa7c59ad54fabe4cba14a2f5ea88` (committed as `docs/xmi-session-new-entries-prereg-20261107.json`)
- `training-selection-freeze.json`: `2c4d999613d9d9bc98bbdae3d72dcbfc99dccce7d5c1dccbb1902b1885b21d9b` (committed as `docs/xmi-session-new-entries-freeze-20261107.json`)
- `independent-audit.json`: `95656f5c1b630ca55c38c2ad72d2355136beea40db428ab2d71ea91169f34e33` (committed as `docs/xmi-session-new-entries-audit-20261107.json`)
- `scripts/xmi-session-new-entries.py`: `fda9cfee0f72202dfb706d09860b3861f6e69ad73044da6925a20698f2b436cc`
- `scripts/xmi-session-new-entries-audit.py`: `711ba40259512fb00e581a54986a21194e3ffb682ff13d1511fd2a8bf7af66d9`
- `docs/xmi-new-scalp-entry-catalog-20261107.json`: `a6a51be1b86a6fae123cd70137fc426a4727baf78c1a5e2e973bcc48cce4c19d`
