import { NextResponse } from "next/server";
import { tlFetch, accountId, validateOrder } from "../../../../lib/tradelocker";

export async function POST(req) {
  try {
    const approval = req.headers.get("x-trade-approval-key");
    if (!process.env.TRADE_APPROVAL_KEY || approval !== process.env.TRADE_APPROVAL_KEY) {
      return NextResponse.json({ok:false,error:"Approval key missing or invalid"},{status:403});
    }

    const body = await req.json();
    const order = validateOrder(body);

    if (process.env.TRADING_ENABLED !== "true") {
      return NextResponse.json({
        ok:true,
        dryRun:true,
        message:"Order validated but TRADING_ENABLED is not true.",
        order
      });
    }

    const data = await tlFetch(`/trade/accounts/${accountId()}/orders`, {
      method:"POST",
      body:JSON.stringify(order)
    });
    return NextResponse.json({ok:true,dryRun:false,order,data});
  } catch (e) {
    return NextResponse.json({ok:false,error:e.message},{status:400});
  }
}
