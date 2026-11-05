# XMI simulation staging verification — 2026-11-05

This checkpoint covers the clean-chart milestone and an initial historical research/simulation foundation. It does not certify the complete autonomous platform or any strategy's profitability.

| Check | Result |
|---|---|
| Automated regression and simulation tests | 211 passed, 0 failed |
| Optimized Next.js build | Passed; existing unrelated CSS compatibility warnings remain |
| Client secret scan | New simulation admin key and database URL absent from all 67 client build artifacts scanned |
| Isolated Postgres integration | Concurrent revisions, checkpoint reload, injected-crash recovery, unique trials/trades, blocked synthetic qualification, unchanged main namespace passed |
| Guard v2 | New preview opens the isolated store; old preview guard mismatches; original records retained |
| Browser clean defaults | Zero enabled technical studies, zero enabled structure concepts, marker display off |
| Browser Apply All / Hide All | Optional panels created and removed; canvas layers 7 → 23 → 7 |
| Browser strategy switching | Did not re-enable overlays |
| Browser intentional selection | EMA enabled explicitly, preserved after reload |
| Browser chart controls | Reset Chart, zoom, fit and logarithmic scale exercised |
| Browser management and persistence | Separate sign-in, history acquisition, job queue, four saved training steps, pause/resume, frozen validation, equity and event journal exercised |
| API boundary checks | Anonymous/private ledger denied; feed cookie denied; cross-origin login denied; management login passed; CSV/JSON quarantine flags verified over HTTP |
| Mobile layout | 390px viewport; no document horizontal overflow; four registry cards accessible |
| Source quality | Failed; dataset quarantined and research paused |
| Unattended scheduler | Not installed or enabled |
| Forward demo fills | Not installed; OHLC replay cannot create forward fills |
| Production / real-money orders | No production change, no real-money order requests |

The returned EURUSD 15m source history contained 4,999 closed candles. Calendar review found 672 Saturday candles with price movement, and 1,260 bars in core closed-weekend periods. This invalidates performance research from that source until provenance/session semantics are resolved. The four-configuration run and its 23 reconstructed holdout trades prove execution-path persistence and exact ledger reconciliation only; they are explicitly not accepted performance evidence. Qualification had already failed before the source quarantine.

The original dataset and run remain immutable records. An independent persisted incident invalidates their evidence. New jobs and resumed work on quarantined datasets are blocked. CSV/JSON exports include the quarantine review. Guard revision v2 also prevents older previews from writing through the obsolete validation path.

The existing 4H chart source returned invalid candles and remains unresolved; the 5m chart displayed vendor-supplied candles. No source bars were interpolated, shifted, or replaced to hide a failure.

See [architecture, assumptions, costs and release gates](XMI_SIMULATION_STAGING.md). Draft PR: https://github.com/georgealex55/tradelocker-gpt-gateway/pull/32.

Final app preview: https://tradelocker-gpt-gateway-mapkqzt8k-georgealex1925-2750s-projects.vercel.app/xmi/simulation. Verified app source commit: `a2f9fb3ccf3ee2bbda277efba9646cbead98c066`. Production alias still points to baseline commit `192efd2dda301177be624a069adafda9c9cc9d9f`.
