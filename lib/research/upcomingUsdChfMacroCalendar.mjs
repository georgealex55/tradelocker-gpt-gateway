const SOURCES=Object.freeze({
  US_CPI:"https://www.bls.gov/schedule/2026/",
  US_EMPLOYMENT:"https://www.bls.gov/schedule/news_release/empsit.htm",
  US_GDP:"https://www.bea.gov/news/schedule",
  FOMC_DECISION:"https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm",
  SNB_DECISION:"https://www.snb.ch/en/services-events/digital-services/event-schedule"
});

const EVENTS=Object.freeze([
  {event:"US_GDP",currency:"USD",time:"2026-09-30T12:30:00Z",pre:60,post:30,source:SOURCES.US_GDP},
  {event:"US_EMPLOYMENT",currency:"USD",time:"2026-10-02T12:30:00Z",pre:60,post:30,source:SOURCES.US_EMPLOYMENT},
  {event:"US_CPI",currency:"USD",time:"2026-10-14T12:30:00Z",pre:60,post:30,source:SOURCES.US_CPI},
  {event:"US_GDP",currency:"USD",time:"2026-10-29T12:30:00Z",pre:60,post:30,source:SOURCES.US_GDP},
  {event:"FOMC_DECISION",currency:"USD",time:"2026-10-28T18:00:00Z",pre:90,post:60,source:SOURCES.FOMC_DECISION},
  {event:"US_EMPLOYMENT",currency:"USD",time:"2026-11-06T13:30:00Z",pre:60,post:30,source:SOURCES.US_EMPLOYMENT},
  {event:"US_CPI",currency:"USD",time:"2026-11-10T13:30:00Z",pre:60,post:30,source:SOURCES.US_CPI},
  {event:"US_GDP",currency:"USD",time:"2026-11-25T13:30:00Z",pre:60,post:30,source:SOURCES.US_GDP},
  {event:"US_EMPLOYMENT",currency:"USD",time:"2026-12-04T13:30:00Z",pre:60,post:30,source:SOURCES.US_EMPLOYMENT},
  {event:"FOMC_DECISION",currency:"USD",time:"2026-12-09T19:00:00Z",pre:90,post:60,source:SOURCES.FOMC_DECISION},
  {event:"US_CPI",currency:"USD",time:"2026-12-10T13:30:00Z",pre:60,post:30,source:SOURCES.US_CPI},
  {event:"SNB_DECISION",currency:"CHF",time:"2026-12-10T08:30:00Z",pre:90,post:60,source:SOURCES.SNB_DECISION},
  {event:"US_GDP",currency:"USD",time:"2026-12-23T13:30:00Z",pre:60,post:30,source:SOURCES.US_GDP}
]);

function blackout(row){
  const t=Date.parse(row.time);
  return {
    name:`${row.event}_${row.time.slice(0,10)}`,
    event:row.event,
    currencies:[row.currency],
    eventTime:row.time,
    from:new Date(t-row.pre*60*1000).toISOString(),
    to:new Date(t+row.post*60*1000).toISOString(),
    preMinutes:row.pre,
    postMinutes:row.post,
    source:row.source,
    official:true
  };
}

export function upcomingUsdChfMacroCalendar(asOf=Date.now()){
  const now=Number(asOf);
  const blackouts=EVENTS.map(blackout);
  const future=blackouts.filter(x=>Date.parse(x.to)>=now);
  return {
    reviewedAt:"2026-09-28T00:55:00Z",
    coverageThrough:"2026-12-23T14:00:00Z",
    currencies:["USD","CHF"],
    events:future,
    nextEvent:future.find(x=>Date.parse(x.eventTime)>=now)||future[0]||null,
    sources:SOURCES,
    note:"Official 2026 USD/CHF high-impact schedule encoded for shadow-forward testing. Refresh before 2027 or if an official agency reschedules a release."
  };
}
