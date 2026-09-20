import { NextResponse } from "next/server";
import { tlFetch } from "../../../../lib/tradelocker";
import { normalizeQuote } from "../../../../lib/risk";

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const tradableInstrumentId = Number(searchParams.get("tradableInstrumentId") || "7876");
    const routeId = Number(searchParams.get("routeId") || "540002");
    const symbol = String(searchParams.get("symbol") || "USDCHF").toUpperCase();

    const raw = await tlFetch(
      `/trade/quotes?routeId=${routeId}&tradableInstrumentId=${tradableInstrumentId}`
    );

    return NextResponse.json({
      ok: true,
      symbol,
      tradableInstrumentId,
      routeId,
      quote: normalizeQuote(raw),
      raw
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}