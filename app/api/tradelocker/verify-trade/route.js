import { NextResponse } from "next/server";
import { tlFetch, accountId } from "../../../../lib/tradelocker";
import { assertExpectedAccount } from "../../../../lib/tradeGuard";
import {
  decodeTradeTable,
  matchRows
} from "../../../../lib/tables";

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const orderId = searchParams.get("orderId");
    const positionId = searchParams.get("positionId");
    const strategyId = searchParams.get("strategyId");

    if (!orderId && !positionId && !strategyId) {
      return NextResponse.json(
        { ok: false, error: "Provide orderId, positionId, or strategyId" },
        { status: 400 }
      );
    }

    const account = await assertExpectedAccount();

    const now = Date.now();
    const lookbackHours = Number(process.env.VERIFY_LOOKBACK_HOURS || "168");
    const from = now - Math.max(1, lookbackHours) * 60 * 60 * 1000;

    const [config, pendingRaw, positionsRaw, historyRaw] = await Promise.all([
      tlFetch("/trade/config"),
      tlFetch(`/trade/accounts/${accountId()}/orders`),
      tlFetch(`/trade/accounts/${accountId()}/positions`),
      tlFetch(
        `/trade/accounts/${accountId()}/ordersHistory?from=${from}&to=${now}`
      )
    ]);

    const pending = decodeTradeTable(
      pendingRaw,
      config,
      "ordersConfig",
      ["orders", "ordersData"]
    );
    const positions = decodeTradeTable(
      positionsRaw,
      config,
      "positionsConfig",
      ["positions", "positionsData"]
    );
    const history = decodeTradeTable(
      historyRaw,
      config,
      "ordersHistoryConfig",
      ["ordersHistory", "ordersHistoryData"]
    );

    const query = { orderId, positionId, strategyId };
    const pendingMatches = matchRows(pending, query);
    const historyMatches = matchRows(history, query);

    const mappedPositionIds = new Set(
      historyMatches
        .map(row => row.positionId)
        .filter(v => v != null)
        .map(v => String(v))
    );
    if (positionId) mappedPositionIds.add(String(positionId));

    let positionMatches = matchRows(positions, query);
    if (mappedPositionIds.size) {
      positionMatches = positions.filter(row =>
        mappedPositionIds.has(String(row.positionId ?? row.id ?? ""))
      );
    }

    const finalOrder = historyMatches[0] || null;
    const openPosition = positionMatches[0] || null;
    const pendingOrder = pendingMatches[0] || null;

    return NextResponse.json({
      ok: true,
      account,
      query,
      verified: {
        finalOrderFound: Boolean(finalOrder),
        pendingOrderFound: Boolean(pendingOrder),
        openPositionFound: Boolean(openPosition),
        mappedPositionId:
          finalOrder?.positionId ??
          openPosition?.positionId ??
          openPosition?.id ??
          null,
        stopLoss:
          openPosition?.stopLoss ??
          finalOrder?.stopLoss ??
          null,
        takeProfit:
          openPosition?.takeProfit ??
          finalOrder?.takeProfit ??
          null,
        strategyId:
          openPosition?.strategyId ??
          finalOrder?.strategyId ??
          pendingOrder?.strategyId ??
          null
      },
      matches: {
        pending: pendingMatches,
        history: historyMatches,
        positions: positionMatches
      }
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e.message },
      { status: 500 }
    );
  }
}