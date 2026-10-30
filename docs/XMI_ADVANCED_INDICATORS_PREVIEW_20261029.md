# XMI — Advanced Indicators, FX Research Presets & Chart Interaction (preview)

**Scope:** Proposed read-only XMI development branch. No production deployment, broker orders, stop management, position scaling, authenticated feed changes or market-provider integrations.

## Implemented
- Causal ATR(14), ADX(14) with +DI and -DI, Bollinger(20, population σ ×2), prior-20-bar Donchian and Stochastic(14, smoothed 3 K / 3 D); calculations are based only on available historical bars.
- Technical indicator toggles and dynamically constructed lower Lightweight Charts v5 panes. Only enabled RSI/ADX/Stochastic, MACD, ATR and volume panes are allocated; disabled groups have no empty lower pane.
- Compact one-per-closed-bar nonoverlapping dots or labeled full-color marker icons; alternative color palette and an off mode. Structure and technical markers deconflicted per timestamp. Historical annotations do not appear on unclosed bars.
- Per-symbol research presets: EURUSD trend strength (5m), GBPUSD Donchian breakout (15m) and USDJPY Stochastic pullback (5m). Existing scalp/day/swing/XMI presets unchanged. Exact pair requirement; unverified pairs show not applicable. Original XMI hard-confirm remains unscored.
- ADX and ATR required-filter toggles and bounded thresholds in Strategy Lab: ADX 10–45, ATR 0–50 approximate pips. JPY pip reference 0.01, other FX pairs 0.0001. For pair-specific research these evidence requirements remain mandatory.
- Drag saved drawing endpoint handles by activating **Drag saved handles** in toolbox; a handle must lie within 18 pixels, updated coordinates are validated and persisted through the existing local drawing format. No broker routes touched.
- New optional **responsive** (6s on 1m, 8.5s on 5m) read-only OHLC polling, with visibility gating, single in-flight requests, exponential failure backoff and same signed feed-session access. This is polling, **not** a tick stream; new bars remain limited by the data provider. Default **balanced** polling remains unchanged.

## Explicit risk limits
These indicators are not independently proven profitable. Combining filters can overfit, especially on small OHLC samples. Repainting is prevented for confirmed research observations by excluding unclosed candles and future swing pivots; currently forming plots can move until bar close. Donchian boundaries deliberately exclude the bar being classified. Calendar, liquidity, spread, tick volume reliability, execution costs, take-profit/stop and position-scale management are not verified. No automatic trade entries, risk sizing or pyramiding are added.

## Release gates
Run GitHub `XMI read-only chart checks` and historical-import-only CI (if triggered); Chromium browser smoke including existing workspaces; evaluate UI for pane labels, marker modes, drag handles, and responsive polling. Build Vercel preview from final branch SHA. Keep PR draft and production unchanged.

## Future work (not represented as implemented)
Independent per-venue/session calendars, validated strategy performance with spread/slippage, truly streaming vendor API (licensed, separate approval), movement of arbitrary automatically generated structural annotations (only manually saved drawing handles are draggable), full mobile drag/accessibility QA, detailed user-editable strategy parameter periods, and explicit multi-leg scale-in/scale-out position planning.
