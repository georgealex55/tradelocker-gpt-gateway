# XMI AMD + Retest — Real Historical Gold Market Replay

**Completed:** 2026-11-07. **Research branch:** `research/xmi-amd-retest-stp-20261107`. **Production:** unchanged. **2025 holdout:** unopened.

## Scope and source

This is the first **actual historical-market** replay of the frozen AMD/retest study, not the earlier synthetic candlestick test. It covers **XAU/USD only** in calendar years **2022 and 2023**, using publicly available *HistData-format one-minute BID* prices from [nousx/xauusd-data](https://github.com/nousx/xauusd-data). Source files:

- `DAT_ASCII_XAUUSD_M1_2022.csv` Git blob `c7e66be80d0e1123351acdb2bc15cf15bd22c04c`
- `DAT_ASCII_XAUUSD_M1_2023.csv` Git blob `80e578215ceac0fab24614ac9b0814857a6e81f4`

Timestamps were interpreted as HistData fixed US Eastern Standard Time, converted by +5 hours to UTC. As in the original XMI research, one backward timestamp transition per annual file and 60 exact duplicate-minute rows were sorted/deduplicated. Only strictly complete five-minute bars (five contiguous, aligned source minutes) were admitted. This is **not** independently verified against the previous private source ZIP hashes.

| Historical input audit | 2022 | 2023 |
| --- | ---: | ---: |
| Parsed one-minute bid bars | 354,628 | 308,812 |
| Backward timestamp transitions | 1 | 1 |
| Identical duplicate minutes removed | 60 | 60 |
| Incomplete 5-minute groups excluded | 64 | 183 |
| Validated 5-minute bid bars | **70,864** | **61,611** |
| Scenario account replays | **384** | **384** |

Total **132,475 real five-minute bars** and **768 independently initialized $1,000 scenario accounts**. This is **not** a single compounded $1,000 trading account or a paper-trading record.

### AMD candidate counts before account/sizing replays

| Pattern definition | 2022 signals | 2023 signals |
| --- | ---: | ---: |
| London Asian range → sweep → MSS/FVG retest | 85 | 33 |
| London Asian range → sweep → range reclaim retest | 82 | 32 |
| Rolling range → sweep → MSS/FVG retest | 201 | 156 |
| Rolling range → sweep → range reclaim retest | 511 | 374 |
| **Total pattern-family occurrences** | **879** | **595** |

Occurrences across distinct pattern definitions can overlap and should not be summed as unique trade opportunities.

## Cash, cost and execution assumptions

- **Each experiment starts with USD 1,000 independently**, including 2022 and 2023. User chose 0.25%, 0.5%, 1% risk, and fixed 0.01 lots.
- **Zero commission** for Standard STP modeling; **0.45 USD/oz spread + 0.07 per side adverse slippage** in base gold sensitivity, equal to USD 0.59 per one-ounce round trip. Separate wide gold sensitivity uses **1.72 USD/oz spread + 0.07 per side**, equaling USD 1.86 per one-ounce round trip.
- Assumed gold 100 oz per lot, 0.01-lot minimum, 0.01-lot increment, 200:1 gold symbol leverage. The user's **headline** account maximum is 500:1, not proven per-symbol gold leverage. None of these are actual 2022–2023 GatesFX bid/ask execution observations.
- Full no-skip comparison retained: force minimum if margin is sufficient (with over-risk flag), risk-funded only, and every-signal shadow/hypothetical. Shadow-only returns are **excluded** from funded P&L.
- Two retest definitions, two exit definitions, both same-day and overnight branches, and no arbitrary elapsed-time cap. For headline profitability compare **same-day funded risk-fit** only: overnight swaps are not verified, and price gaps are censored as unresolved. Same-day session-flat uses NY closing boundary rather than a 5/10/15-minute stop.
- **No margin maintenance liquidation, tick-resolution fill-order audit, broker-specific spreads, economic news controls, or contemporaneous event-calendar integration yet.** Recorded funded P&L is a candle-based simulation, not true broker execution.

## Core training-year profitability finding

Of **48 matched same-day risk-constrained configurations having at least 20 completed trades in both 2022 and 2023, none had a positive two-year summed diagnostic net return**; none made positive net P&L in both years. The broad 384-model matched inventory also has **0 configurations positive in both years**.

The least-negative sufficiently sampled same-day risk-fit configuration used:

- London Asian accumulation range → confirmed sweep → range-mid reclaim → later retest;
- Structure/opposing-liquidity exit (rather than an arbitrary 5/10/15-minute exit);
- Fixed **0.01 lot**; **no unfundable minimum-size skips** in its two registered yearly replays;
- Base modeled 0.45 gold spread, 0.07 adverse slippage each side, zero commission.

| Metric | 2022 account | 2023 account | Side-by-side diagnostic total |
| --- | ---: | ---: | ---: |
| Starting equity | $1,000 | $1,000 | Two independent accounts |
| Completed trades | 78 | 30 | **108** |
| Net P&L | **−$6.35** | **−$8.45** | **−$14.80** |
| Ending equity | $993.65 | $991.55 | Not compounded |
| Execution friction | — | — | **$63.72** |
| Gross P&L before modeled friction | — | — | **+$48.92** |
| Profit factor | — | — | **0.944** |

Its 108 registered one-ounce trades cost $63.72 (USD 0.59 per trade). The same completed-trade accounting gross profit was +$48.92, about $0.453 per trade; with unchanged $0.14 modeled round-trip slippage, the **fixed-fill algebraic break-even spread** is about **$0.313 per ounce** versus modeled $0.45. This is **not** an actual reduced-spread replay; trade sizes/eligibility and outcomes can change with cost.

Even this "best" result loses in both training years, and the observed 2023 sample is noticeably thinner than 2022. Ranking on both years is descriptive only, **not** an out-of-sample strategy selection.

### Diagnostic differences by entry and execution family

- Rolling-range versions generated substantially more signals but generally suffered deeper negative expectancy under the same-day risk-fit model.
- Complete Asian-session range models were the less-negative versions, but none showed stable profitability.
- The wide gold-spread model was worse: with a sufficiently supported sample its least-negative same-day baseline matched case lost **$135.51** over the two years, compared with −$14.80 in the best separate lower-spread selection. These are **different model choices/fills**, not a causal A/B effect of changing spread alone.
- Some cases returned positive P&L in only one year or in shadow/forced-minimum settings; **none** met the positive-both-years training requirement.

## Study coverage and honest blockers

| User-requested market | Actual 2022/23 replay status |
| --- | --- |
| **XAU/USD** | **Completed: 768 cost-profile/scenario-year replays, 2 calendar years** |
| EUR/USD | Not executed — validated source data not yet loaded |
| GBP/USD | Not executed — validated source data not yet loaded |
| USD/JPY | Not executed — validated source data not yet loaded |
| USD/CHF | Not executed — validated source data not yet loaded |
| AUD/USD | Not executed — validated source data not yet loaded |
| USD/CAD | Not executed — validated source data not yet loaded |
| NZD/USD | Not executed — validated source data not yet loaded |

The seven FX pairs have not been silently substituted with newer samples, hourly candles, or invented M5 records. The previously available XMI research report inventories private FX price archives, but those private bytes are **not currently mounted for execution**. Some alternative public files exist but their exact 2022–2023 M5 data was not accessible for replay in this session.

## Committed immutable result summaries

- [Full 2022 gold 384-scenario historical result](xmi-amd-XAUUSD-historical-2022-replay.json)
- [Full 2023 gold 384-scenario historical result](xmi-amd-XAUUSD-historical-2023-replay.json)
- [384 matched 2022/2023 configuration comparison](xmi-amd-XAUUSD-matched-2022-2023-audit.json)
- [Auditable HistData fixed-EST source parser](../scripts/xmi-amd-import-histdata-csv.py)

These JSON files preserve source blob IDs, minute-to-five-minute data-quality audits, scenario settings, net/gross/cost accounting, number of signals/skips/closed trades, and fold-specific results. Raw external vendor price rows were not committed into the user's GitHub repository.

## Conclusion

**Zero AMD gold strategies qualified for advancement.** The tested entry/exit model remains unprofitable in the two available training years at modeled STP zero-commission execution. A loss is more useful evidence than optimizing after the fact to force a positive result. Further tests should prioritize (a) matched symbol-specific bid/ask and lot-margin verification, (b) 2022–2023 source data for the seven FX pairs, (c) validated stop execution / session exits / gaps / overnight swap, and (d) independent 2024 development comparisons only after freezing the training decisions. **The 2025 holdout remains sealed, and production was not changed.**
