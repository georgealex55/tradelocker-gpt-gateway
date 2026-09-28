export const SYMBOLS = ['USDCHF', 'EURUSD', 'GBPUSD'];
export const M15 = 900000;
export const ENGINE_VERSION = 'portfolio-144-v1';
export const COSTS = Object.freeze({
  BASE: { spreadPips: 2, slippagePips: 0.2 },
  STRESS: { spreadPips: 2.5, slippagePips: 0.4 }
});
export const ADX_CANDIDATES = [20, 25, 30];
export const REQUIRED_EVENTS = ['US_CPI', 'US_EMPLOYMENT', 'US_GDP', 'FOMC_DECISION', 'SNB_DECISION', 'ECB_DECISION', 'BOE_DECISION'];

export function combinations() {
  const rows = [];
  for (const risk of ['0.75', '1.00', 'ADAPTIVE'])
    for (const positions of [1, 2])
      for (const daily of ['PORTFOLIO', 'PER_PAIR'])
        for (const news of ['STRICT_BLACKOUT', 'COOLDOWN'])
          for (const parameters of ['SHARED', 'PAIR_SPECIFIC'])
            for (const objective of ['RETURN', 'BALANCED', 'DRAWDOWN_CONTROL'])
              rows.push({ id: `C${String(rows.length + 1).padStart(3, '0')}`, risk, positions, daily, news, parameters, objective });
  return rows;
}

export function riskPercent(policy, signal) {
  if (policy !== 'ADAPTIVE') return Number(policy);
  const r = signal.regime?.checks || {};
  // Uses only the completed H1 regime available when the M15 setup closes.
  return Number(r.adx) >= 30 && Math.abs(Number(r.pdi) - Number(r.mdi)) >= 10 ? 1 : 0.75;
}

export function newsBlocked(symbol, signalOpen, entryTime, policy, blackouts, lookback = 3) {
  const currencies = [symbol.slice(0, 3), symbol.slice(3)];
  const signalClose = signalOpen + M15;
  for (const b of blackouts) {
    if (b.currencies?.length && !b.currencies.some(c => currencies.includes(c))) continue;
    const from = Date.parse(b.from), to = Date.parse(b.to);
    if ((signalClose >= from && signalClose <= to) || (entryTime >= from && entryTime <= to)) return true;
    // COOLDOWN additionally requires the entire pullback/reset lookback to be
    // formed after the blackout ends. STRICT can use a pre-blackout pullback.
    if (policy === 'COOLDOWN' && signalClose > to && signalOpen - lookback * M15 <= to) return true;
  }
  return false;
}

export function rankScore(m, objective) {
  if (!m.tradeCount) return null;
  if (objective === 'RETURN') return m.returnPercent;
  if (objective === 'DRAWDOWN_CONTROL') return -m.maxDrawdownPercent + Math.min(m.expectancyR, 1);
  return m.returnPercent / Math.max(1, m.maxDrawdownPercent) + m.expectancyR;
}
