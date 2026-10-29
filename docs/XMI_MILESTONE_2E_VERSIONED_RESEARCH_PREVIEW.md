# XMI 2.0 Milestone 2E — Versioned Historical Research Comparisons

**Development preview only**, stacked on draft PR #20 (2D), PR #19 (2C), PR #18 (2B), PR #17 (2A). Do not merge or promote to production until separately approved.

## Scope
- Save up to twelve immutable copies of the current research preset settings per strategy (including selected timeframe and indicator thresholds). Records stored locally in `xmi-strategy-research-versions-v1`; no server access.
- Pair two saved versions of the **same** strategy and matching timeframe against one locally imported, verified historical candle file. Both replays run at the same import timestamp, with no future candle lookahead.
- Show descriptive aligned/conflicted/mixed/not-ready counts, observation-level classification changes and the number of jointly scored bars, not trade profit.
- Provide an explicit Save summary action. Save only bounded metadata: version IDs, non-cryptographic local dataset label, candle count and classification differences; no raw candles, observations, trades or broker secrets. Maximum eight local summaries.
- Local versions and summaries persist on reload. Chart data remains in browser memory and must be reimported after reload. Local sign-out removes unencrypted saved research data.
- Original XMI hard-confirm strategy remains NOT_VALIDATED and unscored.
- Only current authenticated read-only candle API behavior remains in Live Chart. No network access is introduced into offline research.

## Verification
1. Node tests cover immutable version IDs, data/timeframe consistency, same-prefix replay reproducibility, state comparison, unscored legacy preset, invalid local storage, capacity limits and summary-only persistence.
2. Chromium creates two strategy versions, compares same local import, saves a summary, reloads and confirms versions and summary persist without candle-history storage.
3. Existing XMI source authorization, historical-import-only checks, strategy and chart tests all remain green.
4. GitHub and Vercel checks must be verified against the exact final branch SHA; production `main` remains unchanged.

## Boundaries and limitations
- Descriptive comparisons are not a tradable backtest. No P&L, win rates, profit targets, slippage, spreads, fills or execution.
- Local dataset hash uses a non-cryptographic 32-bit label, suitable for reproducible comparison names but not authenticity verification.
- Historical UTC weekend-gap analysis is heuristic, not a licensed market holiday or session calendar.
- Version snapshots are device-local, not included in the separate encrypted local-settings backup; they are deleted at sign-out.

## Next
Milestone 2F: explicit research export/import with integrity checks; more complete market calendars and validation reports, still without live trade execution.