# XMI 2.0 gateway integration plan (preview only)

## Verified target

- Existing Vercel project `tradelocker-gpt-gateway` (`prj_JorE7MjPw1FjLvQmOUFGZ4kCowUp`).
- Connected GitHub: `georgealex55/tradelocker-gpt-gateway`, a PUBLIC repository using Next.js 15.
- Existing gateway home, TradeLocker execution/risk controls, scheduled research jobs, and Forex Strategy V1 remain unchanged.
- The XMI source repository `georgealex55/XMI-terminal` is PRIVATE, with an independent Draft PR #2. No XMI private code, user trades, tokens, or database connections are copied into this public repository.

## This safe first milestone

- New Next.js route `/xmi` provides 1/2/4 TradingView-hosted Advanced Chart widgets with stock/ETF venue validation and timeframe selection.
- Widgets are external TradingView hosted components. Their data comes from TradingView, **not Alpaca IEX**. Widget candle/crosshair state is not available to the XMI coaching engine. This work is not a substitution for XMI's programmable chart selection, custom indicators, or historical evidence analysis.
- No broker orders or TradeLocker execution routes are called by the workstation. TradingView's Trading Platform/Advanced Charts licensed source is **not** included.
- Feature work is contained in `feature/xmi-tradingview-workstation-preview`. No production branch changes or automatic order actions should be enabled.

## Recommended two-repository architecture

1. Keep the public TradeLocker gateway as the deployable Next.js shell hosting the read-only TradingView chart experience.
2. Keep the private XMI repo and Neon preview branch as the market-news interpretation and personal coach source until a verified private integration boundary and explicit approval.
3. Connect source-verified XMI research using a purpose-built, read-only API with a dedicated database role; never reuse TradeLocker's execution database credentials or broker approval headers.
4. Store personal coaching memory in a separately authenticated, row-level-secured datastore, not in widget configurations, browser-readable service secrets, or public GitHub code.
5. Treat direct repository merging as a separate, explicit decision after reviewing whether the combined repository must be PRIVATE. Do not merge branches or move private code in this stage.

## QA gates before production

- Confirm TradingView widget actually loads on a Vercel preview, on desktop and mobile.
- Confirm symbol/timeframe/layout controls work and chart provider coverage is appropriate.
- Verify no gateway execution request is made when using any XMI control, including browser network testing.
- Confirm no existing TradeLocker signal, backtest, cron, risk or kill-switch regression.
- Confirm XMI-only news and personal trades cannot reach public endpoints or public source.
- Obtain explicit user approval for any merge, domain assignment, or production deployment.
