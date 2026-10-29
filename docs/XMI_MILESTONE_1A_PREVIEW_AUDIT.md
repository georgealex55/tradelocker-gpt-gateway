# XMI 2.0 — Milestone 1A preview-only release audit

**Branch:** `feature/xmi-milestone-1a-workspaces-20261029`  
**Base:** `main` at `c5cb7a176189bebaa5c4988dede9f44b6d2139ff`  
**Status:** Draft PR #16; **do not merge or deploy to production without explicit approval.**

## Intent and scope
- Establish five main workspaces: Live Chart, News & Research, Strategy Lab, **Trading Journal**, and Admin.
- Move the existing `XMICoachPanel` and its opt-in cloud tooling from Admin to Trading Journal without changing its source, its CSV/JSON formats, and its in-memory journal data.
- Add per-tab maximize (viewport overlay), restore, collapse and expand controls. Show a workspace selector inside every tab, including maximized mode. Preserve all tab subtrees on navigation.
- Store versioned, validated local workspace UI preferences (active tab, top banner, tabs, independent maximize and collapse states) and chart UI preferences (ticker slots, selected chart, 1/2/4 layout, timeframes, watchlist, visible rails, snapshot/news sidebar choice, pattern settings).
- Keep the existing `xmi-chart-workbench-v1` drawing/indicator serialization intact; add separately versioned `xmi-chart-ui-v1` state and `xmi-workspace-ui-v3`. The old `xmi-layout-ui-v2` remains readable for simple banner and strategy migrations.
- Include the new validated UI state in the explicit encrypted device-local account Save settings action. Do not change server-side authentication, TradeLocker account rights, broker data endpoints, or strategy signal validation.

## Data and lifecycle audit
- Journal records remain **in memory for the current browser session** unless exported or deliberately synchronized via the existing optional cloud interface; moving the tab does not silently create durable journal storage or migrate journal records.
- Switching primary tabs hides but does not unmount the Trading Journal, preserving the existing session entries.
- Each UI layout read is schema-validated. Invalid symbols, unsupported timeframes, missing values, and extra fields fall back to known safe values. No credentials, trades, or raw market feed responses enter the new UI storage keys.
- The existing browser-local account login remains distinct from the separately authorized read-only candle feed.
- The old XMI strategy remains unscored; no trade execution, broker orders, or validated strategy alerts are introduced.
- A "maximize" is an **in-app full-viewport overlay**, not browser-native fullscreen on every tab. Existing Chart Studio browser fullscreen controls remain available.

## Test and acceptance criteria
1. Existing XMI chart Node tests and historical-import-only checks pass.
2. Chromium can select all five tabs; Admin shows only system/access information; Trading Journal contains the existing journal and remains mounted when another tab is selected.
3. Each tab's collapse state toggles without unmounting its content; maximize fills the viewport and restores. Workspace switching remains accessible while maximized.
4. Selected main tab, chart layout, and bound ticker slots restore after reload.
5. An existing encrypted local account can explicitly save validated workspace and chart UI settings without sending the password or preferences to the server.
6. Existing read-only Forex feed gate, same-origin checks, source errors, no-order hard lock, and historical import behavior remain unchanged.
7. Vercel preview deployment is READY on the reviewed head; GitHub `main` and production alias remain on the pre-milestone commit.

## Intentional non-goals and follow-up milestones
- No implementation of detachable cross-monitor windows, named watchlists, licensed equity feeds, multi-user server auth, automatic trading, strategy versioning, advanced admin controls or journal schema redesign.
- Journal questions 32–36 remain undecided from the master specification and must not be filled with invented assumptions.
- Browser-local saved states are origin-specific; production and preview URLs do not share localStorage automatically.
- Manual QA should verify responsive views (including 1366px laptops and mobile widths), browser fullscreen interactions, and accessibility beyond the core smoke test before production promotion.

## Rollback
All changes are additive except XMI workstation presentation. Reject or close the draft PR to keep production unchanged. Do not introduce database migrations. When explicitly authorized to release, verify the exact PR head and CI checks before merging; rollback should restore the prior production deployment without losing unchanged source journal data.
