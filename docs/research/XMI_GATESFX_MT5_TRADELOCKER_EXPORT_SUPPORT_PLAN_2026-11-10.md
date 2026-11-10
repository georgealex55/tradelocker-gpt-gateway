# XMI 2.0 — Updated broker evidence acquisition plan (approved 1C 2C 3A 4A 5A 6A)

**Recorded:** 2026-11-10 UTC, research branch only, not a broker request sent.

## Six confirmed decisions

- **1C:** Examine both existing platform export options AND prepare a focused broker support request. Do not ask for previously supplied TradeLocker instrument screenshots.
- **2C:** User reports access to **both TradeLocker and MT5**. Whether MT5 connects to the *same GatesFX Standard STP server/account* remains unverified; keep sources separate until confirmed by user platform display or broker.
- **3A:** If historical broker bid/ask/fill data are unavailable, continue **public-price historical modeling with varied defensible stress costs**, always explicitly **PROVISIONAL / UNRANKED**.
- **4A:** User confirms **USD account base currency**. Do not ask again for a USD confirmation. User statement does not constitute broker-issued account statement.
- **5A:** Full replay is justified **only by newly verified data, an actual code change affecting results, or preregistered new distinct hypotheses**; never schedule identical historical repeats.
- **6A:** Independent **USD $1,000** starting account for each scenario/pair/year; do not implement shared-capital seven-pair portfolio simulation.

Prior captured source: `XMI_GATESFX_EIGHT_INSTRUMENT_SPECS_2026-11-09.md`. Existing 6,048 scenario-year results: `XMI_GATESFX_RERUN_REPORT_2026-11-09.md`. Canonical reusable evidence: `xmi-gatesfx-evidence-ledger-20261110.json`.

## First: MT5 broker-server evidence (no real orders)

Official MetaTrader 5 terminal documentation: https://www.metatrader5.com/en/terminal/help/trading/market_watch

1. On MT5 desktop, connect to the user's GatesFX **Standard STP** server if available (the platform itself can show this; do not give login credentials to ChatGPT). Confirm that MT5 is reading the same broker/account type as prior TradeLocker screenshots. If not, label the files **another account**, not verified GatesFX STP equivalence.
2. In **Market Watch → Symbols**, select each of EURUSD GBPUSD USDJPY USDCHF AUDUSD USDCAD NZDUSD. Open instrument **Specification**; record **volume minimum, volume step, volume maximum, contract size, margin/calc mode, profit currency, execution, swap type/values, trading sessions**. Existing screenshot values for min lots, contract size, current leverage and displayed spreads are already stored—compare *new* fields, do not recapture all.
3. Select the **Ticks** tab, choose the symbol, specify 2022-01-01 through 2023-12-31 if the broker server retains that interval, **Request → Export**. Save unmodified CSV showing **Bid, Ask, server time and trading venue**. If only Bars/M1 are available, export them with spread fields; mark them less informative about historical tick spread and fills. **No claim that broker server retains 2022–2023 history**. Hash the files locally before use; keep raw vendor data private and out of public GitHub.
4. In MT5 **History** choose a period and export account report/statement if desired to inspect execution prices, commissions and swaps. If there were no actual trades, do not invent or require fills. An MT5 history export for a different account/server is not proof of GatesFX historic STP spread.
5. If historical data are truncated/empty, capture *the precise earliest/latest server-provided timestamp*, symbol and server to distinguish unavailable broker history from a software error.

MT5 deal/report sources:
- https://www.metatrader5.com/en/terminal/help/trading_advanced/history_report
- https://www.metatrader5.com/en/terminal/help/trading/performing_deals

## Second: TradeLocker data provenance

As of the TradeLocker official article dated 2026-05-06, the **client platform has no native CSV, PDF or direct-print trade history export**; user can use its History panel to inspect or copy entries and broker support can provide official statements and trade reports. Do NOT send the user on a nonexistent "TradeLocker CSV export" journey.

Official: https://support.tradelocker.com/en/articles/13752344-journaling-and-history-download

Existing user-supplied TradeLocker instrument-details screenshot bundle covers the entire requested seven-pair contract snapshot and gold. The only TradeLocker tasks left are **new** missing fields if available in another panel, or obtaining broker-issued history. Do not ask for the old snapshots.

## Third: GatesFX support ticket to fill only missing broker records

GatesFX officially lists `support@gatesfx.com` and its client portal's support tickets. Do **not** automatically send the request; user selected drafting, not contacting broker. Official sources:
- https://gatesfx.com/contact
- https://gatesfx.com/support/dedicated-support-gatefx

### Ready-to-send request

**Subject:** GatesFX Standard STP — 2022–2023 historical Bid/Ask data and remaining instrument execution specifications

Hello GatesFX Support,

I have a GatesFX Standard STP account with access to TradeLocker and MetaTrader 5. I am validating historical trading simulations in USD across EURUSD, GBPUSD, USDJPY, USDCHF, AUDUSD, USDCAD and NZDUSD.

I already have current instrument screenshots showing the displayed 100,000-unit Forex contract size, minimum 0.01 lot, 0.20% margin, 1:500 leverage, zero displayed opening commission and example bid/ask spreads. **I do not need those same current specifications repeated.**

Could you please confirm the following **remaining** items for my actual Standard STP account/server, ideally in a machine-readable export or dated specification document:

1. Permitted lot-size **step**, maximum order/position size, margin tiers, actual **margin-call and stop-out thresholds**, and any exceptions or restrictions for the seven named pairs; confirm whether these conditions differed in 2022–2023.
2. Availability of **2022 and 2023 historical Standard STP tick-level Bid/Ask quote history** for these symbols, including server name, timezone/DST policy, timestamps and coverage. If ticks are unavailable, please provide a dated spread-by-pair/session sample or historical M1 bars with spread fields, and note precisely what history exists.
3. Execution and **slippage** information: any available historical execution/fill reports, order-versus-fill timestamps, spread widening around market opens and closes, and any additional closing, overnight or financing fees beyond the displayed zero opening commission.
4. The meaning of the **$0.00*** long/short swap values displayed in TradeLocker, and the actual Standard STP historical swap/rollover/triple-swap rules or rate schedules for 2022–2023.
5. Broker trading-server **UTC offset and daylight-saving transition dates** during 2022–2023, plus any historical market-hour/holiday/session changes.
6. Whether a **GatesFX MT5 connection** provides the same exact Standard STP pricing/account execution profile as my TradeLocker account, or whether their symbol quote feeds, spread markups or terms differ.

If the requested historical files do not exist, please state that explicitly, identify the **earliest available data range**, and explain which current platform exports or broker reports are supported.

Thank you.

## Evidence acceptance and algorithm guard

- Tag any new instrument/spec or tick file with its **source platform, connected server, account class, source timestamps, original filename, SHA-256 and time zone**. Never expose credentials or account numbers in public GitHub.
- Compare exported quote chronology and quote integrity to existing FXCM M1 + independent Dukascopy 2023 W27 training data; do not collapse them into supposedly GatesFX original data without provenance.
- If no broker-authentic 2022–2023 quotes, simulate multiple explicit public bid/ask/snapshot spread/slippage stress levels and label every result **provisional / unranked**. Do not use inferred execution costs as broker-verified.
- Preregister any new strategy or code/data correction that truly warrants another full 7-pair replay, then run it only by manually dispatching the dedicated research workflow. Keep the previously completed 6,048 scenario-year outcomes.
- 2024 remains previously examined development; all 2025 holdout data stays sealed/unread; no production edits or live orders.
