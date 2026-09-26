import { NextResponse } from "next/server";
import { dbHealth } from "../../../../lib/db";

export async function GET(req) {
  const approval = req.headers.get("x-trade-approval-key");
  if (
    !process.env.TRADE_APPROVAL_KEY ||
    approval !== process.env.TRADE_APPROVAL_KEY
  ) {
    return NextResponse.json(
      { ok: false, error: "Approval key missing or invalid" },
      { status: 403 }
    );
  }

  const health = await dbHealth();
  return NextResponse.json(
    { ok: health.ok, database: health },
    { status: health.ok ? 200 : 503 }
  );
}
