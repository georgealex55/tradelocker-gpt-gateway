// Offline market-structure research only. No broker, database, credential, or order-client imports.
import fs from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import { validateDataset } from "../lib/research/prepare.mjs";
import { summarize, sizePosition } from "../lib/research/engine.mjs";
import { COSTS, M15 } from "../lib/research/policies.mjs";
import {
  buildMarketStructure,
  findRetestEntry,
  armChochBosSequences
} from "../lib/research/marketStructure.mjs";

const STARTING_BALANCE = 200;
const VALIDATED_INPUT_HASH =
  "61e9d2fae987acf428cb8034e04514d7f84ad01e9e1a2f03d606de09ea740c14";
const SYMBOL = "USDCHF";
const H1 = 60 * 60 * 1000;

const CONFIG = Object.freeze({
  id: "market-structure-v1",
  symbol: SYMBOL,
  pivotLeft: 2,
  pivotRight: 2,
  atrBars: 14,
  atrStopMultiple: 2,
  channelEntryBars: 20,
  channelExitBars: 10,
  maxRetestBars: 8,
  riskPercent: 1,
  maxLots: 0.01,
  maxPositions: 1,
  maxEntriesPerUtcDay: 2,
  entryHourUtcStart: 7,
  entryHourUtcEndExclusive: 16,
  maxSpreadPips: 3,
  maxSpreadAsStopFraction: 0.2,
  newsPolicy: "STRICT_BLACKOUT"
});

const VARIANTS = Object.freeze([
  "STRUCTURE_A",
  "STRUCTURE_B",
  "STRUCTURE_C"
]);

const source = process.argv[2] || "research-output";
const out =
  process.argv[3] || "research-output/market-structure-v1";
const baselinePath = process.argv[4] || null;

const dataset = JSON.parse(
  await fs.readFile(
    path.join(source, "dataset.rechecked.json"),
    "utf8"
  )
);
const prepared = validateDataset(dataset);
assert.equal(
  prepared.inputHash,
  VALIDATED_INPUT_HASH,
  "FROZEN_DATASET_HASH_MISMATCH"
);

const validationFrom =
  Math.ceil(
    (prepared.from + (prepared.to - prepared.from) / 2) / M15
  ) * M15;

assert.equal(
  validationFrom,
  Date.parse("2025-05-14T10:30:00.000Z"),
  "VALIDATION_BOUNDARY_DRIFT"
);

const validationWidth = (prepared.to - validationFrom) / 3;
const schedule = Array.from({ length: 3 }, (_, i) => ({
  from:
    Math.ceil(
      (validationFrom + i * validationWidth) / M15
    ) * M15,
  to:
    i === 2
      ? prepared.to
      : Math.ceil(
          (validationFrom + (i + 1) * validationWidth) / M15
        ) * M15
}));

const pair = prepared.pairs[SYMBOL];
const structure = buildMarketStructure(pair.candles, {
  pivotLeft: CONFIG.pivotLeft,
  pivotRight: CONFIG.pivotRight,
  atrBars: CONFIG.atrBars
});
const bars = structure.bars;
const h1BySignalTime = new Map(
  structure.snapshots.map(x => [x.signalTime, x])
);
const m15ByTime = new Map(
  pair.candles.map(c => [c.time, c])
);

function max(rows) {
  return Math.max(...rows);
}

function min(rows) {
  return Math.min(...rows);
}

function dayKey(time) {
  return new Date(time).toISOString().slice(0, 10);
}

function weekKey(time) {
  const d = new Date(time);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return dayKey(+d);
}

function sum(rows, fn) {
  return rows.reduce((n, row) => n + fn(row), 0);
}

function channelTapes() {
  const entries = {};
  const exits = {};

  for (let i = 0; i < bars.length; i++) {
    const bar = bars[i];

    if (i >= CONFIG.channelExitBars) {
      const exitWindow = bars.slice(
        i - CONFIG.channelExitBars,
        i
      );
      const exitHigh = max(exitWindow.map(x => x.high));
      const exitLow = min(exitWindow.map(x => x.low));

      exits[bar.lastM15Time] = {
        exitLong: bar.close < exitLow,
        exitShort: bar.close > exitHigh,
        h1Time: bar.time,
        close: bar.close,
        exitHigh,
        exitLow
      };
    }

    if (i < CONFIG.channelEntryBars) continue;

    const entryWindow = bars.slice(
      i - CONFIG.channelEntryBars,
      i
    );
    const entryHigh = max(entryWindow.map(x => x.high));
    const entryLow = min(entryWindow.map(x => x.low));

    let action = null;
    let trigger = null;

    if (bar.close > entryHigh) {
      action = "BUY";
      trigger = entryHigh;
    } else if (bar.close < entryLow) {
      action = "SELL";
      trigger = entryLow;
    }

    if (action) {
      entries[bar.lastM15Time] = {
        action,
        trigger,
        h1Time: bar.time
      };
    }
  }

  return { entries, exits };
}

const channel = channelTapes();

function sameDirectionBos(snapshot, action) {
  const type = snapshot?.event?.type;
  return (
    (action === "BUY" && type === "BOS_BULLISH") ||
    (action === "SELL" && type === "BOS_BEARISH")
  );
}

function setupA() {
  const candidates = [];
  let channelBreakouts = 0;
  let sameBarBosMatches = 0;

  for (const [signalTimeRaw, breakout] of Object.entries(
    channel.entries
  )) {
    const signalTime = Number(signalTimeRaw);
    channelBreakouts++;
    const snapshot = h1BySignalTime.get(signalTime);

    if (!sameDirectionBos(snapshot, breakout.action)) continue;
    if (!(snapshot?.atr > 0)) continue;

    sameBarBosMatches++;
    candidates.push({
      variant: "STRUCTURE_A",
      side: breakout.action,
      signalTime,
      h1Time: breakout.h1Time,
      entryTime: signalTime + M15,
      atr: snapshot.atr,
      structuralLevel: snapshot.event.level,
      channelTrigger: breakout.trigger,
      retestTime: null,
      structureEvent: snapshot.event.type
    });
  }

  return {
    candidates,
    diagnostics: {
      channelBreakouts,
      sameBarBosMatches,
      rawCandidates: candidates.length
    }
  };
}

function retestCandidates(events, variant) {
  const candidates = [];
  const retestStates = {
    READY: 0,
    INVALIDATED: 0,
    EXPIRED: 0,
    NO_ENTRY_CANDLE: 0
  };

  for (const event of events) {
    if (!(event.atr > 0)) continue;

    const retest = findRetestEntry({
      candles: pair.candles,
      event,
      maxRetestBars: CONFIG.maxRetestBars
    });

    retestStates[retest?.state] =
      (retestStates[retest?.state] || 0) + 1;

    if (retest?.state !== "READY") continue;

    candidates.push({
      variant,
      side: event.direction,
      signalTime: event.signalTime,
      h1Time: event.h1Time,
      entryTime: retest.entryTime,
      retestTime: retest.retestTime,
      atr: event.atr,
      structuralLevel: event.level,
      channelTrigger: null,
      structureEvent: event.type,
      reversalConfirmedBy:
        event.reversalConfirmedBy || null
    });
  }

  candidates.sort(
    (a, b) =>
      a.entryTime - b.entryTime ||
      a.signalTime - b.signalTime
  );

  return {
    candidates,
    diagnostics: {
      inputEvents: events.length,
      retestStates,
      rawCandidates: candidates.length
    }
  };
}

function setupB() {
  const bosEvents = structure.events.filter(event =>
    ["BOS_BULLISH", "BOS_BEARISH"].includes(event.type)
  );
  return retestCandidates(bosEvents, "STRUCTURE_B");
}

function setupC() {
  const confirmed = armChochBosSequences(structure.events);
  return retestCandidates(confirmed, "STRUCTURE_C");
}

const setups = {
  STRUCTURE_A: setupA(),
  STRUCTURE_B: setupB(),
  STRUCTURE_C: setupC()
};

function overlapsBlackout(from, to) {
  for (const blackout of prepared.blackouts || []) {
    if (
      Array.isArray(blackout.currencies) &&
      blackout.currencies.length &&
      !blackout.currencies.some(currency =>
        [SYMBOL.slice(0, 3), SYMBOL.slice(3)].includes(currency)
      )
    ) {
      continue;
    }

    const start = Date.parse(blackout.from);
    const end = Date.parse(blackout.to);

    if (
      Number.isFinite(start) &&
      Number.isFinite(end) &&
      start <= to &&
      end >= from
    ) {
      return true;
    }
  }

  return false;
}

function sessionBlock(entryTime) {
  const d = new Date(entryTime);
  const hour = d.getUTCHours();

  if ([0, 6].includes(d.getUTCDay())) {
    return "ENTRY_OUTSIDE_SESSION";
  }

  if (
    hour < CONFIG.entryHourUtcStart ||
    hour >= CONFIG.entryHourUtcEndExclusive
  ) {
    return "ENTRY_OUTSIDE_SESSION";
  }

  return null;
}

function indexCandidates(candidates, from, to) {
  const map = new Map();

  for (const candidate of candidates) {
    if (
      candidate.entryTime < from ||
      candidate.entryTime >= to ||
      candidate.signalTime < from
    ) {
      continue;
    }

    if (!map.has(candidate.entryTime)) {
      map.set(candidate.entryTime, []);
    }
    map.get(candidate.entryTime).push(candidate);
  }

  for (const rows of map.values()) {
    rows.sort(
      (a, b) =>
        a.signalTime - b.signalTime ||
        a.side.localeCompare(b.side)
    );
  }

  return map;
}

function simulateVariant({
  variant,
  from,
  to,
  costs,
  startingBalance = STARTING_BALANCE
}) {
  const candidates = setups[variant].candidates;
  const byEntryTime = indexCandidates(candidates, from, to);
  const candles = pair.candles.filter(
    c => c.time >= from && c.time < to
  );

  let equity = startingBalance;
  let position = null;
  const trades = [];
  const curve = [{ time: from, equity }];
  const skips = {};

  let currentDay = null;
  let currentWeek = null;
  let dayStart = equity;
  let weekStart = equity;
  let dayPnl = 0;
  let weekPnl = 0;
  let losing = 0;
  let dailyEntries = 0;
  let lastExit = null;

  const skip = reason => {
    skips[reason] = (skips[reason] || 0) + 1;
  };

  const close = (p, price, time, reason) => {
    const move =
      (p.side === "BUY"
        ? price - p.entryPrice
        : p.entryPrice - price) - p.costPrice;
    const conversion =
      pair.metadata.quotingCurrency === "USD"
        ? 1
        : 1 / price;
    const pnl = move * p.units * conversion;
    const trade = {
      ...p,
      exitPrice: price,
      exitTime: time,
      pnl,
      rMultiple: pnl / p.riskAmount,
      reason
    };

    trades.push(trade);
    equity += pnl;
    dayPnl += pnl;
    weekPnl += pnl;
    losing = pnl < 0 ? losing + 1 : 0;
    lastExit = time;
    curve.push({ time, equity });
    position = null;
  };

  for (const candle of candles) {
    const time = candle.time;
    const day = dayKey(time);
    const week = weekKey(time);

    if (day !== currentDay) {
      currentDay = day;
      dayStart = equity;
      dayPnl = 0;
      losing = 0;
      dailyEntries = 0;
    }

    if (week !== currentWeek) {
      currentWeek = week;
      weekStart = equity;
      weekPnl = 0;
    }

    if (position) {
      const buy = position.side === "BUY";
      const gapStop = buy
        ? candle.open <= position.stopLoss
        : candle.open >= position.stopLoss;

      if (gapStop) {
        close(position, candle.open, time, "GAP_STOP");
      }
    }

    if (position) {
      const exitSignal = channel.exits[time - M15];
      if (
        exitSignal &&
        (position.side === "BUY"
          ? exitSignal.exitLong
          : exitSignal.exitShort)
      ) {
        close(
          position,
          candle.open,
          time,
          "OPPOSITE_10H_CHANNEL"
        );
      }
    }

    const pending = byEntryTime.get(time) || [];

    for (const candidate of pending) {
      if (position) {
        skip("PORTFOLIO_CAPACITY");
        continue;
      }

      const sessionReason = sessionBlock(time);
      if (sessionReason) {
        skip(sessionReason);
        continue;
      }

      const bosClose = candidate.signalTime + M15;
      if (overlapsBlackout(bosClose, time)) {
        skip("NEWS_BLOCK");
        continue;
      }

      if (dailyEntries >= CONFIG.maxEntriesPerUtcDay) {
        skip("DAILY_TRADE_LIMIT");
        continue;
      }

      if (
        dayPnl <= -dayStart * 0.02 ||
        weekPnl <= -weekStart * 0.05 ||
        losing >= 2 ||
        equity <= 0
      ) {
        skip("LOSS_GUARD");
        continue;
      }

      if (
        lastExit != null &&
        time - lastExit <= 4 * M15
      ) {
        skip("POST_TRADE_COOLDOWN");
        continue;
      }

      if (!(candidate.atr > 0)) {
        skip("INVALID_ATR");
        continue;
      }

      const buy = candidate.side === "BUY";
      const entryPrice = candle.open;
      const stopLoss =
        entryPrice +
        (buy ? -1 : 1) *
          CONFIG.atrStopMultiple *
          candidate.atr;
      const stopPips =
        Math.abs(entryPrice - stopLoss) /
        pair.metadata.pipSize;

      if (!(stopPips > 0)) {
        skip("INVALID_STOP");
        continue;
      }

      if (
        costs.spreadPips > CONFIG.maxSpreadPips ||
        costs.spreadPips / stopPips >
          CONFIG.maxSpreadAsStopFraction + 1e-12
      ) {
        skip("SPREAD_BLOCK");
        continue;
      }

      const costPrice =
        (costs.spreadPips +
          2 * costs.slippagePips) *
        pair.metadata.pipSize;

      const sized = sizePosition({
        entry: entryPrice,
        stop: stopLoss,
        metadata: pair.metadata,
        equity,
        percent: CONFIG.riskPercent,
        committedRisk: 0,
        costPrice,
        maxPositions: CONFIG.maxPositions
      });

      if (sized.skip) {
        skip(sized.skip);
        continue;
      }

      assert.ok(
        sized.lots <= CONFIG.maxLots + 1e-12,
        "LOT_CAP_BREACH"
      );

      position = {
        ...candidate,
        symbol: SYMBOL,
        entryTime: time,
        entryPrice,
        stopLoss,
        takeProfit: null,
        stopPips,
        costPrice,
        riskPolicyPercent: CONFIG.riskPercent,
        ...sized
      };

      dailyEntries++;
      break;
    }

    if (position) {
      const buy = position.side === "BUY";
      const stopHit = buy
        ? candle.low <= position.stopLoss
        : candle.high >= position.stopLoss;

      if (stopHit) {
        close(
          position,
          position.stopLoss,
          time + M15 - 1,
          "STOP_LOSS"
        );
      }
    }
  }

  if (position) {
    const last = candles.at(-1);
    if (last) {
      close(
        position,
        last.close,
        last.time + M15 - 1,
        "END_OF_WINDOW"
      );
    }
  }

  return {
    variant,
    from,
    to,
    costs,
    metrics: summarize(
      trades,
      startingBalance,
      skips,
      curve
    ),
    trades,
    equityCurve: curve
  };
}

function windowSummary(validation) {
  return schedule.map(window => {
    const prior = validation.trades.filter(
      t => t.exitTime < window.from
    );
    const startingBalance =
      STARTING_BALANCE + sum(prior, t => t.pnl);
    const rows = validation.trades.filter(
      t =>
        t.exitTime >= window.from &&
        t.exitTime < window.to
    );

    return {
      from: window.from,
      to: window.to,
      ...summarize(rows, startingBalance)
    };
  });
}

function eligibility(validation, stress, windows) {
  const reasons = [];
  const m = validation.metrics;

  if (m.tradeCount < 20) {
    reasons.push("FEWER_THAN_20_VALIDATION_TRADES");
  }

  if (
    m.expectancyR <= 0 ||
    !(m.profitFactor > 1.1)
  ) {
    reasons.push("WEAK_EXPECTANCY_OR_PF");
  }

  if (m.maxDrawdownPercent > 10) {
    reasons.push("DRAWDOWN_ABOVE_10_PERCENT");
  }

  if (
    stress.metrics.expectancyR <= 0 ||
    stress.metrics.tradeCount < 15
  ) {
    reasons.push("STRESS_FRAGILE");
  }

  if (
    windows.filter(window => window.totalR > 0).length < 2
  ) {
    reasons.push("INCONSISTENT_WINDOWS");
  }

  return reasons;
}

function eventCounts() {
  return structure.events.reduce((acc, event) => {
    acc[event.type] = (acc[event.type] || 0) + 1;
    return acc;
  }, {});
}

function liveFeasibility(variant) {
  const candidates = setups[variant].candidates.filter(
    candidate =>
      candidate.entryTime >= validationFrom &&
      candidate.entryTime < prepared.to &&
      candidate.signalTime >= validationFrom
  );

  const rows = [];

  for (const candidate of candidates) {
    const candle = m15ByTime.get(candidate.entryTime);
    if (!candle || !(candidate.atr > 0)) continue;

    const buy = candidate.side === "BUY";
    const entry = candle.open;
    const stop =
      entry +
      (buy ? -1 : 1) *
        CONFIG.atrStopMultiple *
        candidate.atr;
    const costPrice =
      (COSTS.BASE.spreadPips +
        2 * COSTS.BASE.slippagePips) *
      pair.metadata.pipSize;
    const distance = Math.abs(entry - stop);

    const conversion = price =>
      pair.metadata.quotingCurrency === "USD"
        ? 1
        : pair.metadata.baseCurrency === "USD"
          ? 1 / price
          : NaN;

    const perLotRisk =
      (distance + costPrice) *
      pair.metadata.lotSize *
      Math.max(conversion(entry), conversion(stop));
    const riskAmount =
      pair.metadata.minLot * perLotRisk;
    const riskPercentAt12 =
      (riskAmount / 12) * 100;

    rows.push({
      signalTime: candidate.signalTime,
      entryTime: candidate.entryTime,
      side: candidate.side,
      stopPips:
        distance / pair.metadata.pipSize,
      modeledRiskAmountAtMinLot: riskAmount,
      modeledRiskPercentAt12: riskPercentAt12,
      fits27Percent:
        riskPercentAt12 <= 27 + 1e-9
    });
  }

  return {
    candidates: rows.length,
    fits27: rows.filter(x => x.fits27Percent).length,
    fitPercent: rows.length
      ? (rows.filter(x => x.fits27Percent).length /
          rows.length) *
        100
      : 0,
    averageRiskPercentAt12: rows.length
      ? sum(rows, x => x.modeledRiskPercentAt12) /
        rows.length
      : null,
    maxRiskPercentAt12: rows.length
      ? max(rows.map(x => x.modeledRiskPercentAt12))
      : null,
    rows
  };
}

function verify(result) {
  let balance = STARTING_BALANCE;
  const daily = {};

  for (const trade of result.trades) {
    assert.ok(
      trade.entryTime > trade.signalTime,
      "ENTRY_MUST_FOLLOW_SIGNAL"
    );

    if (trade.variant === "STRUCTURE_A") {
      assert.equal(
        trade.entryTime,
        trade.signalTime + M15,
        "STRUCTURE_A_NOT_NEXT_M15_OPEN"
      );
    } else {
      assert.ok(
        trade.entryTime >= trade.signalTime + 2 * M15 &&
          trade.entryTime <=
            trade.signalTime +
              (CONFIG.maxRetestBars + 1) * M15,
        "RETEST_ENTRY_OUTSIDE_FROZEN_WINDOW"
      );
    }

    assert.equal(
      trade.riskPolicyPercent,
      CONFIG.riskPercent
    );
    assert.equal(trade.lots, 0.01);
    assert.ok(
      trade.riskAmount <=
        balance * (CONFIG.riskPercent / 100) + 1e-8,
      "RISK_BUDGET_BREACH"
    );

    const day = dayKey(trade.entryTime);
    daily[day] = (daily[day] || 0) + 1;
    assert.ok(
      daily[day] <= CONFIG.maxEntriesPerUtcDay,
      "DAILY_ENTRY_LIMIT_BREACH"
    );

    balance += trade.pnl;
  }

  assert.ok(
    Math.abs(balance - result.metrics.endingBalance) <
      1e-7,
    "ENDING_BALANCE_MISMATCH"
  );
}

const results = {};

for (const variant of VARIANTS) {
  const descriptive = simulateVariant({
    variant,
    from: prepared.from,
    to: prepared.to,
    costs: COSTS.BASE
  });
  const validation = simulateVariant({
    variant,
    from: validationFrom,
    to: prepared.to,
    costs: COSTS.BASE
  });
  const stress = simulateVariant({
    variant,
    from: validationFrom,
    to: prepared.to,
    costs: COSTS.STRESS
  });
  const windows = windowSummary(validation);

  for (const result of [
    descriptive,
    validation,
    stress
  ]) {
    verify(result);
  }

  const rejectionReasons = eligibility(
    validation,
    stress,
    windows
  );

  results[variant] = {
    variant,
    setupDiagnostics: setups[variant].diagnostics,
    descriptive,
    validation,
    stress,
    windows,
    eligible: rejectionReasons.length === 0,
    rejectionReasons,
    live12Risk27Feasibility:
      liveFeasibility(variant)
  };
}

let baseline = null;
if (baselinePath) {
  try {
    const raw = JSON.parse(
      await fs.readFile(baselinePath, "utf8")
    );
    baseline = {
      experiment: raw.experiment,
      validation: raw.validation?.metrics || null,
      stress: raw.stress?.metrics || null,
      rejectionReasons: raw.rejectionReasons || []
    };
  } catch {
    baseline = null;
  }
}

const output = {
  experiment: CONFIG.id,
  recordedProtocol:
    "docs/MARKET_STRUCTURE_V1_PROTOCOL.md",
  inputHash: prepared.inputHash,
  validationFrom,
  fullFrom: prepared.from,
  fullTo: prepared.to,
  config: CONFIG,
  structureDiagnostics: {
    h1Bars: structure.bars.length,
    events: eventCounts(),
    confirmedPivots: {
      highs: structure.snapshots.reduce(
        (n, x) =>
          n +
          x.confirmedPivots.filter(
            p => p.kind === "HIGH"
          ).length,
        0
      ),
      lows: structure.snapshots.reduce(
        (n, x) =>
          n +
          x.confirmedPivots.filter(
            p => p.kind === "LOW"
          ).length,
        0
      )
    }
  },
  baselinePriceBreakoutV1: baseline,
  results,
  safety: {
    offlineOnly: true,
    productionModified: false,
    liveExecution: false
  }
};

await fs.mkdir(out, { recursive: true });
await fs.writeFile(
  path.join(out, "results.json"),
  JSON.stringify(output, null, 2)
);

const summaryRows = [
  [
    "variant",
    "eligible",
    "trades",
    "endingBalance",
    "returnPercent",
    "profitFactor",
    "expectancyR",
    "maxDrawdownPercent",
    "stressTrades",
    "stressProfitFactor",
    "stressExpectancyR",
    "positiveWindows",
    "rawCandidates",
    "live12Candidates",
    "live12Fits27",
    "live12FitPercent",
    "rejectionReasons"
  ]
];

for (const variant of VARIANTS) {
  const row = results[variant];
  summaryRows.push([
    variant,
    row.eligible,
    row.validation.metrics.tradeCount,
    row.validation.metrics.endingBalance,
    row.validation.metrics.returnPercent,
    row.validation.metrics.profitFactor ?? "",
    row.validation.metrics.expectancyR,
    row.validation.metrics.maxDrawdownPercent,
    row.stress.metrics.tradeCount,
    row.stress.metrics.profitFactor ?? "",
    row.stress.metrics.expectancyR,
    row.windows.filter(x => x.totalR > 0).length,
    row.setupDiagnostics.rawCandidates,
    row.live12Risk27Feasibility.candidates,
    row.live12Risk27Feasibility.fits27,
    row.live12Risk27Feasibility.fitPercent,
    row.rejectionReasons.join("|")
  ]);
}

await fs.writeFile(
  path.join(out, "summary.csv"),
  summaryRows.map(row => row.join(",")).join("\n") +
    "\n"
);

console.log(
  JSON.stringify({
    stage: "complete",
    experiment: CONFIG.id,
    inputHash: prepared.inputHash,
    structureDiagnostics: output.structureDiagnostics,
    baseline,
    variants: Object.fromEntries(
      VARIANTS.map(variant => [
        variant,
        {
          eligible: results[variant].eligible,
          rejectionReasons:
            results[variant].rejectionReasons,
          setupDiagnostics:
            results[variant].setupDiagnostics,
          validation:
            results[variant].validation.metrics,
          stress: results[variant].stress.metrics,
          positiveWindows:
            results[variant].windows.filter(
              x => x.totalR > 0
            ).length,
          live12Risk27Feasibility: {
            candidates:
              results[variant]
                .live12Risk27Feasibility.candidates,
            fits27:
              results[variant]
                .live12Risk27Feasibility.fits27,
            fitPercent:
              results[variant]
                .live12Risk27Feasibility.fitPercent,
            averageRiskPercentAt12:
              results[variant]
                .live12Risk27Feasibility
                .averageRiskPercentAt12,
            maxRiskPercentAt12:
              results[variant]
                .live12Risk27Feasibility
                .maxRiskPercentAt12
          }
        }
      ])
    ),
    out
  })
);
