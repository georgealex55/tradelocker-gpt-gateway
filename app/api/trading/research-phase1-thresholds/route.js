import { NextResponse } from "next/server";
import { killSwitchEnabled } from "../../../../lib/tradeGuard";
import { loadHistoryDataset } from "../../../../lib/research/historyStore";
import { validateDataset, preparePair } from "../../../../lib/research/prepare.mjs";
import { simulate } from "../../../../lib/research/engine.mjs";
import { SYMBOLS, COSTS } from "../../../../lib/research/policies.mjs";

export const runtime="nodejs";
export const dynamic="force-dynamic";
export const maxDuration=300;

const THRESHOLDS=[20,25,30,35,40,50,null];
const N=6;
const json=data=>NextResponse.json(data,{headers:{"Cache-Control":"no-store"}});

function safeState(){
  const tradingEnabled=String(process.env.TRADING_ENABLED||"false").toLowerCase()==="true";
  const killSwitch=killSwitchEnabled();
  if(tradingEnabled||!killSwitch) throw new Error("RESEARCH_REQUIRES_EXECUTION_DISABLED");
  return {tradingEnabled,killSwitch};
}
function gate(threshold){
  return ({hour,signal,metadata})=>{
    if(hour<10) return false;
    if(threshold==null) return true;
    const r=signal?.regime?.checks||{};
    const gap=Math.abs(Number(r.ema50)-Number(r.ema200))/metadata.pipSize;
    return Number.isFinite(gap)&&gap<=threshold;
  };
}
function met(sim){
  const m=sim.metrics;
  return {trades:m.tradeCount,pf:m.profitFactor,expectancyR:m.expectancyR,totalR:m.totalR,returnPercent:m.returnPercent,maxDD:m.maxDrawdownPercent};
}
function trainScore(rows){
  return {
    stressPos:rows.filter(x=>x.stress.expectancyR>0).length,
    basePos:rows.filter(x=>x.base.expectancyR>0).length,
    robustR:Math.min(rows.reduce((n,x)=>n+x.base.totalR,0),rows.reduce((n,x)=>n+x.stress.totalR,0)),
    stressTrades:rows.reduce((n,x)=>n+x.stress.trades,0)
  };
}
function better(a,b){
  if(a.score.stressPos!==b.score.stressPos) return b.score.stressPos-a.score.stressPos;
  if(a.score.basePos!==b.score.basePos) return b.score.basePos-a.score.basePos;
  if(a.score.robustR!==b.score.robustR) return b.score.robustR-a.score.robustR;
  return b.score.stressTrades-a.score.stressTrades;
}
function aggregate(rows,key){
  const x=rows.map(r=>r[key]);
  return {
    windows:x.length,
    positiveExpectancyWindows:x.filter(v=>v.expectancyR>0).length,
    positiveReturnWindows:x.filter(v=>v.returnPercent>0).length,
    totalTrades:x.reduce((n,v)=>n+v.trades,0),
    totalR:x.reduce((n,v)=>n+v.totalR,0),
    avgExpectancyR:x.reduce((n,v)=>n+v.expectancyR,0)/x.length,
    worstExpectancyR:Math.min(...x.map(v=>v.expectancyR)),
    maxWindowDD:Math.max(...x.map(v=>v.maxDD))
  };
}

export async function GET(){
  try{
    const safety=safeState();
    const dataset=await loadHistoryDataset();
    const prepared=validateDataset(dataset);
    for(const s of SYMBOLS) prepared.pairs[s]=preparePair(prepared.pairs[s]);

    const span=prepared.to-prepared.from;
    const windows=Array.from({length:N},(_,i)=>({
      index:i+1,
      from:Math.round(prepared.from+span*i/N),
      to:i===N-1?prepared.to:Math.round(prepared.from+span*(i+1)/N)
    }));
    const combo={id:"EMA_THRESHOLD_PHASE1",risk:"1.00",positions:1,daily:"PORTFOLIO",news:"STRICT_BLACKOUT",parameters:"SHARED",objective:"RETURN"};
    const results=[];

    for(let vi=1;vi<windows.length;vi++){
      const training=windows.slice(0,vi);
      const candidates=THRESHOLDS.map(threshold=>{
        const rows=training.map(w=>({
          base:met(simulate({prepared,combo,schedule:[],costs:COSTS.BASE,from:w.from,to:w.to,symbols:["USDCHF"],startingBalance:500,entryFilter:gate(threshold)})),
          stress:met(simulate({prepared,combo,schedule:[],costs:COSTS.STRESS,from:w.from,to:w.to,symbols:["USDCHF"],startingBalance:500,entryFilter:gate(threshold)}))
        }));
        return {threshold,score:trainScore(rows)};
      }).sort(better);

      const selected=candidates[0].threshold;
      const w=windows[vi];
      results.push({
        validationWindow:w.index,
        from:new Date(w.from).toISOString(),
        to:new Date(w.to).toISOString(),
        trainedOn:training.map(x=>x.index),
        selectedThreshold:selected==null?"NONE":selected,
        topCandidates:candidates.slice(0,4).map(c=>({threshold:c.threshold==null?"NONE":c.threshold,...c.score})),
        base:met(simulate({prepared,combo,schedule:[],costs:COSTS.BASE,from:w.from,to:w.to,symbols:["USDCHF"],startingBalance:500,entryFilter:gate(selected)})),
        stress:met(simulate({prepared,combo,schedule:[],costs:COSTS.STRESS,from:w.from,to:w.to,symbols:["USDCHF"],startingBalance:500,entryFilter:gate(selected)}))
      });
    }

    return json({
      ok:true,readOnlyTrading:true,safety,inputHash:prepared.inputHash,
      assumptions:{symbol:"USDCHF",capital:500,riskPercent:1,positions:1,hourGate:"10:00 UTC+",thresholds:[20,25,30,35,40,50,"NONE"],windowCount:N},
      results,
      summary:{base:aggregate(results,"base"),stress:aggregate(results,"stress")}
    });
  }catch(error){
    return NextResponse.json({ok:false,readOnlyTrading:true,error:"RESEARCH_PHASE1_THRESHOLD_FAILED"},{status:500,headers:{"Cache-Control":"no-store"}});
  }
}
