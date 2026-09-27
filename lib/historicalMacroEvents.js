// Historical USD/CHF macro events used only for backtest entry blackouts.
//
// Sources:
// - U.S. Bureau of Labor Statistics release calendars for CPI and Employment Situation.
// - Federal Reserve FOMC meeting calendars; policy statements are released at 2:00 p.m. ET.
// - Swiss National Bank monetary policy decision archive; decisions are released at 09:30 Zurich time.
//
// UTC timestamps below preserve the official local release times, including DST.
// The 2025 BLS lapse in appropriations is represented using the actual revised
// release schedule: there was no October 2025 Employment Situation release and
// no October 2025 all-items CPI release.

const CPI = [
  "2024-01-11T13:30:00Z",
  "2024-02-13T13:30:00Z",
  "2024-03-12T12:30:00Z",
  "2024-04-10T12:30:00Z",
  "2024-05-15T12:30:00Z",
  "2024-06-12T12:30:00Z",
  "2024-07-11T12:30:00Z",
  "2024-08-14T12:30:00Z",
  "2024-09-11T12:30:00Z",
  "2024-10-10T12:30:00Z",
  "2024-11-13T13:30:00Z",
  "2024-12-11T13:30:00Z",
  "2025-01-15T13:30:00Z",
  "2025-02-12T13:30:00Z",
  "2025-03-12T12:30:00Z",
  "2025-04-10T12:30:00Z",
  "2025-05-13T12:30:00Z",
  "2025-06-11T12:30:00Z",
  "2025-07-15T12:30:00Z",
  "2025-08-12T12:30:00Z",
  "2025-09-11T12:30:00Z",
  "2025-10-24T12:30:00Z",
  "2025-12-18T13:30:00Z",
  "2026-01-13T13:30:00Z",
  "2026-02-13T13:30:00Z",
  "2026-03-11T12:30:00Z",
  "2026-04-10T12:30:00Z",
  "2026-05-12T12:30:00Z",
  "2026-06-10T12:30:00Z",
  "2026-07-14T12:30:00Z",
  "2026-08-12T12:30:00Z",
  "2026-09-11T12:30:00Z"
];

const EMPLOYMENT = [
  "2024-01-05T13:30:00Z",
  "2024-02-02T13:30:00Z",
  "2024-03-08T13:30:00Z",
  "2024-04-05T12:30:00Z",
  "2024-05-03T12:30:00Z",
  "2024-06-07T12:30:00Z",
  "2024-07-05T12:30:00Z",
  "2024-08-02T12:30:00Z",
  "2024-09-06T12:30:00Z",
  "2024-10-04T12:30:00Z",
  "2024-11-01T12:30:00Z",
  "2024-12-06T13:30:00Z",
  "2025-01-10T13:30:00Z",
  "2025-02-07T13:30:00Z",
  "2025-03-07T13:30:00Z",
  "2025-04-04T12:30:00Z",
  "2025-05-02T12:30:00Z",
  "2025-06-06T12:30:00Z",
  "2025-07-03T12:30:00Z",
  "2025-08-01T12:30:00Z",
  "2025-09-05T12:30:00Z",
  "2025-11-20T13:30:00Z",
  "2025-12-16T13:30:00Z",
  "2026-01-09T13:30:00Z",
  "2026-02-11T13:30:00Z",
  "2026-03-06T13:30:00Z",
  "2026-04-03T12:30:00Z",
  "2026-05-08T12:30:00Z",
  "2026-06-05T12:30:00Z",
  "2026-07-02T12:30:00Z",
  "2026-08-07T12:30:00Z",
  "2026-09-04T12:30:00Z"
];

const FOMC = [
  "2024-01-31T19:00:00Z",
  "2024-03-20T18:00:00Z",
  "2024-05-01T18:00:00Z",
  "2024-06-12T18:00:00Z",
  "2024-07-31T18:00:00Z",
  "2024-09-18T18:00:00Z",
  "2024-11-07T19:00:00Z",
  "2024-12-18T19:00:00Z",
  "2025-01-29T19:00:00Z",
  "2025-03-19T18:00:00Z",
  "2025-05-07T18:00:00Z",
  "2025-06-18T18:00:00Z",
  "2025-07-30T18:00:00Z",
  "2025-09-17T18:00:00Z",
  "2025-10-29T18:00:00Z",
  "2025-12-10T19:00:00Z",
  "2026-01-28T19:00:00Z",
  "2026-03-18T18:00:00Z",
  "2026-04-29T18:00:00Z",
  "2026-06-17T18:00:00Z",
  "2026-07-29T18:00:00Z",
  "2026-09-16T18:00:00Z"
];

const SNB = [
  "2024-03-21T08:30:00Z",
  "2024-06-20T07:30:00Z",
  "2024-09-26T07:30:00Z",
  "2024-12-12T08:30:00Z",
  "2025-03-20T08:30:00Z",
  "2025-06-19T07:30:00Z",
  "2025-09-25T07:30:00Z",
  "2025-12-11T08:30:00Z",
  "2026-03-19T08:30:00Z",
  "2026-06-18T07:30:00Z",
  "2026-09-24T07:30:00Z"
];

const GDP = [
  "2024-01-25T13:30:00Z","2024-02-28T13:30:00Z","2024-03-28T12:30:00Z",
  "2024-04-25T12:30:00Z","2024-05-30T12:30:00Z","2024-06-27T12:30:00Z",
  "2024-07-25T12:30:00Z","2024-08-29T12:30:00Z","2024-09-26T12:30:00Z",
  "2024-10-30T12:30:00Z","2024-11-27T13:30:00Z","2024-12-19T13:30:00Z",
  "2025-01-30T13:30:00Z","2025-02-27T13:30:00Z","2025-03-27T12:30:00Z",
  "2025-04-30T12:30:00Z","2025-05-29T12:30:00Z","2025-06-26T12:30:00Z",
  "2025-07-30T12:30:00Z","2025-08-28T12:30:00Z","2025-09-25T12:30:00Z",
  "2025-12-23T13:30:00Z",
  "2026-01-22T13:30:00Z",
  "2026-02-20T13:30:00Z","2026-03-13T12:30:00Z","2026-04-09T12:30:00Z",
  "2026-04-30T12:30:00Z","2026-05-28T12:30:00Z","2026-06-25T12:30:00Z",
  "2026-07-30T12:30:00Z","2026-08-26T12:30:00Z"
];

const ECB = [
  "2024-01-25T13:15:00Z","2024-03-07T13:15:00Z","2024-04-11T12:15:00Z",
  "2024-06-06T12:15:00Z","2024-07-18T12:15:00Z","2024-09-12T12:15:00Z",
  "2024-10-17T12:15:00Z","2024-12-12T13:15:00Z",
  "2025-01-30T13:15:00Z","2025-03-06T13:15:00Z","2025-04-17T12:15:00Z",
  "2025-06-05T12:15:00Z","2025-07-24T12:15:00Z","2025-09-11T12:15:00Z",
  "2025-10-30T13:15:00Z","2025-12-18T13:15:00Z",
  "2026-02-05T13:15:00Z","2026-03-19T13:15:00Z","2026-04-30T12:15:00Z",
  "2026-06-11T12:15:00Z","2026-07-23T12:15:00Z","2026-09-10T12:15:00Z"
];

const BOE = [
  "2024-02-01T12:00:00Z","2024-03-21T12:00:00Z","2024-05-09T11:00:00Z",
  "2024-06-20T11:00:00Z","2024-08-01T11:00:00Z","2024-09-19T11:00:00Z",
  "2024-11-07T12:00:00Z","2024-12-19T12:00:00Z",
  "2025-02-06T12:00:00Z","2025-03-20T12:00:00Z","2025-05-08T11:00:00Z",
  "2025-06-19T11:00:00Z","2025-08-07T11:00:00Z","2025-09-18T11:00:00Z",
  "2025-11-06T12:00:00Z","2025-12-18T12:00:00Z",
  "2026-02-05T12:00:00Z","2026-03-19T12:00:00Z","2026-04-30T11:00:00Z",
  "2026-06-18T11:00:00Z","2026-07-30T11:00:00Z","2026-09-17T11:00:00Z"
];

function blackout(name, currency, time, preMinutes, postMinutes) {
  const center = Date.parse(time);

  if (!Number.isFinite(center)) {
    throw new Error(`Invalid historical macro timestamp: ${time}`);
  }

  return {
    name: `${name}_${time.slice(0, 10)}`,
    event: name,
    currencies: [currency],
    eventTime: time,
    from: new Date(center - preMinutes * 60 * 1000).toISOString(),
    to: new Date(center + postMinutes * 60 * 1000).toISOString(),
    preMinutes,
    postMinutes
  };
}

export const HISTORICAL_MACRO_EVENTS = Object.freeze({
  cpi: CPI,
  employment: EMPLOYMENT,
  fomc: FOMC,
  snb: SNB,
  gdp: GDP,
  ecb: ECB,
  boe: BOE
});

export function historicalMacroBlackouts() {
  return [
    ...CPI.map(time => blackout("US_CPI", "USD", time, 60, 30)),
    ...EMPLOYMENT.map(time =>
      blackout("US_EMPLOYMENT", "USD", time, 60, 30)
    ),
    ...FOMC.map(time =>
      blackout("FOMC_DECISION", "USD", time, 90, 60)
    ),
    ...SNB.map(time =>
      blackout("SNB_DECISION", "CHF", time, 90, 60)
    ),
    ...GDP.map(time =>
      blackout("US_GDP", "USD", time, 60, 30)
    ),
    ...ECB.map(time =>
      blackout("ECB_DECISION", "EUR", time, 90, 60)
    ),
    ...BOE.map(time =>
      blackout("BOE_DECISION", "GBP", time, 90, 60)
    )
  ].sort(
    (a, b) => Date.parse(a.eventTime) - Date.parse(b.eventTime)
  );
}

export function historicalMacroEventCounts() {
  return {
    cpi: CPI.length,
    employment: EMPLOYMENT.length,
    fomc: FOMC.length,
    snb: SNB.length,
    gdp: GDP.length,
    ecb: ECB.length,
    boe: BOE.length,
    total: CPI.length + EMPLOYMENT.length + FOMC.length + SNB.length + GDP.length + ECB.length + BOE.length
  };
}
