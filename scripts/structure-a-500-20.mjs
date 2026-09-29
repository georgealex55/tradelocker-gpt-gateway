// Offline Structure A capital/risk replay. No broker, DB, credential, or order imports.
import fs from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import { validateDataset } from "../lib/research/prepare.mjs";
import { summarize } from "../lib/research/engine.mjs";
import { COSTS, M15 } from "../lib/research/policies.mjs";
import { buildMarketStructure } from "../lib/research/marketStructure.mjs";

const STARTING_BALANCE = 500;
const TARGET_RISK_PERCENT = 20;
const VALIDATED_INPUT_HASH =
  "61e9d2fae987acf428cb8034e04514d7f84ad01e9e1a2f03d606de09ea740c14";
const SYMBOL = "USDCHF";

const CONFIG = Object.freeze({
  id: "structure-a-500-20",
  startingBalance: STARTING_BALANCE,
  targetRiskPercent: TARGET_RISK_PERCENT,
  pivotLeft: 2,
  pivotRight: 2,
  atrBars: 14,
  atrStopMultiple: 2,
  channelEntryBars: 20,
  channelExitBars: 10,
  maxEntriesPerUtcDay: 2,
  entryHourUtcStart: 7,
  entryHourUtcEndExclusive: 16,
  maxSpreadPips: 3,
  maxSpreadAsStopFraction: 0.2
});

const MODES = Object.freeze([
  { id: "TRUE_20_PERCENT", maxLots: null },
  { id: "CAPPED_0_01", maxLots: 0.01 }
]);

const source = process.argv[2] || "research-output";
const out = process.argv[3] || "research-output/structure-a-500-20";

const dataset = JSON.parse(
  await fs.readFile(path.join(source, "dataset.rechecked.json"), "utf8")
);

const prepared = validateDataset(dataset);
assert.equal(prepared.inputHash, VALIDATED_INPUT_HASH, "FROZEN_DATASET_HASH_MISMATCH");

const validationFrom =
  Math.ceil((prepared.from + (prepared.to - prepared.from) / 2) / M15) * M15;

assert.equal(
  validationFrom,
  Date.parse("2025-05-14T10:30:00.000Z"),
  "VALIDATION_BOUNDARY_DRIFT"
);

const validationWidth = (prepared.to - validationFrom) / 3;
const windows = Array.from({ length: 3 }, (_, i) => ({
  from: Math.ceil((validationFrom + i * validationWidth) / M15) * M15,
  to:
    i === 2
      ? prepared.to
      : Math.ceil((validationFrom + (i + 1) * validationWidth) / M15) * M15
}));

const pair = prepared.pairs[SYMBOL];
const structure = buildMarketStructure(pair.candles, {
  pivotLeft: CONFIG.pivotLeft,
  pivotRight: CONFIG.pivotRight,
  atrBars: CONFIG.atrBars
});
const bars = structure.bars;
const h1BySignalTime = new Map(
  structure.snapshots.map(snapshot => [snapshot.signalTime, snapshot])
);

function max(values) {
  return Math.max(...values);
}

function min(values) {
  return Math.min(...values);
}

function sum(rows, fn) {
  return rows.reduce((n, row) => n + fn(row), 0);
}

function dayKey(time) {
  return new Date(time).toISOString().slice(0, 10);
}

function weekKey(time) {
  const d = new Date(time);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return dayKey(+d);
}

function channelTapes() {
  const entries = {};
  const exits = {};

  for (let i = 0; i < bars.length; i++) {
    const bar = bars[i];

    if (i >= CONFIG.channelExitBars) {
      const prior = bars.slice(i - CONFIG.channelExitBars, i);
      const high = max(prior.map(x => x.high));
      const low = min(prior.map(x => x.low));

      exits[bar.lastM15Time] = {
        exitLong: bar.close < low,
        exitShort: bar.close > high,
        h1Time: bar.time,
        high,
        low,
        close: bar.close
      };
    }

    if (i < CONFIG.channelEntryBars) continue;

    const prior = bars.slice(i - CONFIG.channelEntryBars, i);
    const high = max(prior.map(x => x.high));
    const low = min(prior.map(x => x.low));

    let action = null;
    let trigger = null;

    if (bar.close > high) {
      action = "BUY";
      trigger = high;
    } else if (bar.close < low) {
      action = "SELL";
      trigger = low;
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

function structureACandidates() {
  const candidates = [];
  let channelBreakouts = 0;
  let sameBarBosMatches = 0;

  for (const [signalTimeRaw, breakout] of Object.entries(channel.entries)) {
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
      structureEvent: snapshot.event.type
    });
  }

  candidates.sort((a, b) => a.entryTime - b.entryTime || a.signalTime - b.signalTime);

  return {
    candidates,
    diagnostics: {
      channelBreakouts,
      sameBarBosMatches,
      rawCandidates: candidates.length
    }
  };
}

const setup = structureACandidates();

function overlapsBlackout(from, to) {
  const currencies = [SYMBOL.slice(0, 3), SYMBOL.slice(3)];

  for (const blackout of prepared.blackouts || []) {
    if (
      Array.isArray(blackout.currencies) &&
      blackout.currencies.length &&
      !blackout.currencies.some(currency => currencies.includes(currency))
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

  if ([0, 6].includes(d.getUTCDay())) return "ENTRY_OUTSIDE_SESSION";
  if (
    hour < CONFIG.entryHourUtcStart ||
    hour >= CONFIG.entryHourUtcEndExclusive
  ) {
    return "ENTRY_OUTSIDE_SESSION";
  }

  return null;
}

function indexCandidates(from, to) {
  const map = new Map();

  for (const candidate of setup.candidates) {
    if (
      candidate.entryTime < from ||
      candidate.entryTime >= to ||
      candidate.signalTime < from
    ) {
      continue;
    }

    if (!map.has(candidate.entryTime)) map.set(candidate.entryTime, []);
    map.get(candidate.entryTime).push(candidate);
  }

  return map;
}

function conversionAt(price) {
  const m = pair.metadata;
  if (m.quotingCurrency === "USD") return 1;
  if (m.baseCurrency === "USD") return 1 / price;
  return NaN;
}

function sizeForTargetRisk({
  entry,
  stop,
  equity,
  costPrice,
  mode
}) {
  const m = pair.metadata;
  const distance = Math.abs(entry - stop);
  const perLotRisk =
    (distance + costPrice) *
    m.lotSize *
    Math.max(conversionAt(entry), conversionAt(stop));

  const targetRiskAmount = equity * TARGET_RISK_PERCENT / 100;
  const lotCap = Math.min(
    mode.maxLots == null ? m.maxLot : mode.maxLots,
    m.maxLot
  );

  if (!(perLotRisk > 0) || !(targetRiskAmount > 0) || !(lotCap > 0)) {
    return { skip: "INVALID_SIZING_INPUT" };
  }

  const rawLots = Math.min(targetRiskAmount / perLotRisk, lotCap);
  const lots =
    Math.floor((rawLots + 1e-12) / m.lotStep) * m.lotStep;

  if (lots + 1e-12 < m.minLot) {
    return { skip: "MIN_LOT_RISK_SKIP" };
  }

  const riskAmount = lots * perLotRisk;
  const plannedRiskPercent = equity > 0 ? riskAmount / equity * 100 : null;

  assert.ok(riskAmount <= targetRiskAmount + 1e-8, "SIZING_EXCEEDS_20_PERCENT_BUDGET");

  return {
    lots,
    units: lots * m.lotSize,
    riskAmount,
    targetRiskAmount,
    plannedRiskPercent,
    lotCap,
    perLotRisk
  };
}

function simulate({
  mode,
  from,
  to,
  costs,
  startingBalance = STARTING_BALANCE
}) {
  const candidatesByEntry = indexCandidates(from, to);
  const candles = pair.candles.filter(c => c.time >= from && c.time < to);

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
      (p.side === "BUY" ? price - p.entryPrice : p.entryPrice - price) -
      p.costPrice;
    const conversion = pair.metadata.quotingCurrency === "USD" ? 1 : 1 / price;
    const pnl = move * p.units * conversion;
    const realizedPercentOfEntryEquity =
      p.entryEquity > 0 ? pnl / p.entryEquity * 100 : null;
    const exceededPlannedRisk =
      pnl < 0 && -pnl > p.riskAmount + 1e-8;

    const trade = {
      ...p,
      exitPrice: price,
      exitTime: time,
      pnl,
      rMultiple: pnl / p.riskAmount,
      reason,
      realizedPercentOfEntryEquity,
      exceededPlannedRisk
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
        (position.side === "BUY" ? exitSignal.exitLong : exitSignal.exitShort)
      ) {
        close(position, candle.open, time, "OPPOSITE_10H_CHANNEL");
      }
    }

    const pending = candidatesByEntry.get(time) || [];

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

      if (overlapsBlackout(candidate.signalTime + M15, time)) {
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

      if (lastExit != null && time - lastExit <= 4 * M15) {
        skip("POST_TRADE_COOLDOWN");
        continue;
      }

      const buy = candidate.side === "BUY";
      const entryPrice = candle.open;
      const stopLoss =
        entryPrice +
        (buy ? -1 : 1) * CONFIG.atrStopMultiple * candidate.atr;
      const stopPips =
        Math.abs(entryPrice - stopLoss) / pair.metadata.pipSize;

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
        (costs.spreadPips + 2 * costs.slippagePips) *
        pair.metadata.pipSize;

      const sized = sizeForTargetRisk({
        entry: entryPrice,
        stop: stopLoss,
        equity,
        costPrice,
        mode
      });

      if (sized.skip) {
        skip(sized.skip);
        continue;
      }

      position = {
        ...candidate,
        mode: mode.id,
        symbol: SYMBOL,
        entryTime: time,
        entryPrice,
        entryEquity: equity,
        stopLoss,
        takeProfit: null,
        stopPips,
        costPrice,
        targetRiskPercent: TARGET_RISK_PERCENT,
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
        close(position, position.stopLoss, time + M15 - 1, "STOP_LOSS");
      }
    }
  }

  if (position) {
    const last = candles.at(-1);
    if (last) {
      close(position, last.close, last.time + M15 - 1, "END_OF_WINDOW");
    }
  }

  const metrics = summarize(trades, startingBalance, skips, curve);
  const lots = trades.map(t => t.lots);
  const plannedRisks = trades.map(t => t.plannedRiskPercent);
  const realizedLossPercents = trades
    .filter(t => t.pnl < 0)
    .map(t => -t.realizedPercentOfEntryEquity);
  const equityValues = curve.map(x => x.equity);

  return {
    mode: mode.id,
    from,
    to,
    costs,
    metrics,
    trades,
    equityCurve: curve,
    sizingDiagnostics: {
      minLots: lots.length ? min(lots) : null,
      averageLots: lots.length ? sum(lots, x => x) / lots.length : null,
      maxLots: lots.length ? max(lots) : null,
      averagePlannedRiskPercent: plannedRisks.length
        ? sum(plannedRisks, x => x) / plannedRisks.length
        : null,
      maxPlannedRiskPercent: plannedRisks.length
        ? max(plannedRisks)
        : null,
      largestRealizedLossPercent: realizedLossPercents.length
        ? max(realizedLossPercents)
        : null,
      gapLossesExceedingPlannedRisk: trades.filter(
        t => t.reason === "GAP_STOP" && t.exceededPlannedRisk
      ).length,
      minimumEquity: equityValues.length ? min(equityValues) : startingBalance,
      equityAtOrBelowZero: equityValues.some(x => x <= 0)
    }
  };
}

function summarizeWindows(validation) {
  return windows.map(window => {
    const prior = validation.trades.filter(t => t.exitTime < window.from);
    const start =
      STARTING_BALANCE + sum(prior, t => t.pnl);
    const rows = validation.trades.filter(
      t => t.exitTime >= window.from && t.exitTime < window.to
    );

    return {
      from: window.from,
      to: window.to,
      ...summarize(rows, start)
    };
  });
}

function verify(result, mode) {
  let equity = STARTING_BALANCE;

  for (const trade of result.trades) {
    assert.equal(trade.entryTime, trade.signalTime + M15, "NOT_NEXT_M15_ENTRY");
    assert.ok(trade.entryEquity > 0, "NON_POSITIVE_ENTRY_EQUITY");
    assert.ok(
      Math.abs(trade.entryEquity - equity) < 1e-7,
      "ENTRY_EQUITY_DRIFT"
    );
    assert.ok(
      trade.riskAmount <= trade.entryEquity * TARGET_RISK_PERCENT / 100 + 1e-8,
      "PLANNED_RISK_EXCEEDS_20_PERCENT"
    );
    assert.ok(
      trade.plannedRiskPercent <= TARGET_RISK_PERCENT + 1e-8,
      "PLANNED_RISK_PERCENT_EXCEEDS_TARGET"
    );

    if (mode.maxLots != null) {
      assert.ok(trade.lots <= mode.maxLots + 1e-12, "LOT_CAP_BREACH");
    }

    equity += trade.pnl;
  }

  assert.ok(
    Math.abs(equity - result.metrics.endingBalance) < 1e-7,
    "ENDING_BALANCE_MISMATCH"
  );
}

const results = {};

for (const mode of MODES) {
  const descriptive = simulate({
    mode,
    from: prepared.from,
    to: prepared.to,
    costs: COSTS.BASE
  });

  const validation = simulate({
    mode,
    from: validationFrom,
    to: prepared.to,
    costs: COSTS.BASE
  });

  const stress = simulate({
    mode,
    from: validationFrom,
    to: prepared.to,
    costs: COSTS.STRESS
  });

  verify(validation, mode);
  verify(stress, mode);

  results[mode.id] = {
    mode: mode.id,
    lotCap: mode.maxLots,
    descriptive,
    validation,
    stress,
    windows: summarizeWindows(validation)
  };
}

const output = {
  experiment: CONFIG.id,
  protocol: "docs/STRUCTURE_A_500_20_PROTOCOL.md",
  inputHash: prepared.inputHash,
  validationFrom,
  fullFrom: prepared.from,
  fullTo: prepared.to,
  config: CONFIG,
  setupDiagnostics: setup.diagnostics,
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

const csv = [[
  "mode",
  "costs",
  "trades",
  "endingBalance",
  "returnPercent",
  "profitFactor",
  "expectancyR",
  "maxDrawdownPercent",
  "wins",
  "losses",
  "winRate",
  "minLots",
  "averageLots",
  "maxLots",
  "averagePlannedRiskPercent",
  "maxPlannedRiskPercent",
  "largestRealizedLossPercent",
  "gapLossesExceedingPlannedRisk",
  "minimumEquity",
  "equityAtOrBelowZero",
  "positiveWindows"
]];

for (const mode of MODES) {
  const row = results[mode.id];

  for (const [costName, result] of [
    ["BASE", row.validation],
    ["STRESS", row.stress]
  ]) {
    csv.push([
      mode.id,
      costName,
      result.metrics.tradeCount,
      result.metrics.endingBalance,
      result.metrics.returnPercent,
      result.metrics.profitFactor ?? "",
      result.metrics.expectancyR,
      result.metrics.maxDrawdownPercent,
      result.metrics.wins,
      result.metrics.losses,
      result.metrics.winRate,
      result.sizingDiagnostics.minLots ?? "",
      result.sizingDiagnostics.averageLots ?? "",
      result.sizingDiagnostics.maxLots ?? "",
      result.sizingDiagnostics.averagePlannedRiskPercent ?? "",
      result.sizingDiagnostics.maxPlannedRiskPercent ?? "",
      result.sizingDiagnostics.largestRealizedLossPercent ?? "",
      result.sizingDiagnostics.gapLossesExceedingPlannedRisk,
      result.sizingDiagnostics.minimumEquity,
      result.sizingDiagnostics.equityAtOrBelowZero,
      costName === "BASE"
        ? row.windows.filter(x => x.totalR > 0).length
        : ""
    ]);
  }
}

await fs.writeFile(
  path.join(out, "summary.csv"),
  csv.map(row => row.join(",")).join("\n") + "\n"
);

console.log(JSON.stringify({
  stage: "complete",
  experiment: CONFIG.id,
  inputHash: prepared.inputHash,
  setupDiagnostics: setup.diagnostics,
  results: Object.fromEntries(
    MODES.map(mode => {
      const row = results[mode.id];
      return [
        mode.id,
        {
          validation: row.validation.metrics,
          validationSizing: row.validation.sizingDiagnostics,
          stress: row.stress.metrics,
          stressSizing: row.stress.sizingDiagnostics,
          positiveWindows: row.windows.filter(x => x.totalR > 0).length
        }
      ];
    })
  ),
  out
}));
