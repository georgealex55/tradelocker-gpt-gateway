import { NextResponse } from "next/server";
import {
  scanPreferredForexSignals
} from "../../../../lib/forexSignals";

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

    const result = await scanPreferredForexSignals();

    return NextResponse.json({
      ok: true,
      readOnly: true,
      result
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, readOnly: true, error: error.message },
      { status: 500 }
    );
  }
}
