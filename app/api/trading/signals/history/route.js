import { NextResponse } from "next/server";
import { listRecentSignalObservations } from "../../../../../lib/db";

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

    const { searchParams } = new URL(req.url);
    const limit = Number(searchParams.get("limit") || "100");

    const signals = await listRecentSignalObservations(limit);

    return NextResponse.json({
      ok: true,
      databaseEnabled: Boolean(process.env.DATABASE_URL),
      count: signals.length,
      signals
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 }
    );
  }
}
