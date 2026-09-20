import { NextResponse } from "next/server";
import { tlFetch, accountId } from "../../../../lib/tradelocker";
import { buildRiskPreview } from "../../../../lib/risk";
import {
  assertExpectedAccount,
  findDuplicateStrategy,
  makeStrategyId
} from "../../../../lib/tradeGuard";

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
    const idempotencyKey = body.idempotencyKey || body.clientOrderId || null;
    const idempotencyRequired =
      String(process.env.IDEMPOTENCY_REQUIRED || "true").toLowerCase() === "true";

    if (idempotencyRequired && !idempotencyKey) {
      return NextResponse.json(
        { ok: false, error: "idempotencyKey is required" },
        { status: 400 }
      );
    }

    const strategyId = idempotencyKey
      ? makeStrategyId(idempotencyKey)
      : String(body.strategyId || "chatgpt-gateway").slice(0, 31);

    const account = await assertExpectedAccount();

    const preview = await buildRiskPreview({
      ...body,
      strategyId
    });

    if (!preview.ok) {
      return NextResponse.json(
        {
          ok: false,
          dryRun: process.env.TRADING_ENABLED !== "true",
          error: "Risk engine rejected order",
          account,
          strategyId,
          preview
        },
        { status: 400 }
      );
    }

    const duplicate = await findDuplicateStrategy(
      strategyId,
      preview.instrument?.tradableInstrumentId
    );

    if (duplicate.duplicate) {
      return NextResponse.json(
        {
          ok: false,
          dryRun: process.env.TRADING_ENABLED !== "true",
          error: "Duplicate order blocked",
          account,
          duplicate,
          strategyId
        },
        { status: 409 }
      );
    }

    if (process.env.TRADING_ENABLED !== "true") {
      return NextResponse.json({
        ok: true,
        dryRun: true,
        message: "Risk and duplicate checks passed. TRADING_ENABLED=false, so no live order was submitted.",
        account,
        duplicate,
        strategyId,
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

    // Check again immediately before submission to reduce retry/race duplicates.
    const finalDuplicateCheck = await findDuplicateStrategy(
      strategyId,
      preview.instrument?.tradableInstrumentId
    );

    if (finalDuplicateCheck.duplicate) {
      return NextResponse.json(
        {
          ok: false,
          dryRun: false,
          error: "Duplicate order blocked immediately before execution",
          duplicate: finalDuplicateCheck,
          strategyId
        },
        { status: 409 }
      );
    }

    const data = await tlFetch(`/trade/accounts/${accountId()}/orders`, {
      method: "POST",
      body: JSON.stringify(preview.order)
    });

    return NextResponse.json({
      ok: true,
      dryRun: false,
      account,
      strategyId,
      preview,
      order: preview.order,
      data
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 400 });
  }
}