import { NextResponse } from "next/server";
import {
  runBacktest,
  strategyFromSignals
} from "../../../../lib/backtest";

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
    const signals = Array.isArray(body.signals) ? body.signals : [];

    if (candles.length < 2) {
      return NextResponse.json(
        { ok: false, error: "At least 2 candles are required" },
        { status: 400 }
      );
    }

    if (candles.length > 50000) {
      return NextResponse.json(
        { ok: false, error: "Maximum 50000 candles per request" },
        { status: 400 }
      );
    }

    const result = await runBacktest({
      candles,
      strategy: strategyFromSignals(signals),
      indicatorConfig: body.indicatorConfig || {},
      options: body.options || {}
    });

    return NextResponse.json({
      ok: true,
      simulated: true,
      strategyMode: "explicit-signals",
      result
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, simulated: true, error: error.message },
      { status: 400 }
    );
  }
}
