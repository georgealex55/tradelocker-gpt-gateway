import { NextResponse } from "next/server";
import { killSwitchEnabled } from "../../../../lib/tradeGuard";
import { loadHistoryDataset } from "../../../../lib/research/historyStore";
import { validateDataset, preparePair } from "../../../../lib/research/prepare.mjs";
import { simulate } from "../../../../lib/research/engine.mjs";
import { SYMBOLS, COSTS } from "../../../../lib/research/policies.mjs";

export const runtime="nodejs";
export const dynamic="force-dynamic";
export const maxDuration=300;

const N=6;
const json=data=>NextResponse.json(data,{headers:{"Cache-Control":"no-store"}});

function safety(){
  const tradingEnabled=String(process.env.TRADING_ENABLED||"false").toLowerCase()==="true";
  const killSwitch=killSwitchEnabled();
  if(tradingEnabled||!killSwitch) throw new Error("RESEARCH_REQUIRES_EXECUTION_DISABLED");
  return {tradingEnabled,killSwitch};
}
function metrics(sim){
  const m=sim.metrics;
  return {trades:m.tradeCount,pf:m.profitFactor,expectancyR:m.expectancyR,totalR:m.totalR,returnPercent:m.returnPercent,maxDD:m.maxDrawdownPercent};
}
function getF(ctx){
  const r=ctx.signal?.regime?.checks||{}, i=ctx.signal?.indicators||{}, pip=ctx.metadata.pipSize;
  return {
    adx:Number(r.adx),
    emaGap:Math.abs(Number(r.ema50)-Number(r.ema200))/pip,
    priceDist:Math.abs(Number(r.close)-Number(r.ema200))/pip,
    atr:Number(i.atr)/pip,
    side:ctx.signal?.action
  };
}
const gates=[
  {id:"HOUR_10_PLUS",fn:c=>c.hour>=10},
  {id:"HOUR_10_PLUS_SELL_ONLY",fn:c=>c.hour>=10&&c.signal?.action==="SELL"},
  {id:"HOUR_10_PLUS_ATR_5_7",fn:c=>{const f=getF(c);return c.hour>=10&&f.atr>=5&&f.atr<=7}},
  {id:"HOUR_10_PLUS_ADX_30_PLUS",fn:c=>{const f=getF(c);return c.hour>=10&&f.adx>=30}},
  {id:"HOUR_10_PLUS_EMA_GAP_LE_30",fn:c=>{const f=getF(c);return c.hour>=10&&f.emaGap<=30}},
  {id:"HOUR_10_PLUS_PRICE_DIST_40_70",fn:c=>{const f=getF(c);return c.hour>=10&&f.priceDist>=40&&f.priceDist<=70}}
];

function summarize(rows,side){
  const x=rows.map(r=>r[side]);
  return {
    positiveExpectancyWindows:x.filter(v=>v.expectancyR>0).length,
    pfAboveOneWindows:x.filter(v=>Number(v.pf)>1).length,
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
    const safe=safety();
    const dataset=await loadHistoryDataset();
    const prepared=validateDataset(dataset);
    for(const s of SYMBOLS) prepared.pairs[s]=preparePair(prepared.pairs[s]);
    const span=prepared.to-prepared.from;
    const windows=Array.from({length:N},(_,i)=>({
      i:i+1,from:Math.round(prepared.from+span*i/N),
      to:i===N-1?prepared.to:Math.round(prepared.from+span*(i+1)/N)
    }));
    const combo={id:"REGIME_GATE",risk:"1.00",positions:1,daily:"PORTFOLIO",news:"STRICT_BLACKOUT",parameters:"SHARED",objective:"RETURN"};
    const out={};
    for(const g of gates){
      const rows=windows.map(w=>({
        window:w.i,
        from:new Date(w.from).toISOString(),
        to:new Date(w.to).toISOString(),
        base:metrics(simulate({prepared,combo,schedule:[],costs:COSTS.BASE,from:w.from,to:w.to,symbols:["USDCHF"],startingBalance:500,entryFilter:g.fn})),
        stress:metrics(simulate({prepared,combo,schedule:[],costs:COSTS.STRESS,from:w.from,to:w.to,symbols:["USDCHF"],startingBalance:500,entryFilter:g.fn}))
      }));
      out[g.id]={windows:rows,baseSummary:summarize(rows,"base"),stressSummary:summarize(rows,"stress")};
    }
    return json({ok:true,readOnlyTrading:true,safety:safe,inputHash:prepared.inputHash,byGate:out});
  }catch(error){
    return NextResponse.json({ok:false,readOnlyTrading:true,error:"RESEARCH_REGIME_GATE_FAILED"},{status:500,headers:{"Cache-Control":"no-store"}});
  }
}
