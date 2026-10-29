# XMI 2.0 Milestone 2F — Offline Research Validation & Reporting

## Release boundary
PREVIEW ONLY. Stacked on unmerged development PR #21, which depends on #20/#19/#18/#17. No production merges, deploys, broker writes, order execution, automatic trade triggers, live equity feeds, new credentials, or DB migrations.

## Implemented
- Generate JSON research reports in Strategy Lab from a selected pair of immutable strategy versions and a single user-imported local OHLC data file.
- Re-evaluate the comparison against the same imported data and saved parameters before export. A stale or altered comparison fails closed.
- Compute Web Crypto SHA-256 over a canonical exact sequence of **all fully closed** time/open/high/low/close/volume values, symbol and resolution. A forming candle remains excluded.
- Hash the entire bounded report body separately with SHA-256. Reports can be re-imported for offline integrity verification, with strict schema validation, checksum checks, bounded file sizes and non-executable data handling.
- Export only summary information, selected version parameters, SHA-256 dataset digest, a conservative session-coverage audit and explicit non-execution disclosures. OHLCV candles themselves, trading credentials, fills and P&L are not stored or exported.
- Classify all missing UTC-weekend slots in a bounded dataset without a 10,000-interval limit; equity venue calendars remain explicitly unverified. Weekend heuristics are not holidays, DST schedules, exchange session proof or price authenticity.
- UI shows report integrity status only after local verification; no report upload or background network request.

## What the checks establish
SHA-256 detects changes to the report relative to its embedded checksum, and produces a reproducible label for the fully closed OHLCV series. It does **not** provide a digital signature, prove provider authenticity, independently validate market timestamps, or predict returns. A modified report can carry its own recomputed checksum: compare against an independently retained digest for tamper evidence.

## Acceptance gates
1. Unit tests cover identical exports, full OHLCV digest changes, rejected modified versions/counts/digest, strict JSON schema, no broker or profit fields, and bounded input sizes.
2. UTC weekend coverage tests include gaps longer than the old heuristic's 10,000-slot inspection; no exchange-calendar guarantees.
3. Chromium smoke downloads an actual report, verifies it from a local file, then rejects a tampered file; historical replay, workspace restoration and read-only feed regression checks remain intact.
4. Vercel preview READY and GitHub Actions success at the final exact commit SHA. Production `main` unchanged.

## Deferred
- Independent feed provenance and signed reports, official exchange session calendars (including regional holidays and DST), historical fees/spreads and trade-simulation features.
- Strategy score profitability or trading execution: not part of this milestone.