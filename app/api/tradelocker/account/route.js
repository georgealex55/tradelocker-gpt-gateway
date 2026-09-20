import { NextResponse } from "next/server";
import { tlFetch, accountId } from "../../../../lib/tradelocker";

export async function GET() {
  try {
    const data = await tlFetch(`/trade/accounts/${accountId()}/state`);
    return NextResponse.json({ok:true, environment:process.env.TRADELOCKER_ENV || "demo", data});
  } catch (e) {
    return NextResponse.json({ok:false,error:e.message},{status:500});
  }
}
