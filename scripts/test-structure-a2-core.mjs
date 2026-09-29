import assert from "node:assert/strict";
import {
  buildStructureTimeline,
  evaluateStructureA2
} from "../lib/structureA2Core.mjs";

const H1 = 60 * 60 * 1000;
const M15 = 15 * 60 * 1000;
const start = Date.parse("2026-01-05T00:00:00Z");

function bar(i, open, high, low, close) {
  return {
    time: start + i * H1,
    lastM15Time: start + i * H1 + 3 * M15,
    open,
    high,
    low,
    close
  };
}

function bearishFixture(finalClose = 1.06) {
  const bars = Array.from({ length: 25 }, (_, i) =>
    bar(i, 1.4, 1.5, 1.3, 1.4)
  );

  bars[3] = bar(3, 1.45, 1.55, 1.30, 1.42);
  bars[4] = bar(4, 1.48, 1.60, 1.32, 1.44);

  // First confirmed swing high.
  bars[5] = bar(5, 1.55, 1.80, 1.35, 1.50);
  bars[6] = bar(6, 1.48, 1.58, 1.28, 1.40);

  // First confirmed swing low.
  bars[7] = bar(7, 1.38, 1.55, 1.20, 1.32);
  bars[8] = bar(8, 1.36, 1.52, 1.27, 1.38);
  bars[9] = bar(9, 1.42, 1.55, 1.30, 1.44);

  // Lower high.
  bars[10] = bar(10, 1.55, 1.70, 1.28, 1.45);
  bars[11] = bar(11, 1.43, 1.56, 1.24, 1.36);

  // Lower low.
  bars[12] = bar(12, 1.34, 1.54, 1.10, 1.30);
  bars[13] = bar(13, 1.36, 1.50, 1.22, 1.34);
  bars[14] = bar(14, 1.38, 1.50, 1.24, 1.35);

  for (let i = 15; i <= 23; i++) {
    bars[i] = bar(i, 1.38, 1.50, 1.20, 1.32);
  }

  // Same-bar 20H channel break + bearish BOS + strong displacement.
  bars[24] = bar(24, 1.17, 1.18, 1.05, finalClose);
  return bars;
}

{
  const bars = bearishFixture();
  const beforeConfirmation = buildStructureTimeline(bars.slice(0, 14));
  const afterConfirmation = buildStructureTimeline(bars.slice(0, 15));

  assert.notEqual(
    beforeConfirmation.at(-1)?.latestLow?.label,
    "LL",
    "LL must not exist before its two right-side bars close"
  );
  assert.equal(afterConfirmation.at(-1)?.latestLow?.label, "LL");
  assert.equal(afterConfirmation.at(-1)?.latestHigh?.label, "LH");
  assert.equal(afterConfirmation.at(-1)?.trend, "BEARISH");
}

{
  const setup = evaluateStructureA2(bearishFixture(), {
    entryChannelBars: 20,
    exitChannelBars: 10,
    atrBars: 14,
    pivotLeft: 2,
    pivotRight: 2,
    closeLocationMin: 0.75,
    bodyFractionMin: 0.5,
    displacementAtrMin: 0.1
  });

  assert.equal(setup.channelBreakSide, "SELL");
  assert.equal(setup.structureEvent?.type, "BOS_BEARISH");
  assert.equal(setup.trend, "BEARISH");
  assert.equal(setup.side, "SELL");
  assert.equal(setup.quality.closeLocationPass, true);
  assert.equal(setup.quality.bodyFractionPass, true);
  assert.equal(setup.quality.displacementPass, true);
}

{
  const weak = bearishFixture(1.095);
  weak[24] = bar(24, 1.11, 1.12, 1.09, 1.095);

  const setup = evaluateStructureA2(weak, {
    entryChannelBars: 20,
    exitChannelBars: 10,
    atrBars: 14,
    pivotLeft: 2,
    pivotRight: 2,
    closeLocationMin: 0.75,
    bodyFractionMin: 0.5,
    displacementAtrMin: 0.1
  });

  assert.equal(setup.channelBreakSide, "SELL");
  assert.equal(setup.structureEvent?.type, "BOS_BEARISH");
  assert.equal(setup.quality.displacementPass, false);
  assert.equal(setup.side, null);
}

console.log("Structure A2 core regression tests passed.");
