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

const CAPITALS=[200,500];
const WINDOW_COUNT=6;
const json=data=>NextResponse.json(data,{headers:{"Cache-Control":"no-store"}});

function safety(){
  const tradingEnabled=String(process.env.TRADING_ENABLED||"false").toLowerCase()==="true";
  const killSwitch=killSwitchEnabled();
  if(tradingEnabled||!killSwitch) throw new Error("RESEARCH_REQUIRES_EXECUTION_DISABLED");
  return {tradingEnabled,killSwitch};
}

function entryFilter({hour,signal,metadata}){
  if(hour<V2.entryHourUtcStart || hour>=V2.entryHourUtcEndExclusive) return false;
  const r=signal?.regime?.checks||{};
  const ema50=Number(r.ema50), ema200=Number(r.ema200);
  if(!Number.isFinite(ema50)||!Number.isFinite(ema200)) return false;
  const gap=Math.abs(ema50-ema200)/metadata.pipSize;
  return gap<=V2.maxEma50Ema200GapPips;
}

function compact(sim){
  const m=sim.metrics;
  return {
    trades:m.tradeCount,
    wins:m.wins,
    losses:m.losses,
    winRate:m.winRate,
    profitFactor:m.profitFactor,
    expectancyR:m.expectancyR,
    totalR:m.totalR,
    returnPercent:m.returnPercent,
    endingBalance:m.endingBalance,
    maxDrawdownPercent:m.maxDrawdownPercent,
    maxDrawdownDollars:m.maxDrawdownDollars,
    longestLosingStreak:m.longestLosingStreak,
    minLotSkips:m.minLotSkips,
    spreadBlocked:m.spreadBlocked,
    newsBlocked:m.newsBlocked,
    entryFiltered:m.skips?.RESEARCH_ENTRY_FILTER||0
  };
}

function summarizeWindows(rows,key){
  const x=rows.map(r=>r[key]);
  return {
    windows:x.length,
    positiveExpectancyWindows:x.filter(v=>v.expectancyR>0).length,
    positiveReturnWindows:x.filter(v=>v.returnPercent>0).length,
    pfAboveOneWindows:x.filter(v=>Number(v.profitFactor)>1).length,
    totalTrades:x.reduce((n,v)=>n+v.trades,0),
    totalR:x.reduce((n,v)=>n+v.totalR,0),
    averageExpectancyR:x.reduce((n,v)=>n+v.expectancyR,0)/x.length,
    worstExpectancyR:Math.min(...x.map(v=>v.expectancyR)),
    maxWindowDrawdownPercent:Math.max(...x.map(v=>v.maxDrawdownPercent))
  };
}

export async function GET(){
  try{
    const safe=safety();
    const dataset=await loadHistoryDataset();
    const prepared=validateDataset(dataset);
    for(const s of SYMBOLS) prepared.pairs[s]=preparePair(prepared.pairs[s]);

    const combo={
      id:"USDCHF_V2_PHASE3",
      risk:"1.00",
      positions:1,
      daily:V2.dailyLimit,
      news:V2.newsPolicy,
      parameters:V2.parameters,
      objective:V2.objective
    };

    const span=prepared.to-prepared.from;
    const windows=Array.from({length:WINDOW_COUNT},(_,i)=>({
      index:i+1,
      from:Math.round(prepared.from+span*i/WINDOW_COUNT),
      to:i===WINDOW_COUNT-1?prepared.to:Math.round(prepared.from+span*(i+1)/WINDOW_COUNT)
    }));

    const results={};
    for(const capital of CAPITALS){
      const fullBase=simulate({prepared,combo,schedule:[],costs:COSTS.BASE,from:prepared.from,to:prepared.to,symbols:[V2.symbol],startingBalance:capital,entryFilter});
      const fullStress=simulate({prepared,combo,schedule:[],costs:COSTS.STRESS,from:prepared.from,to:prepared.to,symbols:[V2.symbol],startingBalance:capital,entryFilter});
      const byWindow=windows.map(w=>({
        window:w.index,
        from:new Date(w.from).toISOString(),
        to:new Date(w.to).toISOString(),
        base:compact(simulate({prepared,combo,schedule:[],costs:COSTS.BASE,from:w.from,to:w.to,symbols:[V2.symbol],startingBalance:capital,entryFilter})),
        stress:compact(simulate({prepared,combo,schedule:[],costs:COSTS.STRESS,from:w.from,to:w.to,symbols:[V2.symbol],startingBalance:capital,entryFilter}))
      }));
      results[capital]={
        full:{base:compact(fullBase),stress:compact(fullStress)},
        byWindow,
        windowSummary:{base:summarizeWindows(byWindow,"base"),stress:summarizeWindows(byWindow,"stress")}
      };
    }

    return json({
      ok:true,
      readOnlyTrading:true,
      safety:safe,
      inputHash:prepared.inputHash,
      candidate:V2,
      assumptions:{
        noOptimization:true,
        frozenFrom:new Date(prepared.from).toISOString(),
        frozenTo:new Date(prepared.to).toISOString(),
        baseCosts:COSTS.BASE,
        stressCosts:COSTS.STRESS,
        capitals:CAPITALS
      },
      results
    });
  }catch(error){
    return NextResponse.json({ok:false,readOnlyTrading:true,error:"RESEARCH_PHASE3_FAILED"},{status:500,headers:{"Cache-Control":"no-store"}});
  }
}
