import { NextResponse } from "next/server";
import { tlFetch, accountId } from "../../../../lib/tradelocker";

export async function GET() {
  try {
    const [state, config] = await Promise.all([
      tlFetch(`/trade/accounts/${accountId()}/state`),
      tlFetch("/trade/config")
    ]);

    return NextResponse.json({
      ok: true,
      environment: process.env.TRADELOCKER_ENV || "demo",
      state,
      config
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
