import assert from "node:assert/strict";
import { classifyH1Regime } from "../lib/h1Regime.mjs";
import { evaluateSoftRegimePullback } from "../lib/softRegimePullbackCore.mjs";

function row({ ema20, ema50, rsi, macd }) {
  return {
    candle: { open: 1, high: 1, low: 1, close: 1 },
    indicators: {
      values: {
        ema: { 20: ema20, 50: ema50 },
        rsi,
        macd: { histogram: macd }
      }
    }
  };
}

{
  const x = classifyH1Regime({
    ema50: 0.835,
    ema200: 0.830,
    close: 0.836,
    adx: 15,
    pdi: 0.17,
    mdi: 0.20,
    minimumAdx: 20
  });
  assert.equal(x.bias, "SOFT_LONG");
  assert.equal(x.tradeBias, "NONE");
  assert.equal(x.direction, "LONG");
  assert.equal(x.strength, "SOFT");
  assert.equal(x.reason, "LOW_ADX_DIRECTIONAL_STACK");
}

{
  const x = classifyH1Regime({
    ema50: 0.825,
    ema200: 0.830,
    close: 0.824,
    adx: 14,
    pdi: 0.21,
    mdi: 0.18,
    minimumAdx: 20
  });
  assert.equal(x.bias, "SOFT_SHORT");
  assert.equal(x.tradeBias, "NONE");
  assert.equal(x.direction, "SHORT");
}

{
  const x = classifyH1Regime({
    ema50: 0.835,
    ema200: 0.830,
    close: 0.836,
    adx: 24,
    pdi: 0.22,
    mdi: 0.18,
    minimumAdx: 20
  });
  assert.equal(x.bias, "LONG");
  assert.equal(x.tradeBias, "LONG");
  assert.equal(x.strength, "HARD");
}

{
  const x = classifyH1Regime({
    ema50: 0.835,
    ema200: 0.830,
    close: 0.836,
    adx: 24,
    pdi: 0.16,
    mdi: 0.21,
    minimumAdx: 20
  });
  assert.equal(x.bias, "NONE");
  assert.equal(x.tradeBias, "NONE");
  assert.equal(x.direction, "LONG");
  assert.equal(x.strength, "CONFLICT");
}

{
  const setup = evaluateSoftRegimePullback({
    regime: {
      strength: "SOFT",
      direction: "LONG"
    },
    currentCandle: { close: 0.8354 },
    currentIndicators: {
      ema20: 0.8352,
      ema50: 0.8350,
      rsi: 52,
      macdHistogram: 0.00003
    },
    previousMacdHistogram: -0.00001,
    recentRows: [
      row({
        ema20: 0.8348,
        ema50: 0.8350,
        rsi: 47,
        macd: -0.00004
      })
    ]
  });
  assert.equal(setup.eligible, true);
  assert.equal(setup.direction, "LONG");
  assert.equal(setup.countertrendPullback, true);
  assert.equal(setup.recovery.ema20Reclaim, true);
  assert.equal(setup.recovery.rsiMidlineReclaim, true);
  assert.equal(setup.recovery.macdZeroCross, true);
  assert.equal(setup.ready, true);
  assert.equal(setup.stage, "SOFT_REGIME_REVERSAL_READY");
}

{
  const setup = evaluateSoftRegimePullback({
    regime: {
      strength: "SOFT",
      direction: "SHORT"
    },
    currentCandle: { close: 0.8246 },
    currentIndicators: {
      ema20: 0.8248,
      ema50: 0.8250,
      rsi: 48,
      macdHistogram: -0.00003
    },
    previousMacdHistogram: 0.00001,
    recentRows: [
      row({
        ema20: 0.8252,
        ema50: 0.8250,
        rsi: 54,
        macd: 0.00004
      })
    ]
  });
  assert.equal(setup.ready, true);
  assert.equal(setup.direction, "SHORT");
}

{
  const setup = evaluateSoftRegimePullback({
    regime: {
      strength: "HARD",
      direction: "LONG"
    },
    currentCandle: { close: 0.8354 },
    currentIndicators: {
      ema20: 0.8352,
      ema50: 0.8350,
      rsi: 52,
      macdHistogram: 0.00003
    },
    previousMacdHistogram: -0.00001,
    recentRows: []
  });
  assert.equal(setup.eligible, false);
  assert.equal(setup.ready, false);
}

console.log("soft H1 regime tests passed");
