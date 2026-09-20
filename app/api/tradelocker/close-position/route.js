import { NextResponse } from "next/server";
import { tlFetch } from "../../../../lib/tradelocker";
import {
  assertExpectedAccount,
  makeStrategyId,
  killSwitchEnabled
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

    if (killSwitchEnabled()) {
      return NextResponse.json(
        { ok: false, error: "KILL_SWITCH is enabled or unset" },
        { status: 403 }
      );
    }

    const body = await req.json();
    const positionId = Number(body.positionId);
    const qty = body.qty == null ? 0 : Number(body.qty);

    if (!Number.isInteger(positionId) || positionId <= 0) {
      return NextResponse.json(
        { ok: false, error: "positionId must be a positive integer" },
        { status: 400 }
      );
    }

    if (!Number.isFinite(qty) || qty < 0) {
      return NextResponse.json(
        { ok: false, error: "qty must be 0 for full close or a positive lot quantity for partial close" },
        { status: 400 }
      );
    }

    const account = await assertExpectedAccount();
    const closeKey =
      body.idempotencyKey ||
      `close-${positionId}-${qty}`;
    const strategyId = makeStrategyId(closeKey);

    const payload = { qty };
    const path =
      `/trade/positions/${positionId}?strategyId=${encodeURIComponent(strategyId)}`;

    if (process.env.TRADING_ENABLED !== "true") {
      return NextResponse.json({
        ok: true,
        dryRun: true,
        message: "Close request validated. TRADING_ENABLED=false, so the position was not closed.",
        account,
        positionId,
        strategyId,
        request: {
          method: "DELETE",
          path,
          body: payload
        }
      });
    }

    const data = await tlFetch(path, {
      method: "DELETE",
      body: JSON.stringify(payload)
    });

    return NextResponse.json({
      ok: true,
      dryRun: false,
      account,
      positionId,
      strategyId,
      data
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e.message },
      { status: 400 }
    );
  }
}