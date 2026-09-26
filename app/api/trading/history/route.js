import { NextResponse } from "next/server";
import { fetchTradeLockerHistory } from "../../../../lib/marketData";

function approved(req) {
  const key = req.headers.get("x-trade-approval-key");
  return Boolean(
    process.env.TRADE_APPROVAL_KEY &&
    key === process.env.TRADE_APPROVAL_KEY
  );
}

export async function POST(req) {
  try {
    if (!approved(req)) {
      return NextResponse.json(
        { ok: false, error: "Approval key missing or invalid" },
        { status: 403 }
      );
    }

    const body = await req.json();
    const result = await fetchTradeLockerHistory(body || {});

    return NextResponse.json({
      ok: true,
      readOnly: true,
      result
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, readOnly: true, error: error.message },
      { status: 400 }
    );
  }
}
