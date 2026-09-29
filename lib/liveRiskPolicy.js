// Effective live-test risk policy.
//
// This is code-locked for the current small-account forward test so the
// runtime behavior is deterministic even if an older Vercel project variable
// still exists. Execution remains separately gated by TRADING_ENABLED and
// KILL_SWITCH.
export const LIVE_TEST_MAX_RISK_PERCENT = 27;
export const LIVE_TEST_MAX_LOTS_PER_TRADE = 0.01;

export function effectiveMaxRiskPercent() {
  return LIVE_TEST_MAX_RISK_PERCENT;
}
