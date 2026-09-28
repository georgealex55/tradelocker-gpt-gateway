import { NextResponse } from "next/server";
import { listForexInstruments } from "../../../../lib/forexUniverse";
import { scanForexSignal } from "../../../../lib/forexSignals";
import { FOREX_STRATEGY_V1_CONFIG } from "../../../../lib/forexStrategyV1Config";
import { USDCHF_V2_CANDIDATE as V2 } from "../../../../lib/research/usdchfV2Candidate.mjs";
import { killSwitchEnabled } from "../../../../lib/tradeGuard";

export const runtime="nodejs";
export const dynamic="force-dynamic";
export const maxDuration=120;

const CONFIG={
  ...FOREX_STRATEGY_V1_CONFIG,
  name:"forex-trend-pullback-v2-macro-test",
  version:"2.0.0-macro-test",
  capital:{...FOREX_STRATEGY_V1_CONFIG.capital,startingBalanceUsd:500},
  universe:{...FOREX_STRATEGY_V1_CONFIG.universe,preferredSymbols:["USDCHF"],maxOpenPositions:1},
  session:{
    ...FOREX_STRATEGY_V1_CONFIG.session,
    entryStartUtcHour:V2.entryHourUtcStart,
    entryEndUtcHour:V2.entryHourUtcEndExclusive
  },
  risk:{
    ...FOREX_STRATEGY_V1_CONFIG.risk,
    riskPercentPerTrade:1,
    maxLots:0.01
  },
  setup:{...FOREX_STRATEGY_V1_CONFIG.setup,targetR:V2.targetR}
};

export async function GET(){
  try{
    const tradingEnabled=String(process.env.TRADING_ENABLED||"false").toLowerCase()==="true";
    const killSwitch=killSwitchEnabled();
    if(tradingEnabled||!killSwitch){
      return NextResponse.json({
        ok:false,readOnlyTrading:true,error:"MACRO_TEST_REQUIRES_TRADING_DISABLED_AND_KILL_SWITCH_ON"
      },{status:409,headers:{"Cache-Control":"no-store"}});
    }

    const universe=await listForexInstruments();
    const instrument=universe.find(x=>x.symbol==="USDCHF");
    if(!instrument) throw new Error("USDCHF_NOT_FOUND");

    const asOf=Date.now();
    const synthetic={
      name:"TEST_ACTIVE_USD_MACRO",
      event:"TEST_MACRO",
      currencies:["USD"],
      eventTime:new Date(asOf).toISOString(),
      from:new Date(asOf-60*60*1000).toISOString(),
      to:new Date(asOf+60*60*1000).toISOString(),
      synthetic:true
    };

    const row=await scanForexSignal({
      instrument,
      config:CONFIG,
      asOf,
      scheduledBlackouts:[synthetic]
    });

    const blocks=row.signal?.blocks||[];
    const assertions={
      macroBlockPresent:blocks.includes("TEST_ACTIVE_USD_MACRO"),
      signalBlocked:row.signal?.status==="BLOCKED",
      actionHold:row.signal?.action==="HOLD",
      executionBlocked:row.execution?.status==="BLOCKED",
      killSwitchReason:row.execution?.reason==="KILL_SWITCH",
      marketDataLoaded:Boolean(row.bars>0&&row.latestBar?.time),
      quoteLoaded:Number.isFinite(Number(row.quote?.spreadPips))
    };
    const passed=Object.values(assertions).every(Boolean);
    if(!passed) throw new Error("MACRO_BLACKOUT_ASSERTION_FAILED");

    return NextResponse.json({
      ok:true,
      mode:"V2_SYNTHETIC_MACRO_BLACKOUT_TEST",
      readOnlyTrading:true,
      liveExecutionPossible:false,
      safety:{tradingEnabled,killSwitch},
      syntheticEvent:synthetic,
      result:{
        symbol:row.instrument?.symbol||null,
        completedThrough:row.completedThrough,
        latestBarTime:row.latestBar?.time||null,
        status:row.signal?.status||null,
        action:row.signal?.action||null,
        blocks,
        spreadPips:row.quote?.spreadPips??null,
        execution:row.execution||null
      },
      assertions
    },{headers:{"Cache-Control":"no-store"}});
  }catch(error){
    return NextResponse.json({
      ok:false,readOnlyTrading:true,liveExecutionPossible:false,error:String(error?.message||error)
    },{status:500,headers:{"Cache-Control":"no-store"}});
  }
}
