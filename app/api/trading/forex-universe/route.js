import { NextResponse } from "next/server";
import { listForexInstruments } from "../../../../lib/forexUniverse";

function approved(req) {
  const key = req.headers.get("x-trade-approval-key");
  return Boolean(
    process.env.TRADE_APPROVAL_KEY &&
    key === process.env.TRADE_APPROVAL_KEY
  );
}

export async function GET(req) {
  try {
    if (!approved(req)) {
      return NextResponse.json(
        { ok: false, error: "Approval key missing or invalid" },
        { status: 403 }
      );
    }

    const instruments = await listForexInstruments();

    return NextResponse.json({
      ok: true,
      readOnly: true,
      type: "FOREX",
      count: instruments.length,
      instruments
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, readOnly: true, error: error.message },
      { status: 500 }
    );
  }
}
