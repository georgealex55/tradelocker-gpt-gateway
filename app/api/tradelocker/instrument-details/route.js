import { NextResponse } from "next/server";
import { tlFetch } from "../../../../lib/tradelocker";

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);

    // Defaults to the USDCHF instrument/TRADE route discovered on this account.
    const tradableInstrumentId = Number(
      searchParams.get("tradableInstrumentId") || "7876"
    );
    const routeId = Number(
      searchParams.get("routeId") || "540005"
    );
    const symbol = searchParams.get("symbol") || "USDCHF";

    if (!Number.isInteger(tradableInstrumentId) || tradableInstrumentId <= 0) {
      return NextResponse.json(
        { ok: false, error: "tradableInstrumentId must be a positive integer" },
        { status: 400 }
      );
    }

    if (!Number.isInteger(routeId) || routeId <= 0) {
      return NextResponse.json(
        { ok: false, error: "routeId must be a positive integer" },
        { status: 400 }
      );
    }

    const data = await tlFetch(
      `/trade/instruments/${tradableInstrumentId}?routeId=${routeId}`
    );

    return NextResponse.json({
      ok: true,
      symbol,
      tradableInstrumentId,
      routeId,
      data
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e.message },
      { status: 500 }
    );
  }
}
