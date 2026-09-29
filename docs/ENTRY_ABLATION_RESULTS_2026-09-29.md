# Entry-confirmation diagnostic and controlled comparison

Completed September 29, 2026 (Chicago). **None of the three variants qualifies.**
Removing MACD confirmation produced substantially more trades and worse results.
Removing the previous-bar break slightly improved base-cost results but remained
negative and failed the stress test. Neither change is approved for promotion.

## Design and provenance

- Baseline strategy: `forex-trend-pullback-v1` 1.2.0, original C049 policy.
- USDCHF, EURUSD, GBPUSD; M15 entries and completed H1 regime; $200 starting balance.
- Fixed 1% risk, one portfolio position, two portfolio entries per UTC day,
  shared ADX 20, strict news, 0.01 lot maximum, original loss and spread guards.
- ORIGINAL retains all conditions. NO_MACD removes only the histogram zero-cross
  requirement. NO_BAR_BREAK removes only the previous-bar close-break requirement.
- Stops, 1.8R gross target, next-open execution, deterministic pair order, calendar,
  broker minimum lots, and cost assumptions are unchanged.
- Held-forward comparison: May 14, 2025 10:30 UTC through September 25, 2026 21:00 UTC.
- Full descriptive period: January 1, 2024 through September 25, 2026, with warmup.
- Frozen input hash: `61e9d2fae987acf428cb8034e04514d7f84ad01e9e1a2f03d606de09ea740c14`.
- Restored from the corrected portfolio-144 archive; reference code commit
  `c34d05352844779625ae3490a180c98e9888132a`. Source SHA-256 hashes are in results.json.
- Rules were recorded in ENTRY_ABLATION_PROTOCOL.md before computing variant outcomes.
  These historical periods were previously examined. This is exploratory research,
  not a fresh out-of-sample result or a new prospective validation.

## What restricts signals?

Across held-forward data there were 102,210 pair-candles, of which 67,143 had at least
one session/shock/warmup block and another 21,698 lacked an H1 direction. The following
counts use only the remaining **13,369 pair-candles**. They are opportunities evaluated
at candle closes, not independent trades. Failure columns overlap; do not add them.

| Condition | Failed condition | Sole failed condition |
|---|---:|---:|
| M15 EMA trend | 2,082 | 9 |
| Pullback | 6,168 | 15 |
| RSI reset | 5,864 | 50 |
| RSI trigger | 4,644 | 1 |
| MACD histogram zero cross | 12,940 | 993 |
| Previous-bar break | 10,034 | 68 |

The original rules produced 162 raw signals. Removing MACD produced 1,155; removing
the bar break produced 230. The increases exactly match their sole-failure counts.
Scheduled-news and execution guards are applied afterward. The simulator counts
the first execution rejection only, so those counts do not measure every overlapping
reason a setup might fail. Historical training counts and per-pair counts are exported.

## Held-forward outcomes

| Variant | Trades | Ending balance | Return | PF | Expectancy R | Realized max DD | Min-lot skips | Stress trades | Stress return |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Original | 40 | $197.57 | -1.21% | 0.941 | -0.0523 | 9.75% | 80 | 18 | -7.86% |
| No MACD | 141 | $167.66 | -16.17% | 0.767 | -0.1567 | 18.80% | 335 | 66 | -12.62% |
| No bar break | 53 | $198.37 | -0.81% | 0.969 | -0.0216 | 8.41% | 107 | 25 | -7.99% |

Base costs: 2-pip spread plus 0.2-pip slippage per side. Stress: 2.5-pip spread plus
0.4-pip slippage per side. Stress changes which entries fit spread and sizing guards;
these are not identical-trade cost deductions. That is why NO_MACD's stressed total
loss is smaller despite its stressed per-trade expectancy being worse.

NO_MACD lost money in all three chronological windows. NO_BAR_BREAK had positive
net-R results in two windows but still failed profit-factor/expectancy, stress, and
pair gain-concentration criteria. Original eligibility thresholds were not relaxed.

## Pair and direction contributions

These are contributions from each shared portfolio path, not independently traded
single-pair backtests. Removing a pair can change opportunity selection and sizing.

| Pair | Original trades / net P&L | No MACD trades / net P&L | No bar break trades / net P&L |
|---|---:|---:|---:|
| USDCHF | 11 / +$9.59 | 36 / +$5.15 | 11 / +$13.00 |
| EURUSD | 15 / -$12.95 | 58 / -$22.59 | 21 / -$17.34 |
| GBPUSD | 14 / +$0.93 | 47 / -$14.90 | 21 / +$2.71 |

EURUSD lost on both long and short contributions in all three variants. In the
original portfolio, USDCHF longs contributed +$8.27 from seven trades, GBPUSD shorts
+$7.50 from ten trades, and GBPUSD longs -$6.57 from four trades. These small samples
identify hypotheses, not reliable direction-selection rules. Full pair/direction
and entry-UTC-hour contributions are exported without selecting a best hour.

Removing the bar break added 20 executed entries and displaced seven original
entries, rather than simply appending 13 trades. Removing MACD added 130 and displaced
29. Earlier trades affect balance, capacity, cooldowns and later eligibility.

## Decision and next experiment

1. Retain MACD in the reference strategy. Its restrictiveness alone did not establish
   that removing it would help; this comparison argues against that proposed removal.
2. Do not promote NO_BAR_BREAK. Its approximately $0.80 base-cost improvement is
   insufficient and disappears under stressed costs.
3. The next focused hypothesis is pair composition, using the original rules:
   compare all three pairs, USDCHF+GBPUSD, and USDCHF alone under identical controls.
   This experiment has **not** been run here. Do not infer its outcome by subtracting
   EURUSD's contribution, and do not call a one-pair result portfolio diversification.
   A one-pair experiment needs separately declared evaluation criteria; the original
   three-pair distribution and concentration requirements cannot be silently reused.
4. Freeze any resulting candidate and prospective evaluation dates before collecting
   outcomes. Keep these historical diagnostics separate from that fresh evidence.

## Verification, safety and remaining limits

The original descriptive, held-forward and stress outputs reproduced the archived
control exactly, including every trade and metric. Signal-superset and sole-failure
identities passed. Independent checks verified 769 trade records across the nine
variant/scenario outputs, including price, sizing, P&L, target distance, next-open
timing, daily limits, and the one-position risk budget. This includes repeated and
overlapping trades; it is not 769 independent observations. All 25 existing research
engineering tests passed.

All computation ran offline with no broker/network/database/order client. Only a new
research script and documentation were added. Production strategy modules, secrets,
runtime settings and the kill switch were not changed. No orders, deployment promotion,
or PR merge was performed. The previous runtime readback was trading disabled and
kill switch enabled; this offline task did not obtain a fresh runtime readback.

Original data/model limits remain: 239 incomplete observed hours excluded under the
existing rule; reproducible broker gaps; BID/OHLC cost proxy rather than exact ask-side
barriers; no commissions, financing or margin model; realized rather than open-equity
drawdown; historical-calendar declarations not independently re-audited in this task.
No candles were filled in, and no new quote or calendar claim was made.

Reproduce with Node 24 after `npm ci`:

```sh
node --loader ./scripts/research-loader.mjs scripts/entry-ablation.mjs research-output research-output/entry-ablation
```

The input directory must contain dataset.rechecked.json and the original corrected
results.json. Output contains full diagnostic counts, nine scenario ledgers,
contribution breakdowns, verification metadata, and summary.csv.
