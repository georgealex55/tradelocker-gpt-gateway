export const FOREX_STRATEGY_V1_CONFIG = Object.freeze({
  name: "forex-trend-pullback-v1",
  version: "1.0.0",

  capital: {
    startingBalanceUsd: 150
  },

  universe: {
    instrumentType: "FOREX",
    accountCurrency: "USD",
    // Start with USD-containing majors so historical sizing can be converted
    // into account currency without adding a second FX conversion feed.
    preferredSymbols: [
      "EURUSD",
      "GBPUSD",
      "USDJPY",
      "USDCHF"
    ],
    maxOpenPositions: 1
  },

  timeframes: {
    entry: "15m",
    regime: "1H"
  },

  indicators: {
    entry: {
      emaPeriods: [20, 50, 200],
      rsiPeriod: 14,
      atrPeriod: 14,
      adxPeriod: 14,
      macd: {
        fast: 12,
        slow: 26,
        signal: 9
      }
    },
    regime: {
      emaPeriods: [50, 200],
      rsiPeriod: 14,
      atrPeriod: 14,
      adxPeriod: 14,
      macd: {
        fast: 12,
        slow: 26,
        signal: 9
      }
    }
  },

  risk: {
    riskPercentPerTrade: 1,
    maxLots: 0.01,
    maxDailyTrades: 2,
    maxDailyLossPercent: 2,
    maxWeeklyLossPercent: 5,
    stopAfterConsecutiveLosses: 2,
    minimumRiskReward: 1.8,
    noAveragingDown: true,
    noMartingale: true,
    noGrid: true,
    noPartialExitAtMinLot: true
  },

  execution: {
    entryTiming: "next-open",
    intrabarPolicy: "stop-first",
    cooldownBarsAfterTrade: 4,
    maxSpreadPipsAbsolute: 3,
    maxSpreadAsStopFraction: 0.2
  },

  eventRisk: {
    // Generic scheduled-event windows should be injected from an economic
    // calendar. These dates are kept outside strategy direction logic.
    blockHighImpactMacroEvents: true,
    preEventMinutes: 60,
    postEventMinutes: 30,
    fomcPreEventMinutes: 90,
    fomcPostEventMinutes: 60,

    // U.S. federal general election on 2026-11-03.
    // Wide blackout: noon ET the day before through noon ET the day after.
    // This is a risk-control window, not a directional political assumption.
    fixedBlackouts: [
      {
        name: "US_2026_GENERAL_ELECTION",
        currencies: ["USD"],
        from: "2026-11-02T17:00:00.000Z",
        to: "2026-11-04T17:00:00.000Z"
      }
    ],

    atrShockMultiple: 2,
    candleRangeShockMultiple: 2.5,
    spreadShockMultiple: 2,
    shockCooldownBars: 4
  }
});
