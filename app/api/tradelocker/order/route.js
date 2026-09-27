import { NextResponse } from "next/server";
import { tlFetch, accountId } from "../../../../lib/tradelocker";
import { buildRiskPreview } from "../../../../lib/risk";
import {
  assertExpectedAccount,
  findDuplicateStrategy,
  makeStrategyId,
  killSwitchEnabled
} from "../../../../lib/tradeGuard";
import {
  TRADE_STATES,
  createTradeRun,
  transitionTradeState,
  updateTradeFromPreview,
  updateTradeBrokerResponse,
  publicTradeView,
  markTradeError
} from "../../../../lib/tradeState";

export async function POST(req) {
  let trackedTrade = null;

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

    const tracking = await createTradeRun({
      idempotencyKey,
      strategyId,
      source: String(body.source || "manual").slice(0, 32),
      input: body,
      account,
      dryRun: process.env.TRADING_ENABLED !== "true"
    });

    trackedTrade = tracking.trade;

    if (tracking.enabled && !tracking.created) {
      return NextResponse.json(
        {
          ok: false,
          dryRun: trackedTrade?.dry_run ?? true,
          error: "Idempotency key already recorded",
          strategyId,
          trade: publicTradeView(trackedTrade)
        },
        { status: 409 }
      );
    }

    if (trackedTrade) {
      trackedTrade = await transitionTradeState(
        trackedTrade.id,
        TRADE_STATES.SIGNAL_VALIDATED,
        {
          eventType: "ORDER_REQUEST_VALIDATED",
          payload: { source: body.source || "manual" }
        }
      );
    }

    const preview = await buildRiskPreview({
      ...body,
      strategyId
    });

    if (trackedTrade) {
      trackedTrade = await updateTradeFromPreview(
        trackedTrade.id,
        preview,
        account
      );
    }

    if (!preview.ok) {
      if (trackedTrade) {
        trackedTrade = await transitionTradeState(
          trackedTrade.id,
          TRADE_STATES.RISK_REJECTED,
          {
            eventType: "RISK_REJECTED",
            payload: {
              failedChecks: preview.checks?.filter(check => !check.ok) || []
            }
          }
        );
      }

      return NextResponse.json(
        {
          ok: false,
          dryRun: process.env.TRADING_ENABLED !== "true",
          error: "Risk engine rejected order",
          account,
          strategyId,
          trade: publicTradeView(trackedTrade),
          preview
        },
        { status: 400 }
      );
    }

    if (trackedTrade) {
      trackedTrade = await transitionTradeState(
        trackedTrade.id,
        TRADE_STATES.RISK_APPROVED,
        {
          eventType: "RISK_APPROVED",
          payload: {
            riskPercent: preview.sizing?.estimatedRiskPercent ?? null,
            riskAmount: preview.sizing?.estimatedRiskAmount ?? null,
            riskReward: preview.sizing?.riskReward ?? null
          }
        }
      );
    }

    const duplicate = await findDuplicateStrategy(
      strategyId,
      preview.instrument?.tradableInstrumentId
    );

    if (duplicate.duplicate) {
      if (trackedTrade) {
        trackedTrade = await transitionTradeState(
          trackedTrade.id,
          TRADE_STATES.ORDER_REJECTED,
          {
            eventType: "DUPLICATE_ORDER_BLOCKED",
            payload: duplicate
          }
        );
      }

      return NextResponse.json(
        {
          ok: false,
          dryRun: process.env.TRADING_ENABLED !== "true",
          error: "Duplicate order blocked",
          account,
          duplicate,
          strategyId,
          trade: publicTradeView(trackedTrade)
        },
        { status: 409 }
      );
    }

    if (process.env.TRADING_ENABLED !== "true") {
      if (trackedTrade) {
        trackedTrade = await transitionTradeState(
          trackedTrade.id,
          TRADE_STATES.DRY_RUN_COMPLETE,
          {
            eventType: "DRY_RUN_COMPLETE",
            payload: { order: preview.order }
          }
        );
      }

      return NextResponse.json({
        ok: true,
        dryRun: true,
        message:
          "Risk and duplicate checks passed. TRADING_ENABLED=false, so no live order was submitted.",
        account,
        duplicate,
        strategyId,
        trade: publicTradeView(trackedTrade),
        preview,
        order: preview.order
      });
    }

    if (killSwitchEnabled()) {
      if (trackedTrade) {
        trackedTrade = await transitionTradeState(
          trackedTrade.id,
          TRADE_STATES.ORDER_REJECTED,
          {
            eventType: "KILL_SWITCH_BLOCKED",
            payload: { reason: "KILL_SWITCH is enabled or unset" }
          }
        );
      }

      return NextResponse.json(
        {
          ok: false,
          error: "KILL_SWITCH is enabled or unset",
          trade: publicTradeView(trackedTrade)
        },
        { status: 403 }
      );
    }

    const finalDuplicateCheck = await findDuplicateStrategy(
      strategyId,
      preview.instrument?.tradableInstrumentId
    );

    if (finalDuplicateCheck.duplicate) {
      if (trackedTrade) {
        trackedTrade = await transitionTradeState(
          trackedTrade.id,
          TRADE_STATES.ORDER_REJECTED,
          {
            eventType: "FINAL_DUPLICATE_ORDER_BLOCKED",
            payload: finalDuplicateCheck
          }
        );
      }

      return NextResponse.json(
        {
          ok: false,
          dryRun: false,
          error: "Duplicate order blocked immediately before execution",
          duplicate: finalDuplicateCheck,
          strategyId,
          trade: publicTradeView(trackedTrade)
        },
        { status: 409 }
      );
    }

    if (trackedTrade) {
      trackedTrade = await transitionTradeState(
        trackedTrade.id,
        TRADE_STATES.ORDER_SUBMITTED,
        {
          eventType: "ORDER_SUBMISSION_STARTED",
          payload: { order: preview.order }
        }
      );
    }

    let data;

    try {
      data = await tlFetch(`/trade/accounts/${accountId()}/orders`, {
        method: "POST",
        body: JSON.stringify(preview.order)
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

    let trackingWarning = null;

    if (trackedTrade) {
      try {
        trackedTrade = await updateTradeBrokerResponse(
          trackedTrade.id,
          data
        );
        trackedTrade = await transitionTradeState(
          trackedTrade.id,
          TRADE_STATES.ORDER_ACCEPTED,
          {
            eventType: "BROKER_ACCEPTED_ORDER",
            payload: { brokerResponse: data }
          }
        );
      } catch (trackingError) {
        trackingWarning = trackingError.message;
      }
    }

    return NextResponse.json({
      ok: true,
      dryRun: false,
      account,
      strategyId,
      trade: publicTradeView(trackedTrade),
      trackingWarning,
      preview,
      order: preview.order,
      data
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error.message,
        trade: publicTradeView(trackedTrade)
      },
      { status: 400 }
    );
  }
}
