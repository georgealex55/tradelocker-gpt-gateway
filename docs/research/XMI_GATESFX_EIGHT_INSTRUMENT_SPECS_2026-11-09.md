# GatesFX TradeLocker displayed contract specifications — seven major FX pairs + separate gold

**Evidence review date:** 2026-11-09 UTC (screenshot filenames indicate 2026-11-08; **actual quote event timestamps were not displayed**).
**Branch:** `research/xmi-amd-seven-pair-fxcm-replay-20261107`.
**Source:** User-supplied screenshots of instrument-detail and session-hours panels. Prior EURUSD capture: [EURUSD research evidence](XMI_GATESFX_USER_SCREENSHOT_EURUSD_SPEC_2026-11-09.md). This is **platform-displayed information provided by user**, not an authenticated exchange/server export, a historical bid/ask tick feed or evidence of actual fills. Original screenshot bytes remain attached to the ChatGPT conversation; do not push to public GitHub.

## Instrument matrix (displayed snapshots, not fixed inputs)

| Instrument | Category | Contract units per 1 lot | Minimum lots | Initial margin | Leverage | Sample spread range | Opening fee per lot | Swap buy/sell shown |
|---|---|---:|---:|---:|---:|---|---:|---|
| EURUSD | ForexMajors | 100,000 EUR | 0.01 | 0.20% | 500 | 18–19 points = 1.8–1.9 pips | $0.00 | $0.00* / $0.00* |
| GBPUSD | ForexMajors | 100,000 GBP | 0.01 | 0.20% | 500 | 18–20 points = 1.8–2.0 pips | $0.00 | $0.00* / $0.00* |
| USDJPY | ForexMajors | 100,000 USD | 0.01 | 0.20% | 500 | 18–19 points = 1.8–1.9 pips | $0.00 | $0.00* / $0.00* |
| USDCHF | ForexMajors | 100,000 USD | 0.01 | 0.20% | 500 | 16–17 points = 1.6–1.7 pips | $0.00 | **not captured** |
| AUDUSD | ForexMajors | 100,000 AUD | 0.01 | 0.20% | 500 | 17 points = 1.7 pips | $0.00 | $0.00* / $0.00* |
| USDCAD | ForexMajors | 100,000 USD | 0.01 | 0.20% | 500 | 23–24 points = 2.3–2.4 pips | $0.00 | $0.00* / $0.00* |
| NZDUSD | ForexMajors | 100,000 NZD | 0.01 | 0.20% | 500 | 17–18 points = 1.7–1.8 pips | $0.00 | $0.00* / $0.00* |
| XAUUSD | Metals (SEPARATE) | 100 troy ounces | 0.01 | 0.50% | 200 | 28–30 points = $0.28–$0.30/oz | $0.00 | $0.00* / $0.00* |

**The minimum lot is NOT the lot step.** Every screenshot shows 0.01 minimum, but none confirms permitted lot-size increments, maximum lots, margin tiers or financing surcharge conditions. The asterisk after zero swaps is unresolved; do not convert screenshots into historical swap=zero model. The spread ranges use the snapshot groups (including earlier user-supplied watchlist) and are not historical distributions or future guaranteed quotes.

## User-provided trading sessions as displayed by platform

All session screens label timezone `UTC+2` **at screenshot time**. This alone does not verify historic DST regime, 2022–2023 broker session changes, holidays, trading halts or week-27 substitution behavior.

- Forex majors: Sun/Sat closed; Monday 00:01–23:59; Tuesday–Friday 00:00–23:59, broker-displayed clock. Shown across EURUSD, GBPUSD, USDJPY, USDCHF, AUDUSD, USDCAD and NZDUSD session panels.
- XAUUSD: Sun/Sat closed; Monday–Thursday 01:01–23:59; Friday 01:01–23:55, broker-displayed clock. Gold has a daily 1h+ break and a shorter Friday close, unlike majors.

## Cost/margin checks (illustrations, NOT executed trades)

- EURUSD 0.01 lot = 1,000 EUR. At displayed ask 1.11555 and 0.20% margin: around $2.23 initial margin; 1.9 pip spread about $0.19 per minimum lot, ignoring slippage.
- USDJPY/CHF/CAD 0.01 lot = $1,000 base notional, 0.20% nominal initial margin approximately $2.00 (unless account margin tiers, currency conversion or instrument exceptions differ).
- XAUUSD 0.01 lot = 1 oz. At the captured $4,120.80–$4,121.49 price, initial margin around $20.60 at 0.50%; snapshot spread $0.28–$0.30 per minimum position before slippage. Gold remains a separate research category, not an eighth FX major.

Margin is not equivalent to risk-at-stop. Stop distance, contract, pip value, spread, slippage, sizing granularity and 10% drawdown halt must be enforced independently for each $1,000-funded simulation. A trade can be fundable yet violate stop-risk constraints.

## Provenance: SHA-256 of user-provided original PNG attachments (computed locally)

Hashing captures evidence integrity only; screenshot names are not an independently verified market time source. Identical duplicate-named EURUSD reuploads have identical SHA-256 and are represented once.

| Screenshot filename | Panel | SHA-256 |
|---|---|---|
| Screenshot 2026-11-08 221139.png | earlier seven-major watchlist | `250f467125bfaab8bd71bd4aee8d87882aa2e604b56a2644b17a2c133fc08c61` |
| Screenshot 2026-11-08 221432.png | EURUSD hours | `3fc7bdea2e995680dffd1a6734941c96d7a0dbb11b79de10821ab10c2ce05b45` |
| Screenshot 2026-11-08 221442.png | EURUSD quotes and contract top | `d180a26a4935100d8f83a7a0842b8142a9c653281d7821e80f1ff2cdea1a273e` |
| Screenshot 2026-11-08 221451.png | EURUSD contract bottom | `1b2f37542ec24cbb312d0ec767748b49ee4e25a5a4cdca655dc46f526d879e53` |
| Screenshot 2026-11-08 221619.png | GBPUSD cropped trading hours | `a7630f276170e59b6217a6337762d8ee0d37b23d6636c4b0fee6fc7be6f72be4` |
| Screenshot 2026-11-08 221627.png | GBPUSD hours | `edeb388430b1d477376628ca6eb1e560182342d1d9d7b67217eb42aebc9317ad` |
| Screenshot 2026-11-08 221641.png | GBPUSD quotes and contract top | `c188e560e8e2d6c219256530d1db9cff26f0995acac7347b98dd48c942d045c7` |
| Screenshot 2026-11-08 221649.png | GBPUSD contract bottom | `7194eebabf92ca63c4888008c4e29461f47bc4aa494cfca4785478d1da923a35` |
| Screenshot 2026-11-08 221706.png | USDJPY hours | `3811e16ed012d7db3ba9aa39f41ab98ba0a510d844fa0d76d6e79288c52b7855` |
| Screenshot 2026-11-08 221716.png | USDJPY quotes and contract top | `9915a74bb3d6f7a63e34c76c850a3e104ecc0a4d19b306f3653e669ad0997c67` |
| Screenshot 2026-11-08 221725.png | USDJPY contract bottom | `3f441811ac59b5958b19e82130cea334f1a7b74e33cb7fecf232667c1bfe1b17` |
| Screenshot 2026-11-08 221738.png | USDCHF hours | `38798c71f3aa41c2b5141a3e70aa55609d24a0c83385df8758cb728d45788a26` |
| Screenshot 2026-11-08 221757.png | USDCHF quote and contract (partial fees) | `49b5f81716daf4ee542aae05e2b4913211bc1e3a4521873e605add0674f35b26` |
| Screenshot 2026-11-08 221812.png | AUDUSD trading hours and quote | `5e72467dd4af22fb6ae36aaccc72edc223e2984f1413a79c3398944dc56f6595` |
| Screenshot 2026-11-08 221822.png | AUDUSD specification | `dbf7e54719573349eec5967c0e87e90e68897f9b8eb20ef992ee2cfff8ef2111` |
| Screenshot 2026-11-08 221833.png | USDCAD hours and quote | `dce2d6ffb3d9dd3cdc5cc5b57a85792841aedbaf438458a7eb64a4b770da32d4` |
| Screenshot 2026-11-08 221842.png | USDCAD specification | `ee8b85fabfc7fe8f8db636a490a3bd1d28e504ff63f61a344aa051a3ad6ea0bd` |
| Screenshot 2026-11-08 221854.png | NZDUSD hours and quote | `8f2f988d2d0864b17ab6591619e8c5ed138f9b2fab7e6b97314b9a988742c27a` |
| Screenshot 2026-11-08 221903.png | NZDUSD specification | `3347240efab01def488bef4e2da73eb3e55edc1f7ba9d6bd0cf3339cc37af304` |
| Screenshot 2026-11-08 221916.png | XAUUSD trading hours and quote | `badefe099502a15567afbf0683a7c79953a2145c693eb4fa6a485cf2a31367d7` |
| Screenshot 2026-11-08 221927.png | XAUUSD specification | `e801385b24534125eab9ba535b25b84a6024a891456bc2789d817afd66c26bbf` |

## Gate 6B disposition and next requirements

**PARTIAL: all seven current instrument contract snapshots captured; NOT fully verified for historical GatesFX net profitability.**

Outstanding: (1) actual lot-step/maximum/tier rules, netting/hedging and margin/stopout applicability to Standard STP $1,000 account; (2) exact swap-asterisk meaning and historical financing cost schedule including rollover/triple swap; (3) historical STP bid/ask spread observations by pair and session for 2022–2023 or defensible labeled model cross-provider bounds; (4) defensible slippage and execution records, plus any closing fee or other charge; (5) confirmed broker/server timezone transitions and historical market hours. Current snapshots cannot retroactively supply these records.

**Research status: provisional / UNRANKED**, no strategy qualified, no newly executed historical replay in this documentation update. Keep 2022/2023 as training, 2024 as exposed development, and all 2025 sealed/unread. Do not upload raw vendor quotes, merge branches, change production or execute real orders.
