import { NextResponse } from "next/server";
import {
  getTradeById,
  getTradeByIdempotencyKey,
  getTradeByStrategyId,
  getTradeByBrokerPositionId,
  getTradeByBrokerOrderId,
  listRecentTrades,
  publicTradeView
} from "../../../../lib/tradeState";
import {
  tradeStateDbConfigured,
  tradeStateDbEnabled
} from "../../../../lib/db";

export async function GET(req) {
  try {
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

    if (!tradeStateDbEnabled()) {
      return NextResponse.json(
        {
          ok: false,
          configured: tradeStateDbConfigured(),
          enabled: false,
          error: tradeStateDbConfigured()
            ? "TRADE_STATE_DB_ENABLED=false"
            : "DATABASE_URL is not configured"
        },
        { status: 503 }
      );
    }

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    const idempotencyKey = searchParams.get("idempotencyKey");
    const strategyId = searchParams.get("strategyId");
    const positionId = searchParams.get("positionId");
    const orderId = searchParams.get("orderId");

    let trade = null;

    if (id) trade = await getTradeById(id);
    else if (idempotencyKey) {
      trade = await getTradeByIdempotencyKey(idempotencyKey);
    } else if (strategyId) {
      trade = await getTradeByStrategyId(strategyId);
    } else if (positionId) {
      trade = await getTradeByBrokerPositionId(positionId);
    } else if (orderId) {
      trade = await getTradeByBrokerOrderId(orderId);
    }

    if (id || idempotencyKey || strategyId || positionId || orderId) {
      return NextResponse.json({
        ok: true,
        trade: publicTradeView(trade)
      });
    }

    const rows = await listRecentTrades(searchParams.get("limit") || 50);

    return NextResponse.json({
      ok: true,
      trades: rows.map(publicTradeView)
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 }
    );
  }
}
