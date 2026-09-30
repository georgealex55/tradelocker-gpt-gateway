import { FOREX_STRATEGY_V1_CONFIG } from "./forexStrategyV1Config";
import { isInsideBlackout, evaluateMarketShock } from "./eventRisk";
import { classifyH1Regime } from "./h1Regime.mjs";
import { evaluateSoftRegimePullback } from "./softRegimePullbackCore.mjs";

function finite(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function inSession(time, config) {
  const date = new Date(Number(time));
  if (!Number.isFinite(date.getTime())) {
    return { ok: false, reason: "INVALID_TIME" };
  }

  const day = date.getUTCDay();
  if (config.session.avoidWeekendEntries && (day === 0 || day === 6)) {
    return { ok: false, reason: "WEEKEND" };
  }

  const hour = date.getUTCHours();
  const ok =
    hour >= config.session.entryStartUtcHour &&
    hour < config.session.entryEndUtcHour;

  return {
    ok,
    reason: ok ? null : "OUTSIDE_SESSION"
  };
}

function regimeBias(higher, config) {
  const values = higher?.indicators?.values || {};

  return classifyH1Regime({
    ema50: values.ema?.[50],
    ema200: values.ema?.[200],
    adx: values.adx,
    pdi: values.adxPlusDi,
    mdi: values.adxMinusDi,
    close: higher?.candle?.close,
    minimumAdx: config.setup.h1MinimumAdx
  });
}

function pullbackLong(recent, config) {
  const lookback = recent.slice(-config.setup.pullbackLookbackBars);

  return lookback.some(row => {
    const atr = finite(row.indicators?.values?.atr);
    const ema20 = finite(row.indicators?.values?.ema?.[20]);
    const ema50 = finite(row.indicators?.values?.ema?.[50]);

    if ([atr, ema20, ema50].some(value => value == null)) return false;

    const zoneTop = Math.max(ema20, ema50);
    const zoneBottom = Math.min(ema20, ema50);
    const tolerance = atr * config.setup.pullbackMaxDistanceAtr;

    const touchedZone =
      row.candle.low <= zoneTop + tolerance &&
      row.candle.high >= zoneBottom - tolerance;

    const preservedStructure = row.candle.close >= ema50;

    return touchedZone && preservedStructure;
  });
}

function pullbackShort(recent, config) {
  const lookback = recent.slice(-config.setup.pullbackLookbackBars);

  return lookback.some(row => {
    const atr = finite(row.indicators?.values?.atr);
    const ema20 = finite(row.indicators?.values?.ema?.[20]);
    const ema50 = finite(row.indicators?.values?.ema?.[50]);

    if ([atr, ema20, ema50].some(value => value == null)) return false;

    const zoneTop = Math.max(ema20, ema50);
    const zoneBottom = Math.min(ema20, ema50);
    const tolerance = atr * config.setup.pullbackMaxDistanceAtr;

    const touchedZone =
      row.candle.high >= zoneBottom - tolerance &&
      row.candle.low <= zoneTop + tolerance;

    const preservedStructure = row.candle.close <= ema50;

    return touchedZone && preservedStructure;
  });
}

function hadRsiReset(recent, side, config) {
  const rows = recent.slice(-config.setup.pullbackLookbackBars);

  return rows.some(row => {
    const rsi = finite(row.indicators?.values?.rsi);
    if (rsi == null) return false;

    if (side === "LONG") {
      return (
        rsi >= config.setup.longRsiResetMin &&
        rsi <= config.setup.longRsiResetMax
      );
    }

    return (
      rsi >= config.setup.shortRsiResetMin &&
      rsi <= config.setup.shortRsiResetMax
    );
  });
}

function swingStop(recentCandles, side, atr, config) {
  const rows = recentCandles.slice(-config.setup.swingStopLookbackBars);
  if (!rows.length || !(atr > 0)) return null;

  if (side === "LONG") {
    const low = Math.min(...rows.map(candle => Number(candle.low)));
    return low - atr * config.setup.stopAtrBuffer;
  }

  const high = Math.max(...rows.map(candle => Number(candle.high)));
  return high + atr * config.setup.stopAtrBuffer;
}

function targetFromReference({
  side,
  referenceEntry,
  stopLoss,
  targetR
}) {
  const risk = Math.abs(referenceEntry - stopLoss);
  if (!(risk > 0)) return null;

  return side === "LONG"
    ? referenceEntry + risk * targetR
    : referenceEntry - risk * targetR;
}

function median(values) {
  const rows = values
    .map(Number)
    .filter(Number.isFinite)
    .sort((a, b) => a - b);

  if (!rows.length) return null;

  const middle = Math.floor(rows.length / 2);
  return rows.length % 2
    ? rows[middle]
    : (rows[middle - 1] + rows[middle]) / 2;
}

export function createForexStrategyV1({
  symbol,
  config = FOREX_STRATEGY_V1_CONFIG,
  scheduledBlackouts = []
} = {}) {
  const history = [];
  let previousMacdHistogram = null;
  let shockCooldownRemaining = 0;

  return function evaluate({
    candle,
    indicators,
    higherTimeframe = null,
    spreadPips = null
  }) {
    const currentRsi = finite(indicators?.values?.rsi);
    const currentAtr = finite(indicators?.values?.atr);
    const ema20 = finite(indicators?.values?.ema?.[20]);
    const ema50 = finite(indicators?.values?.ema?.[50]);
    const macdHistogram = finite(
      indicators?.values?.macd?.histogram
    );

    const resultBase = {
      strategy: config.name,
      version: config.version,
      symbol: String(symbol || "").toUpperCase(),
      time: candle?.time ?? null,
      timeframe: config.timeframes.entry,
      regimeTimeframe: config.timeframes.regime,
      referenceEntry: finite(candle?.close),
      indicators: {
        ema20,
        ema50,
        rsi: currentRsi,
        atr: currentAtr,
        macdHistogram
      }
    };

    const session = inSession(candle?.time, config);
    const fixedBlackout = isInsideBlackout({
      symbol,
      time: candle?.time,
      blackouts: [
        ...config.eventRisk.fixedBlackouts,
        ...scheduledBlackouts
      ]
    });

    const atrMedian = median(
      history
        .slice(-20)
        .map(row => row.indicators?.values?.atr)
    );

    const shock = evaluateMarketShock({
      spreadPips,
      atr: currentAtr,
      medianAtr: atrMedian,
      candleRange:
        finite(candle?.high) != null && finite(candle?.low) != null
          ? Number(candle.high) - Number(candle.low)
          : null,
      maxSpreadPipsAbsolute:
        config.execution.maxSpreadPipsAbsolute,
      spreadShockMultiple:
        config.eventRisk.spreadShockMultiple,
      atrShockMultiple:
        config.eventRisk.atrShockMultiple,
      candleRangeShockMultiple:
        config.eventRisk.candleRangeShockMultiple
    });

    if (shock.blocked) {
      shockCooldownRemaining = Math.max(
        shockCooldownRemaining,
        config.eventRisk.shockCooldownBars
      );
    } else if (shockCooldownRemaining > 0) {
      shockCooldownRemaining -= 1;
    }

    const regime = regimeBias(higherTimeframe, config);

    const priorRows = history.slice(
      -Math.max(
        config.setup.pullbackLookbackBars,
        config.setup.softPullbackLookbackBars ?? 6,
        config.setup.swingStopLookbackBars
      )
    );

    const previous = history.at(-1) || null;

    const softRegimeSetupBase = evaluateSoftRegimePullback({
      regime,
      currentCandle: candle,
      currentIndicators: {
        ema20,
        ema50,
        rsi: currentRsi,
        macdHistogram
      },
      recentRows: priorRows,
      previousMacdHistogram,
      pullbackLookbackBars:
        config.setup.softPullbackLookbackBars ?? 6,
      rsiMidline:
        config.setup.softRsiMidline ?? 50
    });

    let softRegimeStopLoss = null;
    let softRegimeTakeProfit = null;

    if (
      softRegimeSetupBase.ready &&
      currentAtr != null &&
      softRegimeSetupBase.direction
    ) {
      softRegimeStopLoss = swingStop(
        [...priorRows.map(row => row.candle), candle],
        softRegimeSetupBase.direction,
        currentAtr,
        config
      );

      softRegimeTakeProfit =
        softRegimeStopLoss != null
          ? targetFromReference({
              side: softRegimeSetupBase.direction,
              referenceEntry: candle.close,
              stopLoss: softRegimeStopLoss,
              targetR: config.setup.targetR
            })
          : null;
    }

    const softRegimeSetup = {
      ...softRegimeSetupBase,
      stopLoss: softRegimeStopLoss,
      takeProfit: softRegimeTakeProfit,
      targetR: config.setup.targetR
    };

    const commonBlocks = [];

    if (!session.ok) commonBlocks.push(session.reason);
    if (fixedBlackout.blocked) {
      commonBlocks.push(
        fixedBlackout.name || fixedBlackout.reason
      );
    }
    if (shock.blocked) {
      commonBlocks.push(...shock.reasons);
    } else if (shockCooldownRemaining > 0) {
      commonBlocks.push("SHOCK_COOLDOWN");
    }
    if (!regime.ready) commonBlocks.push("H1_NOT_WARM");

    const stable =
      ema20 != null &&
      ema50 != null &&
      currentRsi != null &&
      currentAtr != null &&
      macdHistogram != null;

    if (!stable) commonBlocks.push("M15_NOT_WARM");

    let side = null;
    let checks = {};
    let stopLoss = null;
    let takeProfit = null;

    if (!commonBlocks.length && regime.tradeBias !== "NONE") {
      side = regime.tradeBias;

      const isLong = side === "LONG";

      const emaTrend = isLong
        ? ema20 > ema50
        : ema20 < ema50;

      const pullback = isLong
        ? pullbackLong(priorRows, config)
        : pullbackShort(priorRows, config);

      const rsiReset = hadRsiReset(
        priorRows,
        side,
        config
      );

      const rsiTrigger = isLong
        ? currentRsi > config.setup.rsiTrigger
        : currentRsi < config.setup.rsiTrigger;

      const macdCross = isLong
        ? previousMacdHistogram != null &&
          previousMacdHistogram <= 0 &&
          macdHistogram > 0
        : previousMacdHistogram != null &&
          previousMacdHistogram >= 0 &&
          macdHistogram < 0;

      const previousBarBreak = previous
        ? isLong
          ? candle.close > previous.candle.high
          : candle.close < previous.candle.low
        : false;

      checks = {
        emaTrend,
        pullback,
        rsiReset,
        rsiTrigger,
        macdCross:
          config.setup.requireMacdHistogramZeroCross
            ? macdCross
            : true,
        previousBarBreak:
          config.setup.requirePreviousBarBreak
            ? previousBarBreak
            : true
      };

      const ready = Object.values(checks).every(Boolean);

      if (ready) {
        stopLoss = swingStop(
          [...priorRows.map(row => row.candle), candle],
          side,
          currentAtr,
          config
        );

        takeProfit =
          stopLoss != null
            ? targetFromReference({
                side,
                referenceEntry: candle.close,
                stopLoss,
                targetR: config.setup.targetR
              })
            : null;
      }
    }

    const passedChecks = Object.values(checks).filter(Boolean).length;
    const totalChecks = Object.keys(checks).length;

    let status = "WATCHING";

    if (commonBlocks.length) {
      status = "BLOCKED";
    } else if (regime.tradeBias === "NONE") {
      status = "WATCHING";
    } else if (
      totalChecks > 0 &&
      passedChecks === totalChecks &&
      stopLoss != null &&
      takeProfit != null
    ) {
      status = "SIGNAL_READY";
    } else if (totalChecks > 0 && passedChecks >= 3) {
      status = "SETUP_FORMING";
    }

    const output = {
      ...resultBase,
      status,
      action:
        status === "SIGNAL_READY"
          ? side === "LONG"
            ? "BUY"
            : "SELL"
          : "HOLD",
      side,
      regime,
      softRegimeSetup,
      checks,
      blocks: commonBlocks,
      spreadPips:
        spreadPips == null ? null : Number(spreadPips),
      atrMedian,
      shockCooldownRemaining,
      stopLoss,
      takeProfit,
      targetR: config.setup.targetR
    };

    history.push({
      candle: { ...candle },
      indicators
    });

    const maxHistory = Math.max(
      250,
      config.setup.swingStopLookbackBars + 25
    );

    if (history.length > maxHistory) {
      history.splice(0, history.length - maxHistory);
    }

    previousMacdHistogram = macdHistogram;

    return output;
  };
}
