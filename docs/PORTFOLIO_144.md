# $200 portfolio experiment — implementation and pre-registered protocol

## Status at 2026-09-27

**No historical experiment has run. No configurations are recommended yet.**
The research runner, additive schema and authenticated dashboard are implemented.
Synthetic tests are engineering checks, not market performance or historical validation.

Audit baseline: main commit `8aa10a4c99b67836056b0d6e27e0753d440583c5`, strategy
`forex-trend-pullback-v1` 1.2.0. Production runtime readback showed
`tradingEnabled=false`, effective `killSwitch=true`, raw switch `unset` (fail-closed).
No production variables, strategy configuration, broker orders, or cron settings were changed.

### Broker metadata verified through existing read-only endpoints

| Pair | Tradable instrument | Trade route | Info route | Lot size | Minimum / step | Tick | Pip |
|---|---:|---:|---:|---:|---:|---:|---:|
| USDCHF | 7876 | 540005 | 540002 | 100000 | 0.01 / 0.01 | 0.00001 | 0.0001 |
| EURUSD | 7879 | 540005 | 540002 | 100000 | 0.01 / 0.01 | 0.00001 | 0.0001 |
| GBPUSD | 7875 | 540005 | 540002 | 100000 | 0.01 / 0.01 | 0.00001 | 0.0001 |

Broker max is 50 lots; the strategy cap remains **0.01**. Bars are **BID**.
Pip size follows the standard convention for these three majors; broker tick precision
was independently read back. Collection resolves IDs again, never uses this table as guessed defaults.

### Remaining access/data blockers

- `/api/trading/history` requires the existing `TRADE_APPROVAL_KEY`. It is configured
  in the gateway but was not available in the execution workspace. No authentication
  bypass or new unauthenticated data endpoint was introduced.
- The Neon connector is unscoped and requires a project ID. No project ID was available
  from the repository or connector discovery. The migration has not been applied or
  tested against Neon. `tradelocker_gateway` is a database name, not a project ID.
- The inherited macro calendar lacks US GDP, ECB and BOE releases. Its existing dates
  and revised schedules also need source verification over the actual common data window.
  The runner refuses incomplete coverage. Coverage declarations are reviewer attestations,
  not proof that every historical event is present.

## Running the experiment

Use Node 24 (matching the Vercel project). Never put secrets in command arguments,
commits, manifests, screenshots or chat. Supply the existing approval key through a
secure process environment as `TRADE_APPROVAL_KEY`; no Vercel variable edits are required.

1. `npm ci` and `npm run test:research`.
2. Test `db/migrations/002_portfolio_research.sql` on an isolated Neon branch, verify the
   two research tables, then apply the additive migration to `tradelocker_gateway`.
   Existing production trading tables are not touched. No new connection variable is needed.
3. Deploy this research branch to a Vercel preview. Its existing gateway approval key,
   database settings and broker read credentials must be available. Confirm the preview
   runtime also reports execution disabled and kill switch on. Do not enable execution.
4. `npm run research:portfolio -- calendar-template` creates an explicitly incomplete
   starting file under ignored `research-output/`. Fill it from verified official release
   archives; retain actual revised release times and timezone/DST conversions. For each
   required category, record source URL and verified coverage dates; set `reviewedAt`
   and `complete: true` only after review. Required categories are US CPI, Employment,
   GDP, FOMC, SNB, ECB, and BOE. This is the defined event scope, not all global news.
5. `npm run research:portfolio -- collect --gateway https://YOUR-PREVIEW-HOST --calendar /absolute/path/calendar.json`
   collects frozen M15 history in 14-day requests, plus verified instrument metadata.
   Default requested scoring dates are 2024-01-01 through 2026-09-25 21:00 UTC, with
   30 calendar days of requested warmup. Actual common coverage is authoritative.
6. `npm run research:portfolio -- run --gateway https://YOUR-PREVIEW-HOST --limit 12`
   runs a small subset. Inspect ledger, dates, sizing, skip reasons, persistence, and
   dashboard before launching the rest.
7. Repeat with `--limit 144` to finish, or `--limit 12` for resumable batches.
   Restarting skips already persisted successes and retries failures. Keep the process
   alive while running. Closing the dashboard does not interrupt the runner; closing
   the runner stops work after its last saved result.
8. Open `/backtests/portfolio-144?runId=...` and enter the existing approval key in the
   password field. The key is kept only in tab memory; it is never put in localStorage,
   URLs or exports. The dashboard refreshes every ten seconds.

The runner performs compute outside Vercel request lifetimes. Each result is persisted
before the next combination. Compute failures are recorded and processing continues;
persistence failures halt immediately. A ten-minute worker lease prevents concurrent
writers to the same run. After an abrupt failure, wait for lease expiry before resuming.
The dataset/code/calendar/cost fingerprint makes changing inputs create a new run.
The worker ID is operational coordination, not an authentication credential.

Outputs: authenticated persisted results, full JSON including ledgers, CSV leaderboard,
local checkpoint, manifest and dashboard. Local data/output is git-ignored.

## Pre-registered rules (before observing this experiment)

- Enumerate Q1, Q2, Q3, Q4, Q5, then Q6 in the prompt's order as C001–C144.
  There are 48 execution policies × 3 scoring objectives. Objective duplicates have
  identical trade histories; they are not independent statistical experiments.
- Starting realized balance $200. Adaptive risk is 0.75%, raised to 1% only if the
  completed H1 snapshot has ADX >= 30 and absolute +DI/-DI gap >= 10.
- One or two portfolio positions, at most one per pair. Aggregate initial modeled
  stop risk is capped at 1% equity for one slot and 1.5% for two slots. This cap is
  deliberate. No full-risk allocation to each of two simultaneous trades.
- Risk includes modeled spread/slippage and conservative entry/stop currency conversion.
  Floor lots to broker step; reject below minimum as `MIN_LOT_RISK_SKIP`. A skip caused
  specifically by remaining aggregate risk is `PORTFOLIO_RISK_CAP`.
- Daily entries count when opened, including trades still open. UTC daily limit is two
  portfolio-wide or two per pair. Preserve portfolio daily 2% and weekly 5% realized
  loss guards, two consecutive realized losses per UTC day, and four-bar pair cooldown.
  Daily/weekly loss attribution uses historical exit time. Slots/risk free only after
  recorded exits, not by looking ahead within a candle.
- At simultaneous entry times use fixed order USDCHF, EURUSD, GBPUSD. This deterministic
  tie-break can favor earlier pairs and is disclosed; no outcome-based prioritization.
- Preserve strategy signal logic from the existing evaluator: H1 trend, pullback, RSI,
  MACD zero cross, previous-bar break, swing stop + ATR buffer, session/shock controls.
  Scheduled event filtering is applied externally so blocked *setups*, rather than all
  blocked candles, can be counted. No trailing/partial/break-even exits.
- Entry uses the actual following M15 open, only for a contiguous next candle. Recheck
  entry session, stop validity, absolute spread <=3 and spread/stop <=20% there.
  Target is 1.8 times actual entry-to-stop distance. Stop-first on ambiguous bars;
  adverse gaps stop at the observed open. Favorable target gaps receive no improvement.
- Strict news blackout checks signal close and actual entry. CPI/Employment/GDP use
  >=60 minutes pre / >=30 post; central-bank decisions >=90 pre / >=60 post.
  COOLDOWN retains those windows and additionally requires the entire three-bar
  pullback/reset lookback to start after the last applicable blackout ends. No setup
  recycling from before the event. Fixed election blackout is retained.
- Reject duplicated, unordered, malformed or unfinished candles, truncated history,
  mismatched three-pair timestamps and incomplete H1 buckets. No forward-filling.
  Require 250 full H1 warmup bars and at least 180 common calendar days afterward.
  Calendar gaps common to all pairs are reported but cannot automatically be distinguished
  from exchange closures; investigate them before interpreting results.

## Train / held-forward design

First half of common post-warmup history is initial training. The second half is three
consecutive windows, each using all preceding data to fit pair-specific ADX thresholds
from {20,25,30}; all other signal parameters stay fixed. The shared threshold is 20.
Fitting always uses 0.75% risk, one pair/slot, strict events, the base cost model and the
balanced score, regardless of the experiment's risk/objective. It requires ten naturally
closed training trades per candidate; otherwise fall back to 20. Artificial training-end
liquidations do not influence selection. Ties choose lower ADX. Fit provenance is exported.
Stress reuses base-cost fitted parameters without refitting.

Validation starts at $200 at the first held-forward window, then compounds continuously
through all three windows. Open positions survive internal fold boundaries, retaining
entry parameters. The full-period descriptive run starts at $200 at the historical start,
uses shared parameters during initial training, then the same chronological fit schedule.
Only the final end-of-data liquidates remaining positions. Window statistics assign trades
by exit time and use the realized balance at that window's start.

These are **held-forward windows within this experiment**, not claimed virgin out-of-sample
data: earlier strategy development may already have seen them. No future validation prices
or event outcomes enter fitting. Historical corrected release schedules are assumed known
by their blackout start; no vintage schedule-change archive is available in the repository.

## Costs, R and limitations

Base: 2-pip spread + 0.2-pip slippage per side (2.4 pips round-trip).
Stress: 2.5-pip spread + 0.4 per side (3.3 pips round-trip).
The base model is inherited from `usdchfResearch.js`; stress applies to all 48 policies,
not merely the finalists, so ranking cannot hide cost fragility. No current live quote
is used to set historical spread.

The cost model is an **OHLC proxy**: round-trip costs deducted from directional price
movement, with both barriers checked against source OHLC. Since the broker supplies BID
bars, it is not an exact synthetic-ask barrier replay; this particularly limits short-exit
precision. Commission and overnight financing are excluded because verified historical
broker schedules are unavailable. Equity is realized balance, not marked-to-market equity;
reported drawdown can understate open-trade drawdown. Broker margin rules are not modeled.

Risk budgets include costs. Reported realized R = net USD P&L / initial modeled USD stop
risk including costs, so a gross 1.8R price target is not 1.8 net R. This deliberately differs
from the legacy cost-exclusive R denominator and prevents cost-only budget overruns.
USDCHF converts CHF P&L using each historical exit price; EURUSD/GBPUSD are USD-quoted.
Dollar PF is gross positive USD P&L / absolute negative USD P&L. No losses gives a null PF
with explicit `NO_LOSSES`; no-trade strategies are never ranked as preservation winners.
Pair dollar drawdowns are descriptive standalone contribution curves, not additive portfolio
max drawdown attribution.

## Ranking and eligibility

All scores use held-forward base-cost results:
- RETURN: return percentage.
- BALANCED: return% / max(1, drawdown%) + expectancy R.
- DRAWDOWN_CONTROL: -drawdown% + min(expectancy R, 1).

A configuration is eligible only with >=30 validation trades, expectancy >0, PF>1.1,
realized drawdown <=10%, positive stress expectancy and >=20 stress trades, >=5 trades
per pair, at least two positive chronological windows, and no single pair or window
providing >75% of positive dollar gains. Thresholds are fixed before running.

Show up to five eligible entries per objective and deduplicate trading policies for an
overall shortlist up to ten. If fewer than five meet the criteria, report fewer. If none
pass, report **no demo-forward recommendation**. Do not relax gates to manufacture winners.

## Engineering validation

`npm run test:research` checks matrix enumeration, all-144 synthetic fixture execution,
objective invariance, prefix causality, regime adaptation, lot floor/cost budget, concurrent
capacity/risk, historical currency conversion, daily limits, news/cooldown, actual-open
levels, spread checks, stop-first/gaps, PF representation and first-fold fitting causality.
`npm run build` validates Next.js routes and dashboard compilation. Fixture successes are
not a completed real-data subset and do not validate broker/calendar coverage or Neon IO.

## Official calendar starting points

- BLS release schedules: https://www.bls.gov/schedule/
- Federal Reserve FOMC calendars: https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm
- ECB decisions: https://www.ecb.europa.eu/press/govcdec/mopo/html/index.en.html
- BOE MPC dates: https://www.bankofengland.co.uk/monetary-policy/upcoming-mpc-dates
- GDP release archives must be verified with BEA for the actual study period.

Do not infer complete historical coverage from upcoming calendars. No unsourced date
list was fabricated to unblock the runner.
