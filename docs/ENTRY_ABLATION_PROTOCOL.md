# Entry confirmation ablation — 2026-09-29

Exploratory research only. The prior portfolio-144 outcomes have already been inspected;
these dates are not a fresh holdout. No Production configuration or execution change.

Frozen dataset input hash: `61e9d2fae987acf428cb8034e04514d7f84ad01e9e1a2f03d606de09ea740c14`.
Control: C049 (fixed 1%, one slot, two entries/day portfolio-wide, strict news,
shared ADX 20, $200). Original chronology, complete-H1 exclusions, 0.01 lot cap,
stop/target, sessions, loss guards, costs and stress assumptions remain unchanged.

Three variants, specified before computing their outcomes:

1. ORIGINAL: unmodified evaluator configuration.
2. NO_MACD: only `requireMacdHistogramZeroCross=false`.
3. NO_BAR_BREAK: only `requirePreviousBarBreak=false`.

Measure baseline conditions on all evaluated candles, separately for historical
training and held-forward dates, by pair. Report overlapping failure counts and
sole-failure counts among candles where session/shock/warmup blocks are absent and
H1 direction exists. Sole failures measure additional raw signal opportunities,
not fills or profitability. Scheduled-news and execution rejection counts remain
separate; the simulator reports only the first blocking execution guard.

Run full-period descriptive, held-forward base and held-forward stressed simulations.
Preserve existing eligibility gates. Report trades, net expectancy, profit factor,
realized drawdown, cost sensitivity, pair/direction/session-hour contributions,
chronological windows, and minimum-lot skips. Do not select a variant on trade count
alone. Reproduce control ledgers exactly and verify new ledgers independently.

No $500 sweep, parameter fitting, news relaxation, simultaneous removal of both
conditions, fresh-data claim, or live/demo execution is part of this experiment.
Any candidate selected from this work needs a separately frozen prospective protocol.
