import { NextResponse } from "next/server";
import { dbHealth, dbQuery } from "../../../../lib/db";
import { killSwitchEnabled } from "../../../../lib/tradeGuard";
import {
  TRADE_STATES,
  createTradeRun,
  transitionTradeState,
  updateTradeFromPreview,
  publicTradeView
} from "../../../../lib/tradeState";

export const dynamic = "force-dynamic";

export async function GET() {
  if (process.env.VERCEL_ENV === "production") {
    return NextResponse.json(
      { ok: false, error: "Preview-only lifecycle self-test" },
      { status: 404 }
    );
  }

  if (String(process.env.TRADING_ENABLED).toLowerCase() === "true") {
    return NextResponse.json(
      {
        ok: false,
        error: "Refusing lifecycle self-test while TRADING_ENABLED=true"
      },
      { status: 409 }
    );
  }

  if (!killSwitchEnabled()) {
    return NextResponse.json(
      {
        ok: false,
        error: "Refusing lifecycle self-test while KILL_SWITCH is disabled"
      },
      { status: 409 }
    );
  }

  const health = await dbHealth();
  if (!health.ok) {
    return NextResponse.json(
      { ok: false, stage: "database", database: health },
      { status: 500 }
    );
  }

  const idempotencyKey =
    `dryrun-lifecycle-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 8)}`;

  const strategyId = "dryrun-lifecycle-selftest";

  const input = {
    symbol: "USDCHF",
    side: "buy",
    type: "market",
    lots: 0.01,
    qty: 1000,
    tradeRouteId: 540005,
    infoRouteId: 540002,
    tradableInstrumentId: 7876,
    entryPrice: 0.8,
    stopLoss: 0.79875,
    takeProfit: 0.80225
  };

  const syntheticPreview = {
    ok: true,
    account: {
      id: "PREVIEW_SELF_TEST",
      balance: 500
    },
    instrument: {
      symbol: "USDCHF",
      tradeRouteId: 540005,
      infoRouteId: 540002,
      tradableInstrumentId: 7876
    },
    sizing: {
      equity: 500,
      lots: 0.01,
      units: 1000,
      entryPrice: 0.8,
      stopLoss: 0.79875,
      takeProfit: 0.80225,
      riskReward: 1.8,
      estimatedRiskAmount: 1.5625,
      estimatedRiskPercent: 0.3125
    },
    exposure: {
      openPositions: 0,
      pendingOrders: 0
    },
    quote: {
      bid: 0.7999,
      ask: 0.8,
      spreadPips: 1
    },
    order: {
      symbol: "USDCHF",
      side: "buy",
      type: "market",
      lots: 0.01,
      stopLoss: 0.79875,
      takeProfit: 0.80225
    },
    selfTest: true
  };

  try {
    const created = await createTradeRun({
      idempotencyKey,
      strategyId,
      source: "lifecycle-self-test",
      input,
      account: { id: "PREVIEW_SELF_TEST" },
      dryRun: true
    });

    if (!created.enabled || !created.created || !created.trade) {
      throw new Error("Initial trade-state record was not created");
    }

    let trade = created.trade;

    trade = await transitionTradeState(
      trade.id,
      TRADE_STATES.SIGNAL_VALIDATED,
      {
        eventType: "ORDER_REQUEST_VALIDATED",
        payload: { selfTest: true }
      }
    );

    trade = await updateTradeFromPreview(
      trade.id,
      syntheticPreview,
      syntheticPreview.account
    );

    trade = await transitionTradeState(
      trade.id,
      TRADE_STATES.RISK_APPROVED,
      {
        eventType: "RISK_APPROVED",
        payload: {
          selfTest: true,
          riskPercent:
            syntheticPreview.sizing.estimatedRiskPercent,
          riskAmount:
            syntheticPreview.sizing.estimatedRiskAmount,
          riskReward: syntheticPreview.sizing.riskReward
        }
      }
    );

    trade = await transitionTradeState(
      trade.id,
      TRADE_STATES.DRY_RUN_COMPLETE,
      {
        eventType: "DRY_RUN_COMPLETE",
        payload: {
          selfTest: true,
          brokerOrderSubmitted: false,
          order: syntheticPreview.order
        }
      }
    );

    const duplicate = await createTradeRun({
      idempotencyKey,
      strategyId,
      source: "lifecycle-self-test",
      input,
      account: { id: "PREVIEW_SELF_TEST" },
      dryRun: true
    });

    const events = await dbQuery(
      `select event_type, from_state, to_state, created_at
       from trade_events
       where trade_id = $1
       order by id asc`,
      [trade.id]
    );

    const snapshots = await dbQuery(
      `select id, account_id, equity, balance, open_positions,
              pending_orders, created_at
       from account_snapshots
       where trade_id = $1
       order by created_at asc`,
      [trade.id]
    );

    const expectedEvents = [
      "TRADE_CREATED",
      "ORDER_REQUEST_VALIDATED",
      "RISK_APPROVED",
      "DRY_RUN_COMPLETE"
    ];

    const eventNames = events.map(row => row.event_type);

    const assertions = {
      finalState:
        trade.state === TRADE_STATES.DRY_RUN_COMPLETE,
      dryRunFlag: trade.dry_run === true,
      noBrokerOrder:
        trade.broker_order_id == null &&
        trade.broker_position_id == null,
      eventSequence:
        expectedEvents.every(
          (name, index) => eventNames[index] === name
        ),
      accountSnapshot: snapshots.length >= 1,
      idempotencyProtected:
        duplicate.enabled === true &&
        duplicate.created === false &&
        duplicate.trade?.id === trade.id
    };

    const ok = Object.values(assertions).every(Boolean);

    return NextResponse.json({
      ok,
      mode: "PREVIEW_SYNTHETIC_DRY_RUN",
      liveExecutionPossible: false,
      safety: {
        tradingEnabled: false,
        killSwitchEnabled: true,
        brokerOrderSubmitted: false
      },
      database: {
        database: health.database,
        schemaReady: health.schemaReady
      },
      trade: publicTradeView(trade),
      events,
      accountSnapshots: snapshots,
      idempotency: {
        key: idempotencyKey,
        duplicateCreated: duplicate.created,
        existingTradeId: duplicate.trade?.id || null
      },
      assertions
    });
  } catch (error) {
    console.error("[dry-run-lifecycle] failed", {
      message: error.message
    });

    return NextResponse.json(
      {
        ok: false,
        mode: "PREVIEW_SYNTHETIC_DRY_RUN",
        liveExecutionPossible: false,
        error: error.message
      },
      { status: 500 }
    );
  }
}
