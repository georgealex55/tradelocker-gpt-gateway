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
