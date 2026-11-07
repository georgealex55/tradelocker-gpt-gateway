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
