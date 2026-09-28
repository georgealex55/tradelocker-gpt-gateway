import { NextResponse } from "next/server";
import { killSwitchEnabled } from "../../../../lib/tradeGuard";
import { loadHistoryDataset } from "../../../../lib/research/historyStore";
import { validateDataset, preparePair } from "../../../../lib/research/prepare.mjs";
import { simulate, summarize } from "../../../../lib/research/engine.mjs";
import { SYMBOLS, COSTS } from "../../../../lib/research/policies.mjs";
import { USDCHF_V2_CANDIDATE as V2 } from "../../../../lib/research/usdchfV2Candidate.mjs";

export const runtime="nodejs";
export const dynamic="force-dynamic";
export const maxDuration=300;

const TOTAL_COST_PIPS=[2.4,3.0,3.5,4.0,4.5,5.0,6.0,7.5,10.0];
const json=data=>NextResponse.json(data,{headers:{"Cache-Control":"no-store"}});

function safety(){
  const tradingEnabled=String(process.env.TRADING_ENABLED||"false").toLowerCase()==="true";
  const killSwitch=killSwitchEnabled();
  if(tradingEnabled||!killSwitch) throw new Error("RESEARCH_REQUIRES_EXECUTION_DISABLED");
  return {tradingEnabled,killSwitch};
}
function entryFilter({hour,signal,metadata}){
  if(hour<V2.entryHourUtcStart||hour>=V2.entryHourUtcEndExclusive) return false;
  const r=signal?.regime?.checks||{};
  const ema50=Number(r.ema50),ema200=Number(r.ema200);
  if(!Number.isFinite(ema50)||!Number.isFinite(ema200)) return false;
  return Math.abs(ema50-ema200)/metadata.pipSize<=V2.maxEma50Ema200GapPips;
}
function compact(m){
  return {
    tradeCount:m.tradeCount,wins:m.wins,losses:m.losses,winRate:m.winRate,
    profitFactor:m.profitFactor,expectancyR:m.expectancyR,totalR:m.totalR,
    returnPercent:m.returnPercent,endingBalance:m.endingBalance,
    maxDrawdownPercent:m.maxDrawdownPercent,longestLosingStreak:m.longestLosingStreak
  };
}

export async function GET(){
  try{
    const safe=safety();
    const dataset=await loadHistoryDataset();
    const prepared=validateDataset(dataset);
    for(const s of SYMBOLS) prepared.pairs[s]=preparePair(prepared.pairs[s]);

    const combo={id:"USDCHF_V2_FIXED_TRADE_REPRICE",risk:"1.00",positions:1,daily:V2.dailyLimit,news:V2.newsPolicy,parameters:V2.parameters,objective:V2.objective};
    const baseline=simulate({
      prepared,combo,schedule:[],costs:COSTS.BASE,
      from:prepared.from,to:prepared.to,symbols:[V2.symbol],
      startingBalance:500,entryFilter
    });

    const m=prepared.pairs[V2.symbol].metadata;
    const baselineCostPips=COSTS.BASE.spreadPips+2*COSTS.BASE.slippagePips;

    const scenarios=TOTAL_COST_PIPS.map(totalCostPips=>{
      const extraPips=totalCostPips-baselineCostPips;
      const repriced=baseline.trades.map(t=>{
        const conversion=m.quotingCurrency==="USD"?1:1/t.exitPrice;
        const extraCostPrice=extraPips*m.pipSize;
        const extraPnl=extraCostPrice*t.units*conversion;
        const pnl=t.pnl-extraPnl;
        return {...t,pnl,rMultiple:pnl/t.riskAmount};
      });
      const metrics=summarize(repriced,500,{},[]);
      return {totalCostPips,extraVsBaselinePips:extraPips,...compact(metrics)};
    });

    const positive=scenarios.filter(s=>s.expectancyR>0);
    const pfAboveOne=scenarios.filter(s=>Number(s.profitFactor)>1);

    return json({
      ok:true,readOnlyTrading:true,safety:safe,inputHash:prepared.inputHash,
      candidate:V2,
      assumptions:{
        fixedTradeSet:true,
        fixedTradeCount:baseline.trades.length,
        fixedEntryExitTimestamps:true,
        fixedPositionSizes:true,
        baselineTotalCostPips:baselineCostPips,
        costGridPips:TOTAL_COST_PIPS,
        note:"Only execution cost is repriced. Trade selection, timing, exits, and sizes remain fixed."
      },
      baseline:compact(baseline.metrics),
      scenarios,
      robustness:{
        highestTestedPositiveExpectancyCostPips:positive.length?positive.at(-1).totalCostPips:null,
        highestTestedProfitFactorAboveOneCostPips:pfAboveOne.length?pfAboveOne.at(-1).totalCostPips:null
      }
    });
  }catch(error){
    return NextResponse.json({ok:false,readOnlyTrading:true,error:"RESEARCH_FIXED_TRADE_REPRICE_FAILED"},{status:500,headers:{"Cache-Control":"no-store"}});
  }
}
