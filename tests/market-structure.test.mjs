import test from "node:test";
import assert from "node:assert/strict";
import {
  buildMarketStructureFromH1,
  findRetestEntry,
  armChochBosSequences
} from "../lib/research/marketStructure.mjs";

const H1 = 60 * 60 * 1000;
const M15 = 15 * 60 * 1000;
const start = Date.parse("2025-01-06T00:00:00Z");

function bar(i, high, low, close, open = close) {
  return {
    time: start + i * H1,
    lastM15Time: start + i * H1 + 3 * M15,
    open,
    high,
    low,
    close
  };
}

function bullishFixture() {
  return [
    bar(0, 1.10, 0.90, 1.00),
    bar(1, 1.20, 1.00, 1.10),
    bar(2, 1.50, 1.10, 1.30), // first swing high
    bar(3, 1.30, 1.00, 1.10),
    bar(4, 1.40, 0.80, 1.20), // first swing low
    bar(5, 1.60, 1.10, 1.40),
    bar(6, 1.80, 1.20, 1.60), // HH
    bar(7, 1.50, 1.10, 1.30),
    bar(8, 1.60, 1.00, 1.40), // HL
    bar(9, 1.70, 1.20, 1.60),
    bar(10, 1.75, 1.30, 1.70), // confirms HL => bullish structure
    bar(11, 1.90, 1.40, 1.85), // closes over HH => bullish BOS
    bar(12, 1.50, 0.90, 0.95)  // closes under HL => bearish CHoCH
  ];
}

test("5-bar pivots are unavailable until two right-side H1 bars close", () => {
  const full = bullishFixture();
  const beforeConfirm = buildMarketStructureFromH1(full.slice(0, 4));
  assert.equal(beforeConfirm.snapshots.at(-1).latestHigh, null);

  const afterConfirm = buildMarketStructureFromH1(full.slice(0, 5));
  assert.equal(afterConfirm.snapshots.at(-1).latestHigh?.time, full[2].time);
  assert.equal(afterConfirm.snapshots.at(-1).latestHigh?.label, "FIRST_HIGH");
});

test("HH + HL establish bullish trend and close-only break produces bullish BOS", () => {
  const result = buildMarketStructureFromH1(bullishFixture().slice(0, 12));
  const last = result.snapshots.at(-1);

  assert.equal(last.trend, "BULLISH");
  assert.equal(last.latestHigh.label, "HH");
  assert.equal(last.latestLow.label, "HL");
  assert.equal(last.event?.type, "BOS_BULLISH");
  assert.equal(last.event?.direction, "BUY");
  assert.equal(last.event?.level, 1.8);
});

test("opposing break from bullish structure is CHoCH, not BOS", () => {
  const result = buildMarketStructureFromH1(bullishFixture());
  const last = result.snapshots.at(-1);

  assert.equal(last.event?.type, "CHOCH_BEARISH");
  assert.equal(last.event?.direction, "SELL");
  assert.equal(last.event?.level, 1.0);
});

test("already-broken pivot cannot emit a second BOS on recross", () => {
  const bars = bullishFixture().slice(0, 12);
  bars.push(bar(12, 1.70, 1.30, 1.70));
  bars.push(bar(13, 1.95, 1.40, 1.90));

  const result = buildMarketStructureFromH1(bars);
  assert.equal(
    result.events.filter(x => x.type === "BOS_BULLISH").length,
    1
  );
});

test("valid M15 retest enters only at following M15 open", () => {
  const signalTime = start + 3 * M15;
  const event = {
    direction: "BUY",
    signalTime,
    level: 1.2
  };
  const candles = [
    { time: signalTime + M15, open: 1.23, high: 1.24, low: 1.19, close: 1.22 },
    { time: signalTime + 2 * M15, open: 1.225, high: 1.23, low: 1.21, close: 1.22 }
  ];

  const retest = findRetestEntry({ candles, event });
  assert.equal(retest.state, "READY");
  assert.equal(retest.retestTime, signalTime + M15);
  assert.equal(retest.entryTime, signalTime + 2 * M15);
  assert.equal(retest.entryPrice, 1.225);
});

test("wrong-side M15 close invalidates retest setup", () => {
  const signalTime = start + 3 * M15;
  const event = {
    direction: "BUY",
    signalTime,
    level: 1.2
  };
  const candles = [
    { time: signalTime + M15, open: 1.21, high: 1.22, low: 1.18, close: 1.19 },
    { time: signalTime + 2 * M15, open: 1.21, high: 1.23, low: 1.19, close: 1.22 }
  ];

  const retest = findRetestEntry({ candles, event });
  assert.equal(retest.state, "INVALIDATED");
});

test("CHoCH arms only the first later same-direction BOS", () => {
  const events = [
    { type: "CHOCH_BULLISH", direction: "BUY", signalTime: 1 },
    { type: "BOS_BEARISH", direction: "SELL", signalTime: 2 },
    { type: "BOS_BULLISH", direction: "BUY", signalTime: 3 },
    { type: "BOS_BULLISH", direction: "BUY", signalTime: 4 },
    { type: "CHOCH_BEARISH", direction: "SELL", signalTime: 5 },
    { type: "BOS_BEARISH", direction: "SELL", signalTime: 6 }
  ];

  const rows = armChochBosSequences(events);
  assert.deepEqual(rows.map(x => x.signalTime), [3, 6]);
});
