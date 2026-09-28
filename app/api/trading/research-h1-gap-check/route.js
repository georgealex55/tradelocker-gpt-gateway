import { NextResponse } from "next/server";
import { createCompletedTimeframeAggregator } from "../../../../lib/timeframes";
import { preparePair } from "../../../../lib/research/prepare.mjs";
import { M15 } from "../../../../lib/research/policies.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function check(condition,message){
  if(!condition) throw new Error(message);
}

export async function GET(){
  try{
    const agg=createCompletedTimeframeAggregator("1H");
    const start=Date.parse("2025-01-06T10:00:00Z");
    const make=(time,open,high,low,close)=>({time,open,high,low,close});
    const completed=[];

    for(let i=0;i<4;i++){
      const out=agg.add(make(start+i*M15,1.1000+i*0.0001,1.1010+i*0.0001,1.0990+i*0.0001,1.1005+i*0.0001));
      if(out) completed.push(out);
    }

    const h12=start+2*60*60*1000;
    for(let i=0;i<4;i++){
      const out=agg.add(make(h12+i*M15,1.2000+i*0.0001,1.2010+i*0.0001,1.1990+i*0.0001,1.2005+i*0.0001));
      if(out) completed.push(out);
    }
    const out=agg.add(make(start+3*60*60*1000,1.3000,1.3010,1.2990,1.3005));
    if(out) completed.push(out);

    check(completed.length===2,"EXPECTED_TWO_COMPLETE_H1_BARS");
    check(completed[0].time===start,"FIRST_H1_TIME_MISMATCH");
    check(completed[1].time===h12,"POST_GAP_H1_TIME_MISMATCH");
    check(Math.abs(completed[1].open-1.2)<1e-12,"POST_GAP_OPEN_CONTAMINATED");
    check(Math.abs(completed[1].high-1.2013)<1e-12,"POST_GAP_HIGH_CONTAMINATED");
    check(Math.abs(completed[1].low-1.199)<1e-12,"POST_GAP_LOW_CONTAMINATED");
    check(Math.abs(completed[1].close-1.2008)<1e-12,"POST_GAP_CLOSE_CONTAMINATED");
    check(completed[1].low>completed[0].high,"CROSS_GAP_OHLC_CONTAMINATION");

    const metadata={
      symbol:"EURUSD",pipSize:0.0001,lotSize:100000,minLot:0.01,lotStep:0.01,maxLot:50,
      baseCurrency:"EUR",quotingCurrency:"USD"
    };
    const pStart=Date.parse("2025-01-06T00:00:00Z");
    const candles=[];
    for(let i=0;i<1200;i++){
      const time=pStart+i*M15;
      const hour=Math.floor((time-pStart)/(60*60*1000));
      if(hour===150) continue;
      const v=1.1+Math.sin(i/30)*0.001+i*0.0000005;
      candles.push({time,open:v,close:v+0.00001,high:v+0.0001,low:v-0.0001});
    }
    const prepared=preparePair({metadata,candles});
    check(prepared?.tapes?.[20] && prepared?.tapes?.[25] && prepared?.tapes?.[30],"PREPARE_PAIR_FAILED_AFTER_FULL_HOUR_GAP");

    return NextResponse.json({
      ok:true,
      phase:"H1_GAP_INTEGRITY",
      crossGapAggregation:false,
      completedH1Times:completed.map(x=>new Date(x.time).toISOString()),
      postGapH1:completed[1],
      missingHour:"2025-01-06T11:00:00.000Z",
      preparePairAcceptedFullHourGap:true
    },{headers:{"Cache-Control":"no-store"}});
  }catch(error){
    return NextResponse.json({ok:false,phase:"H1_GAP_INTEGRITY",error:String(error?.message||error)},{status:500,headers:{"Cache-Control":"no-store"}});
  }
}
