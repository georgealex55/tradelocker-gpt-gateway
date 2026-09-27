import { NextResponse } from "next/server";
import { tlFetch } from "../../../../lib/tradelocker";
import {
  assertExpectedAccount,
  makeStrategyId,
  killSwitchEnabled
} from "../../../../lib/tradeGuard";
import {
  TRADE_STATES,
  getTradeByBrokerPositionId,
  transitionTradeState,
  recordTradeEvent,
  updateTradeBrokerResponse,
  publicTradeView,
  markTradeError
} from "../../../../lib/tradeState";

export async function POST(req) {
  let trackedTrade = null;
  let trackingWarning = null;

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
        {
          ok: false,
          error:
            "qty must be 0 for full close or a positive lot quantity for partial close"
        },
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

    try {
      trackedTrade = await getTradeByBrokerPositionId(positionId);
    } catch (error) {
      trackingWarning = error.message;
    }

    if (process.env.TRADING_ENABLED !== "true") {
      if (trackedTrade) {
        try {
          await recordTradeEvent(trackedTrade.id, "CLOSE_DRY_RUN", {
            fromState: trackedTrade.state,
            toState: trackedTrade.state,
            payload: {
              positionId,
              qty,
              strategyId
            }
          });
        } catch (error) {
          trackingWarning = error.message;
        }
      }

      return NextResponse.json({
        ok: true,
        dryRun: true,
        message:
          "Close request validated. TRADING_ENABLED=false, so the position was not closed.",
        account,
        positionId,
        strategyId,
        trade: publicTradeView(trackedTrade),
        trackingWarning,
        request: {
          method: "DELETE",
          path,
          body: payload
        }
      });
    }

    if (trackedTrade) {
      try {
        if (qty === 0) {
          trackedTrade = await transitionTradeState(
            trackedTrade.id,
            TRADE_STATES.CLOSE_REQUESTED,
            {
              eventType: "FULL_CLOSE_REQUESTED",
              payload: {
                positionId,
                strategyId
              }
            }
          );
        } else {
          await recordTradeEvent(trackedTrade.id, "PARTIAL_CLOSE_REQUESTED", {
            fromState: trackedTrade.state,
            toState: trackedTrade.state,
            payload: {
              positionId,
              qty,
              strategyId
            }
          });
        }
      } catch (error) {
        trackingWarning = error.message;
      }
    }

    let data;

    try {
      data = await tlFetch(path, {
        method: "DELETE",
        body: JSON.stringify(payload)
      });
    } catch (error) {
      if (trackedTrade) {
        await markTradeError(
          trackedTrade.id,
          error,
          TRADE_STATES.EXECUTION_UNKNOWN
        ).catch(() => null);
      }
      throw error;
    }

    if (trackedTrade) {
      try {
        trackedTrade = await updateTradeBrokerResponse(
          trackedTrade.id,
          { closeResponse: data },
          { positionId }
        );

        await recordTradeEvent(trackedTrade.id, "CLOSE_SUBMITTED", {
          fromState: trackedTrade.state,
          toState: trackedTrade.state,
          payload: {
            positionId,
            qty,
            strategyId,
            brokerResponse: data
          }
        });
      } catch (error) {
        trackingWarning = error.message;
      }
    }

    return NextResponse.json({
      ok: true,
      dryRun: false,
      account,
      positionId,
      strategyId,
      trade: publicTradeView(trackedTrade),
      trackingWarning,
      data
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error.message,
        trade: publicTradeView(trackedTrade),
        trackingWarning
      },
      { status: 400 }
    );
  }
}
