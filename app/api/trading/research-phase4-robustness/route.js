import { NextResponse } from "next/server";
import { killSwitchEnabled } from "../../../../lib/tradeGuard";
import { loadHistoryDataset } from "../../../../lib/research/historyStore";
import { validateDataset, preparePair } from "../../../../lib/research/prepare.mjs";
import { simulate } from "../../../../lib/research/engine.mjs";
import { SYMBOLS, COSTS } from "../../../../lib/research/policies.mjs";
import { USDCHF_V2_CANDIDATE as V2 } from "../../../../lib/research/usdchfV2Candidate.mjs";

export const runtime="nodejs";
export const dynamic="force-dynamic";
export const maxDuration=300;

const json=data=>NextResponse.json(data,{headers:{"Cache-Control":"no-store"}});

function safety(){
  const tradingEnabled=String(process.env.TRADING_ENABLED||"false").toLowerCase()==="true";
  const killSwitch=killSwitchEnabled();
  if(tradingEnabled||!killSwitch) throw new Error("RESEARCH_REQUIRES_EXECUTION_DISABLED");
  return {tradingEnabled,killSwitch};
}
function makeFilter(maxGap){
  return ({hour,signal,metadata})=>{
    if(hour<V2.entryHourUtcStart||hour>=V2.entryHourUtcEndExclusive) return false;
    const r=signal?.regime?.checks||{};
    const ema50=Number(r.ema50),ema200=Number(r.ema200);
    if(!Number.isFinite(ema50)||!Number.isFinite(ema200)) return false;
    return Math.abs(ema50-ema200)/metadata.pipSize<=maxGap;
  };
}
function compact(sim){
  const m=sim.metrics;
  return {
    trades:m.tradeCount,wins:m.wins,losses:m.losses,winRate:m.winRate,
    profitFactor:m.profitFactor,expectancyR:m.expectancyR,totalR:m.totalR,
    returnPercent:m.returnPercent,endingBalance:m.endingBalance,
    maxDrawdownPercent:m.maxDrawdownPercent,longestLosingStreak:m.longestLosingStreak,
    minLotSkips:m.minLotSkips,spreadBlocked:m.spreadBlocked,newsBlocked:m.newsBlocked
  };
}
function run(prepared,combo,{costs,delay=0,fill=0,gap=30}){
  return compact(simulate({
    prepared,combo,schedule:[],costs,from:prepared.from,to:prepared.to,
    symbols:[V2.symbol],startingBalance:500,entryFilter:makeFilter(gap),
    entryDelayBars:delay,adverseFillPips:fill
  }));
}

export async function GET(){
  try{
    const safe=safety();
    const dataset=await loadHistoryDataset();
    const prepared=validateDataset(dataset);
    for(const s of SYMBOLS) prepared.pairs[s]=preparePair(prepared.pairs[s]);
    const combo={id:"USDCHF_V2_PHASE4",risk:"1.00",positions:1,daily:V2.dailyLimit,news:V2.newsPolicy,parameters:V2.parameters,objective:V2.objective};

    const executionScenarios={
      BASELINE:run(prepared,combo,{costs:COSTS.BASE}),
      LOCKED_STRESS:run(prepared,combo,{costs:COSTS.STRESS}),
      HEAVY_COST:run(prepared,combo,{costs:{spreadPips:3,slippagePips:0.6}}),
      DELAY_1_BASE:run(prepared,combo,{costs:COSTS.BASE,delay:1}),
      DELAY_1_STRESS:run(prepared,combo,{costs:COSTS.STRESS,delay:1}),
      FILL_0_5_BASE:run(prepared,combo,{costs:COSTS.BASE,fill:0.5}),
      FILL_0_5_STRESS:run(prepared,combo,{costs:COSTS.STRESS,fill:0.5}),
      COMBINED_ABUSE:run(prepared,combo,{costs:{spreadPips:3,slippagePips:0.6},delay:1,fill:0.5})
    };

    const emaPerturbation={};
    for(const gap of [25,30,35]){
      emaPerturbation[gap]={
        base:run(prepared,combo,{costs:COSTS.BASE,gap}),
        stress:run(prepared,combo,{costs:COSTS.STRESS,gap})
      };
    }

    return json({
      ok:true,readOnlyTrading:true,safety:safe,inputHash:prepared.inputHash,
      candidate:V2,
      assumptions:{
        capital:500,noOptimization:true,
        baselineCosts:COSTS.BASE,stressCosts:COSTS.STRESS,
        heavyCosts:{spreadPips:3,slippagePips:0.6},
        delayedEntryBars:1,adverseFillPips:0.5,
        emaGapPerturbationPips:[25,30,35]
      },
      executionScenarios,
      emaPerturbation
    });
  }catch(error){
    return NextResponse.json({ok:false,readOnlyTrading:true,error:"RESEARCH_PHASE4_FAILED"},{status:500,headers:{"Cache-Control":"no-store"}});
  }
}
