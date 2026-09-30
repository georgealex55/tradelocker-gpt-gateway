function finite(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function classifyH1Regime({
  ema50,
  ema200,
  adx,
  pdi,
  mdi,
  close,
  minimumAdx = 20
} = {}) {
  const values = {
    ema50: finite(ema50),
    ema200: finite(ema200),
    adx: finite(adx),
    pdi: finite(pdi),
    mdi: finite(mdi),
    close: finite(close),
    minimumAdx: finite(minimumAdx)
  };

  const ready = [
    values.ema50,
    values.ema200,
    values.adx,
    values.pdi,
    values.mdi,
    values.close,
    values.minimumAdx
  ].every(value => value != null);

  if (!ready) {
    return {
      bias: "NONE",
      tradeBias: "NONE",
      direction: "NONE",
      strength: "NOT_READY",
      ready: false,
      reason: "H1_NOT_WARM",
      checks: values
    };
  }

  const longStack =
    values.ema50 > values.ema200 &&
    values.close > values.ema200;

  const shortStack =
    values.ema50 < values.ema200 &&
    values.close < values.ema200;

  const adxConfirmed = values.adx >= values.minimumAdx;

  const hardLong =
    longStack &&
    adxConfirmed &&
    values.pdi > values.mdi;

  const hardShort =
    shortStack &&
    adxConfirmed &&
    values.mdi > values.pdi;

  const softLong =
    longStack &&
    !adxConfirmed;

  const softShort =
    shortStack &&
    !adxConfirmed;

  let bias = "NONE";
  let tradeBias = "NONE";
  let direction = "NONE";
  let strength = "NEUTRAL";
  let reason = "NO_DIRECTIONAL_STACK";

  if (hardLong) {
    bias = "LONG";
    tradeBias = "LONG";
    direction = "LONG";
    strength = "HARD";
    reason = "ADX_AND_DI_CONFIRMED";
  } else if (hardShort) {
    bias = "SHORT";
    tradeBias = "SHORT";
    direction = "SHORT";
    strength = "HARD";
    reason = "ADX_AND_DI_CONFIRMED";
  } else if (softLong) {
    bias = "SOFT_LONG";
    direction = "LONG";
    strength = "SOFT";
    reason = "LOW_ADX_DIRECTIONAL_STACK";
  } else if (softShort) {
    bias = "SOFT_SHORT";
    direction = "SHORT";
    strength = "SOFT";
    reason = "LOW_ADX_DIRECTIONAL_STACK";
  } else if ((longStack || shortStack) && adxConfirmed) {
    direction = longStack ? "LONG" : "SHORT";
    strength = "CONFLICT";
    reason = "ADX_CONFIRMED_DI_CONFLICT";
  }

  return {
    bias,
    tradeBias,
    direction,
    strength,
    ready: true,
    reason,
    checks: {
      ...values,
      longStack,
      shortStack,
      adxConfirmed,
      directionalDiConfirmed:
        direction === "LONG"
          ? values.pdi > values.mdi
          : direction === "SHORT"
            ? values.mdi > values.pdi
            : false
    }
  };
}
