import { NextResponse } from "next/server";
import { calculateIndicators } from "../../../../lib/indicators";

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
    const candles = Array.isArray(body.candles) ? body.candles : [];

    if (!candles.length) {
      return NextResponse.json(
        { ok: false, error: "candles array is required" },
        { status: 400 }
      );
    }

    if (candles.length > 10000) {
      return NextResponse.json(
        { ok: false, error: "Maximum 10000 candles per request" },
        { status: 400 }
      );
    }

    const result = calculateIndicators(
      candles,
      body.indicatorConfig || {}
    );

    return NextResponse.json({
      ok: true,
      candlesProcessed: candles.length,
      latest: result.latest,
      snapshots:
        body.includeSnapshots === true
          ? result.snapshots
          : undefined
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 400 }
    );
  }
}
