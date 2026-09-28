import { NextResponse } from "next/server";
import { killSwitchEnabled } from "../../../../lib/tradeGuard";
import { loadHistoryDataset } from "../../../../lib/research/historyStore";
import { validateDataset, preparePair } from "../../../../lib/research/prepare.mjs";
import { simulate } from "../../../../lib/research/engine.mjs";
import { SYMBOLS, COSTS } from "../../../../lib/research/policies.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const N = 6;
const json = data => NextResponse.json(data, {headers:{"Cache-Control":"no-store"}});

function safety(){
  const tradingEnabled=String(process.env.TRADING_ENABLED||"false").toLowerCase()==="true";
  const killSwitch=killSwitchEnabled();
  if(tradingEnabled||!killSwitch) throw new Error("RESEARCH_REQUIRES_EXECUTION_DISABLED");
  return {tradingEnabled,killSwitch};
}
const mean=a=>a.length?a.reduce((n,x)=>n+x,0)/a.length:null;
const median=a=>{if(!a.length)return null;const s=[...a].sort((x,y)=>x-y),m=Math.floor(s.length/2);return s.length%2?s[m]:(s[m-1]+s[m])/2};

function enrich(t,prepared){
  const sig=prepared.pairs.USDCHF.tapes[t.selectedAdx]?.[t.signalTime]||{};
  const r=sig.regime?.checks||{}, i=sig.indicators||{}, pip=prepared.pairs.USDCHF.metadata.pipSize;
  return {
    ...t,
    h1Adx:Number(r.adx),
    h1EmaGapPips: Math.abs(Number(r.ema50)-Number(r.ema200))/pip,
    h1PriceToEma200Pips: Math.abs(Number(r.close)-Number(r.ema200))/pip,
    m15AtrPips:Number(i.atr)/pip,
    side:t.side
  };
}
function features(rows){
  return {
    trades:rows.length,
    buyShare:rows.length?rows.filter(r=>r.side==="BUY").length/rows.length:null,
    avgAdx:mean(rows.map(r=>r.h1Adx).filter(Number.isFinite)),
    medianAdx:median(rows.map(r=>r.h1Adx).filter(Number.isFinite)),
    avgAtrPips:mean(rows.map(r=>r.m15AtrPips).filter(Number.isFinite)),
    medianAtrPips:median(rows.map(r=>r.m15AtrPips).filter(Number.isFinite)),
    avgEmaGapPips:mean(rows.map(r=>r.h1EmaGapPips).filter(Number.isFinite)),
    medianEmaGapPips:median(rows.map(r=>r.h1EmaGapPips).filter(Number.isFinite)),
    avgPriceToEma200Pips:mean(rows.map(r=>r.h1PriceToEma200Pips).filter(Number.isFinite)),
    medianPriceToEma200Pips:median(rows.map(r=>r.h1PriceToEma200Pips).filter(Number.isFinite))
  };
}

export async function GET(){
  try{
    const safe=safety();
    const dataset=await loadHistoryDataset();
    const prepared=validateDataset(dataset);
    for(const s of SYMBOLS) prepared.pairs[s]=preparePair(prepared.pairs[s]);
    const span=prepared.to-prepared.from;
    const windows=Array.from({length:N},(_,i)=>({
      index:i+1,
      from:Math.round(prepared.from+span*i/N),
      to:i===N-1?prepared.to:Math.round(prepared.from+span*(i+1)/N)
    }));
    const combo={id:"REGIME_DIAGNOSTIC",risk:"1.00",positions:1,daily:"PORTFOLIO",news:"STRICT_BLACKOUT",parameters:"SHARED",objective:"RETURN"};
    const rows=windows.map(w=>{
      const sim=simulate({prepared,combo,schedule:[],costs:COSTS.BASE,from:w.from,to:w.to,symbols:["USDCHF"],startingBalance:500,entryFilter:({hour})=>hour>=10});
      const trades=sim.trades.map(t=>enrich(t,prepared));
      return {
        window:w.index,from:new Date(w.from).toISOString(),to:new Date(w.to).toISOString(),
        performance:{trades:sim.metrics.tradeCount,totalR:sim.metrics.totalR,expectancyR:sim.metrics.expectancyR,profitFactor:sim.metrics.profitFactor,returnPercent:sim.metrics.returnPercent},
        features:features(trades)
      };
    });
    return json({ok:true,readOnlyTrading:true,safety:safe,inputHash:prepared.inputHash,windows:rows});
  }catch(error){
    return NextResponse.json({ok:false,readOnlyTrading:true,error:"RESEARCH_REGIME_DIAGNOSTIC_FAILED"},{status:500,headers:{"Cache-Control":"no-store"}});
  }
}
