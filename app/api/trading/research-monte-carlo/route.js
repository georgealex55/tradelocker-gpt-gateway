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

const ITERATIONS=20000;
const START=500;
const RISK_FRACTION=0.01;
const SEED=0x5a17c9e3;
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
function rng(seed){
  let x=seed>>>0;
  return ()=>{
    x+=0x6D2B79F5;
    let t=x;
    t=Math.imul(t^t>>>15,t|1);
    t^=t+Math.imul(t^t>>>7,t|61);
    return ((t^t>>>14)>>>0)/4294967296;
  };
}
function pct(sorted,p){
  if(!sorted.length) return null;
  const i=(sorted.length-1)*p;
  const lo=Math.floor(i),hi=Math.ceil(i);
  return sorted[lo]+(sorted[hi]-sorted[lo])*(i-lo);
}
function summarizePath(rs){
  let equity=START,peak=START,maxDD=0,streak=0,maxStreak=0,totalR=0;
  for(const r of rs){
    totalR+=r;
    equity*=Math.max(0,1+RISK_FRACTION*r);
    peak=Math.max(peak,equity);
    maxDD=Math.max(maxDD,peak>0?(peak-equity)/peak*100:0);
    streak=r<0?streak+1:0;
    maxStreak=Math.max(maxStreak,streak);
  }
  return {endingBalance:equity,returnPercent:(equity/START-1)*100,totalR,maxDD,maxStreak};
}
function stats(rows){
  const endings=rows.map(x=>x.endingBalance).sort((a,b)=>a-b);
  const returns=rows.map(x=>x.returnPercent).sort((a,b)=>a-b);
  const dds=rows.map(x=>x.maxDD).sort((a,b)=>a-b);
  const streaks=rows.map(x=>x.maxStreak).sort((a,b)=>a-b);
  const totalRs=rows.map(x=>x.totalR).sort((a,b)=>a-b);
  return {
    endingBalance:{p05:pct(endings,.05),p50:pct(endings,.50),p95:pct(endings,.95)},
    returnPercent:{p05:pct(returns,.05),p50:pct(returns,.50),p95:pct(returns,.95)},
    totalR:{p05:pct(totalRs,.05),p50:pct(totalRs,.50),p95:pct(totalRs,.95)},
    maxDrawdownPercent:{p50:pct(dds,.50),p90:pct(dds,.90),p95:pct(dds,.95),p99:pct(dds,.99)},
    longestLosingStreak:{p50:pct(streaks,.50),p90:pct(streaks,.90),p95:pct(streaks,.95),p99:pct(streaks,.99)},
    probabilityEndingBelowStart:rows.filter(x=>x.endingBalance<START).length/rows.length,
    probabilityNegativeTotalR:rows.filter(x=>x.totalR<0).length/rows.length,
    probabilityDD5:rows.filter(x=>x.maxDD>=5).length/rows.length,
    probabilityDD10:rows.filter(x=>x.maxDD>=10).length/rows.length,
    probabilityDD15:rows.filter(x=>x.maxDD>=15).length/rows.length
  };
}

export async function GET(){
  try{
    const safe=safety();
    const dataset=await loadHistoryDataset();
    const prepared=validateDataset(dataset);
    for(const s of SYMBOLS) prepared.pairs[s]=preparePair(prepared.pairs[s]);
    const combo={id:"USDCHF_V2_MONTE_CARLO",risk:"1.00",positions:1,daily:V2.dailyLimit,news:V2.newsPolicy,parameters:V2.parameters,objective:V2.objective};
    const baseline=simulate({
      prepared,combo,schedule:[],costs:COSTS.BASE,
      from:prepared.from,to:prepared.to,symbols:[V2.symbol],
      startingBalance:START,entryFilter
    });
    const rs=baseline.trades.map(t=>t.rMultiple);
    if(rs.length!==29) throw new Error("RESEARCH_MONTE_CARLO_EXPECTED_29_TRADES");

    const random=rng(SEED);
    const boot=[];
    for(let i=0;i<ITERATIONS;i++){
      const sample=Array.from({length:rs.length},()=>rs[Math.floor(random()*rs.length)]);
      boot.push(summarizePath(sample));
    }

    const perm=[];
    for(let i=0;i<ITERATIONS;i++){
      const sample=[...rs];
      for(let j=sample.length-1;j>0;j--){
        const k=Math.floor(random()*(j+1));
        [sample[j],sample[k]]=[sample[k],sample[j]];
      }
      perm.push(summarizePath(sample));
    }

    return json({
      ok:true,readOnlyTrading:true,safety:safe,inputHash:prepared.inputHash,
      candidate:V2,
      assumptions:{
        iterationsPerMethod:ITERATIONS,
        deterministicSeed:SEED,
        tradeCount:rs.length,
        startingBalance:START,
        compoundingRiskFraction:RISK_FRACTION,
        bootstrap:"sample 29 historical R-multiples with replacement",
        permutation:"reorder the same 29 historical R-multiples without replacement",
        note:"Equity paths use 1% compounded risk per trade. This is an R-based robustness model, not an exact broker-lot replay."
      },
      baseline:{
        tradeCount:baseline.metrics.tradeCount,
        totalR:baseline.metrics.totalR,
        expectancyR:baseline.metrics.expectancyR,
        profitFactor:baseline.metrics.profitFactor,
        historicalReturnPercent:baseline.metrics.returnPercent,
        historicalMaxDrawdownPercent:baseline.metrics.maxDrawdownPercent,
        longestLosingStreak:baseline.metrics.longestLosingStreak
      },
      bootstrap:stats(boot),
      permutation:stats(perm)
    });
  }catch(error){
    return NextResponse.json({ok:false,readOnlyTrading:true,error:String(error?.message||"RESEARCH_MONTE_CARLO_FAILED")},{status:500,headers:{"Cache-Control":"no-store"}});
  }
}
