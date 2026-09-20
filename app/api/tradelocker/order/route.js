import { NextResponse } from "next/server";
import { tlFetch, accountId } from "../../../../lib/tradelocker";
import { buildRiskPreview } from "../../../../lib/risk";

export async function POST(req) {
  try {
    const approval = req.headers.get("x-trade-approval-key");
    if (!process.env.TRADE_APPROVAL_KEY || approval !== process.env.TRADE_APPROVAL_KEY) {
      return NextResponse.json(
        { ok: false, error: "Approval key missing or invalid" },
        { status: 403 }
      );
    }

    const body = await req.json();
    const preview = await buildRiskPreview(body);

    if (!preview.ok) {
      return NextResponse.json(
        {
          ok: false,
          dryRun: process.env.TRADING_ENABLED !== "true",
          error: "Risk engine rejected order",
          preview
        },
        { status: 400 }
      );
    }

    if (process.env.TRADING_ENABLED !== "true") {
      return NextResponse.json({
        ok: true,
        dryRun: true,
        message: "Risk checks passed. TRADING_ENABLED is false, so no live order was submitted.",
        preview,
        order: preview.order
      });
    }

    if (process.env.KILL_SWITCH === "true") {
      return NextResponse.json(
        { ok: false, error: "KILL_SWITCH=true" },
        { status: 403 }
      );
    }

    const data = await tlFetch(`/trade/accounts/${accountId()}/orders`, {
      method: "POST",
      body: JSON.stringify(preview.order)
    });

    return NextResponse.json({
      ok: true,
      dryRun: false,
      preview,
      order: preview.order,
      data
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 400 });
  }
}