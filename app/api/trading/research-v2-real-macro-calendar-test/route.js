import { NextResponse } from "next/server";
import { isInsideBlackout } from "../../../../lib/eventRisk";
import { upcomingUsdChfMacroCalendar } from "../../../../lib/research/upcomingUsdChfMacroCalendar.mjs";

export const runtime="nodejs";
export const dynamic="force-dynamic";

export async function GET(){
  try{
    const now=Date.now();
    const calendar=upcomingUsdChfMacroCalendar(now);
    const next=calendar.nextEvent;
    if(!next) throw new Error("NO_UPCOMING_USDCHF_MACRO_EVENT");

    const atEvent=isInsideBlackout({
      symbol:"USDCHF",
      time:next.eventTime,
      blackouts:calendar.events
    });

    const before=isInsideBlackout({
      symbol:"USDCHF",
      time:Date.parse(next.from)-1,
      blackouts:calendar.events
    });

    const after=isInsideBlackout({
      symbol:"USDCHF",
      time:Date.parse(next.to)+1,
      blackouts:calendar.events
    });

    const assertions={
      nextEventFound:Boolean(next),
      blocksAtEvent:atEvent.blocked===true,
      expectedName:atEvent.name===next.name,
      outsideBefore:before.blocked===false,
      outsideAfter:after.blocked===false
    };

    if(!Object.values(assertions).every(Boolean)){
      throw new Error("REAL_MACRO_CALENDAR_ASSERTION_FAILED");
    }

    return NextResponse.json({
      ok:true,
      mode:"V2_REAL_MACRO_CALENDAR_TEST",
      reviewedAt:calendar.reviewedAt,
      coverageThrough:calendar.coverageThrough,
      nextEvent:next,
      atEvent,
      assertions,
      remainingEvents:calendar.events.length
    },{headers:{"Cache-Control":"no-store"}});
  }catch(error){
    return NextResponse.json({ok:false,error:String(error?.message||error)},{status:500,headers:{"Cache-Control":"no-store"}});
  }
}
