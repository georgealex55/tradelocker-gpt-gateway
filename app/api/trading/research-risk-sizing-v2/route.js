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

const RISKS=[0.5,0.75,1.0,1.25,1.5];
const ITERATIONS=20000;
const BLOCK=3;
const START=500;
const SEED=0x73a15b2c;
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
function compact(sim){
  const m=sim.metrics;
  return {
    trades:m.tradeCount,wins:m.wins,losses:m.losses,winRate:m.winRate,
    profitFactor:m.profitFactor,expectancyR:m.expectancyR,totalR:m.totalR,
    returnPercent:m.returnPercent,endingBalance:m.endingBalance,
    maxDrawdownPercent:m.maxDrawdownPercent,longestLosingStreak:m.longestLosingStreak,
    minLotSkips:m.minLotSkips,spreadBlocked:m.spreadBlocked,newsBlocked:m.newsBlocked,
    capacityBlocked:m.capacityBlocked
  };
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
  const i=(sorted.length-1)*p,lo=Math.floor(i),hi=Math.ceil(i);
  return sorted[lo]+(sorted[hi]-sorted[lo])*(i-lo);
}
function blockSample(rs,random){
  const out=[],maxStart=rs.length-BLOCK;
  while(out.length<rs.length){
    const start=Math.floor(random()*(maxStart+1));
    for(let j=0;j<BLOCK&&out.length<rs.length;j++) out.push(rs[start+j]);
  }
  return out;
}
function pathStats(rs,riskPct){
  let equity=START,peak=START,maxDD=0,streak=0,maxStreak=0;
  const f=riskPct/100;
  for(const r of rs){
    equity*=Math.max(0,1+f*r);
    peak=Math.max(peak,equity);
    maxDD=Math.max(maxDD,peak>0?(peak-equity)/peak*100:0);
    streak=r<0?streak+1:0;
    maxStreak=Math.max(maxStreak,streak);
  }
  return {endingBalance:equity,returnPercent:(equity/START-1)*100,maxDD,maxStreak};
}
function mcStats(rows){
  const endings=rows.map(x=>x.endingBalance).sort((a,b)=>a-b);
  const returns=rows.map(x=>x.returnPercent).sort((a,b)=>a-b);
  const dds=rows.map(x=>x.maxDD).sort((a,b)=>a-b);
  const streaks=rows.map(x=>x.maxStreak).sort((a,b)=>a-b);
  return {
    endingBalance:{p05:pct(endings,.05),p50:pct(endings,.5),p95:pct(endings,.95)},
    returnPercent:{p05:pct(returns,.05),p50:pct(returns,.5),p95:pct(returns,.95)},
    maxDrawdownPercent:{p50:pct(dds,.5),p90:pct(dds,.9),p95:pct(dds,.95),p99:pct(dds,.99)},
    longestLosingStreak:{p50:pct(streaks,.5),p95:pct(streaks,.95),p99:pct(streaks,.99)},
    probabilityEndingBelowStart:rows.filter(x=>x.endingBalance<START).length/rows.length,
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

    const exact={};
    for(const risk of RISKS){
      const combo={id:`USDCHF_V2_RISK_${risk}`,risk:risk.toFixed(2),positions:1,daily:V2.dailyLimit,news:V2.newsPolicy,parameters:V2.parameters,objective:V2.objective};
      exact[risk]={
        base:compact(simulate({prepared,combo,schedule:[],costs:COSTS.BASE,from:prepared.from,to:prepared.to,symbols:[V2.symbol],startingBalance:START,entryFilter})),
        stress:compact(simulate({prepared,combo,schedule:[],costs:COSTS.STRESS,from:prepared.from,to:prepared.to,symbols:[V2.symbol],startingBalance:START,entryFilter}))
      };
    }

    const baselineCombo={id:"USDCHF_V2_RISK_MC",risk:"1.00",positions:1,daily:V2.dailyLimit,news:V2.newsPolicy,parameters:V2.parameters,objective:V2.objective};
    const baseline=simulate({prepared,combo:baselineCombo,schedule:[],costs:COSTS.BASE,from:prepared.from,to:prepared.to,symbols:[V2.symbol],startingBalance:START,entryFilter});
    const rs=baseline.trades.map(t=>t.rMultiple);
    if(rs.length!==29) throw new Error("RESEARCH_RISK_SIZING_EXPECTED_29_TRADES");

    const random=rng(SEED);
    const monteCarlo={};
    for(const risk of RISKS){
      const rows=[];
      for(let i=0;i<ITERATIONS;i++) rows.push(pathStats(blockSample(rs,random),risk));
      monteCarlo[risk]=mcStats(rows);
    }

    return json({
      ok:true,readOnlyTrading:true,safety:safe,inputHash:prepared.inputHash,candidate:V2,
      assumptions:{
        startingBalance:START,
        risksPercent:RISKS,
        exactEngine:"existing sizing constraints preserved: one-position cap=1% equity and lots hard-capped at 0.01",
        monteCarlo:"3-trade moving-block bootstrap using locked 29 baseline R-multiples; theoretical freely scalable fractional risk",
        iterationsPerRisk:ITERATIONS,
        blockLength:BLOCK,
        deterministicSeed:SEED
      },
      exactEngine:exact,
      monteCarlo
    });
  }catch(error){
    return NextResponse.json({ok:false,readOnlyTrading:true,error:String(error?.message||"RESEARCH_RISK_SIZING_FAILED")},{status:500,headers:{"Cache-Control":"no-store"}});
  }
}
