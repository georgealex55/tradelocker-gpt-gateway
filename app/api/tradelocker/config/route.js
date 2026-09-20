import { NextResponse } from "next/server";
import { tlFetch } from "../../../../lib/tradelocker";

export async function GET() {
  try {
    const data = await tlFetch("/trade/config");
    return NextResponse.json({ ok: true, data });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
