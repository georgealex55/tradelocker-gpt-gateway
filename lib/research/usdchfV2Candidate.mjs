export const USDCHF_V2_CANDIDATE = Object.freeze({
  id: "usdchf-v2-candidate-2026-09-27",
  version: "2.0.0-research-candidate",
  symbol: "USDCHF",
  timeframe: "M15",
  regimeTimeframe: "1H",
  riskPercent: 1.00,
  maxPositions: 1,
  entryHourUtcStart: 10,
  entryHourUtcEndExclusive: 16,
  maxEma50Ema200GapPips: 30,
  targetR: 1.8,
  newsPolicy: "STRICT_BLACKOUT",
  dailyLimit: "PORTFOLIO",
  parameters: "SHARED",
  objective: "RETURN",
  lockedAt: "2026-09-27T00:00:00.000Z",
  note: "Frozen Phase 3 research candidate. Do not optimize during Phase 3 evaluation."
});
