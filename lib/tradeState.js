import crypto from "crypto";
import { dbQuery, tradeStateDbEnabled } from "./db";

export const TRADE_STATES = Object.freeze({
  SIGNAL_CREATED: "SIGNAL_CREATED",
  SIGNAL_VALIDATED: "SIGNAL_VALIDATED",
  SIGNAL_REJECTED: "SIGNAL_REJECTED",
  RISK_APPROVED: "RISK_APPROVED",
  RISK_REJECTED: "RISK_REJECTED",
  DRY_RUN_COMPLETE: "DRY_RUN_COMPLETE",
  ORDER_SUBMITTED: "ORDER_SUBMITTED",
  ORDER_ACCEPTED: "ORDER_ACCEPTED",
  ORDER_REJECTED: "ORDER_REJECTED",
  ORDER_TIMEOUT: "ORDER_TIMEOUT",
  PARTIAL_FILL: "PARTIAL_FILL",
  ORDER_FILLED: "ORDER_FILLED",
  POSITION_OPEN: "POSITION_OPEN",
  POSITION_MANAGED: "POSITION_MANAGED",
  CLOSE_REQUESTED: "CLOSE_REQUESTED",
  POSITION_CLOSED: "POSITION_CLOSED",
  RECONCILED: "RECONCILED",
  POSITION_MISMATCH: "POSITION_MISMATCH",
  EXECUTION_UNKNOWN: "EXECUTION_UNKNOWN",
  EMERGENCY_CLOSE: "EMERGENCY_CLOSE"
});

const ALLOWED_TRANSITIONS = Object.freeze({
  SIGNAL_CREATED: [
    "SIGNAL_VALIDATED",
    "SIGNAL_REJECTED",
    "RISK_REJECTED"
  ],
  SIGNAL_VALIDATED: [
    "RISK_APPROVED",
    "RISK_REJECTED",
    "SIGNAL_REJECTED"
  ],
  RISK_APPROVED: [
    "DRY_RUN_COMPLETE",
    "ORDER_SUBMITTED",
    "ORDER_REJECTED",
    "EXECUTION_UNKNOWN"
  ],
  ORDER_SUBMITTED: [
    "ORDER_ACCEPTED",
    "ORDER_REJECTED",
    "ORDER_TIMEOUT",
    "EXECUTION_UNKNOWN"
  ],
  ORDER_ACCEPTED: [
    "PARTIAL_FILL",
    "ORDER_FILLED",
    "ORDER_REJECTED",
    "EXECUTION_UNKNOWN"
  ],
  PARTIAL_FILL: [
    "ORDER_FILLED",
    "POSITION_OPEN",
    "POSITION_MISMATCH",
    "EXECUTION_UNKNOWN"
  ],
  ORDER_FILLED: [
    "POSITION_OPEN",
    "POSITION_CLOSED",
    "POSITION_MISMATCH",
    "RECONCILED"
  ],
  POSITION_OPEN: [
    "POSITION_MANAGED",
    "CLOSE_REQUESTED",
    "POSITION_CLOSED",
    "POSITION_MISMATCH",
    "EMERGENCY_CLOSE",
    "EXECUTION_UNKNOWN"
  ],
  POSITION_MANAGED: [
    "POSITION_MANAGED",
    "CLOSE_REQUESTED",
    "POSITION_CLOSED",
    "POSITION_MISMATCH",
    "EMERGENCY_CLOSE",
    "EXECUTION_UNKNOWN"
  ],
  CLOSE_REQUESTED: [
    "POSITION_CLOSED",
    "POSITION_MISMATCH",
    "EXECUTION_UNKNOWN"
  ],
  POSITION_CLOSED: ["RECONCILED"],
  ORDER_TIMEOUT: ["EXECUTION_UNKNOWN", "RECONCILED"],
  EXECUTION_UNKNOWN: [
    "ORDER_ACCEPTED",
    "ORDER_FILLED",
    "POSITION_OPEN",
    "POSITION_CLOSED",
    "POSITION_MISMATCH",
    "RECONCILED"
  ],
  POSITION_MISMATCH: [
    "POSITION_OPEN",
    "POSITION_CLOSED",
    "RECONCILED"
  ],
  EMERGENCY_CLOSE: [
    "POSITION_CLOSED",
    "EXECUTION_UNKNOWN",
    "POSITION_MISMATCH"
  ],
  SIGNAL_REJECTED: [],
  RISK_REJECTED: [],
  DRY_RUN_COMPLETE: [],
  ORDER_REJECTED: [],
  RECONCILED: []
});

function jsonValue(value) {
  return value == null ? null : JSON.stringify(value);
}

function canonicalOrderRequest(input = {}) {
  return {
    symbol: String(input.symbol || "USDCHF").toUpperCase(),
    side: String(input.side || "").toLowerCase(),
    type: String(input.type || "market").toLowerCase(),
    lots: input.lots ?? null,
    qty: input.qty ?? null,
    routeId: input.tradeRouteId ?? input.routeId ?? null,
    infoRouteId: input.infoRouteId ?? null,
    tradableInstrumentId: input.tradableInstrumentId ?? null,
    entryPrice: input.entryPrice ?? input.price ?? null,
    stopPrice: input.stopPrice ?? null,
    stopLoss: input.stopLoss ?? null,
    takeProfit: input.takeProfit ?? null
  };
}

export function tradeRequestHash(input) {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(canonicalOrderRequest(input)))
    .digest("hex");
}

export function publicTradeView(trade) {
  if (!trade) return null;
  return {
    id: trade.id,
    idempotencyKey: trade.idempotency_key,
    strategyId: trade.strategy_id,
    source: trade.source,
    symbol: trade.symbol,
    side: trade.side,
    state: trade.state,
    dryRun: trade.dry_run,
    accountId: trade.account_id,
    brokerOrderId: trade.broker_order_id,
    brokerPositionId: trade.broker_position_id,
    lots: trade.lots,
    units: trade.units,
    entryPrice: trade.entry_price,
    stopLoss: trade.stop_loss,
    takeProfit: trade.take_profit,
    riskReward: trade.risk_reward,
    riskAmount: trade.risk_amount,
    riskPercent: trade.risk_percent,
    lastError: trade.last_error,
    createdAt: trade.created_at,
    updatedAt: trade.updated_at,
    closedAt: trade.closed_at
  };
}

export async function recordTradeEvent(
  tradeId,
  eventType,
  { fromState = null, toState = null, payload = null } = {}
) {
  if (!tradeStateDbEnabled() || !tradeId) return null;

  const rows = await dbQuery(
    `insert into trade_events
      (trade_id, event_type, from_state, to_state, payload_json)
     values ($1, $2, $3, $4, $5::jsonb)
     returning *`,
    [tradeId, eventType, fromState, toState, jsonValue(payload)]
  );

  return rows?.[0] || null;
}

export async function createTradeRun({
  idempotencyKey,
  strategyId,
  source = "manual",
  input,
  account = null,
  dryRun = true
}) {
  if (!tradeStateDbEnabled()) {
    return { enabled: false, created: true, trade: null };
  }

  if (!idempotencyKey) {
    throw new Error("Cannot track trade without idempotencyKey");
  }

  const id = crypto.randomUUID();
  const requestHash = tradeRequestHash(input);
  const requestJson = canonicalOrderRequest(input);

  const inserted = await dbQuery(
    `insert into trade_runs (
      id,
      idempotency_key,
      request_hash,
      strategy_id,
      source,
      symbol,
      side,
      state,
      dry_run,
      account_id,
      trade_route_id,
      info_route_id,
      tradable_instrument_id,
      request_json
    ) values (
      $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb
    )
    on conflict (idempotency_key) do nothing
    returning *`,
    [
      id,
      String(idempotencyKey),
      requestHash,
      strategyId || null,
      source,
      requestJson.symbol,
      requestJson.side,
      TRADE_STATES.SIGNAL_CREATED,
      Boolean(dryRun),
      account?.id || null,
      Number(requestJson.routeId) || null,
      Number(requestJson.infoRouteId) || null,
      Number(requestJson.tradableInstrumentId) || null,
      jsonValue(requestJson)
    ]
  );

  const created = inserted.length > 0;
  const trade = created
    ? inserted[0]
    : (
        await dbQuery(
          "select * from trade_runs where idempotency_key = $1 limit 1",
          [String(idempotencyKey)]
        )
      )?.[0] || null;

  if (!trade) {
    throw new Error("Trade state insert failed");
  }

  if (trade.request_hash !== requestHash) {
    throw new Error(
      "idempotencyKey is already attached to different order parameters"
    );
  }

  if (created) {
    await recordTradeEvent(trade.id, "TRADE_CREATED", {
      fromState: null,
      toState: TRADE_STATES.SIGNAL_CREATED,
      payload: {
        strategyId: strategyId || null,
        source,
        dryRun: Boolean(dryRun)
      }
    });
  }

  return { enabled: true, created, trade };
}

export async function getTradeById(id) {
  if (!tradeStateDbEnabled() || !id) return null;
  const rows = await dbQuery(
    "select * from trade_runs where id = $1 limit 1",
    [String(id)]
  );
  return rows?.[0] || null;
}

export async function getTradeByIdempotencyKey(idempotencyKey) {
  if (!tradeStateDbEnabled() || !idempotencyKey) return null;
  const rows = await dbQuery(
    "select * from trade_runs where idempotency_key = $1 limit 1",
    [String(idempotencyKey)]
  );
  return rows?.[0] || null;
}

export async function getTradeByStrategyId(strategyId) {
  if (!tradeStateDbEnabled() || !strategyId) return null;
  const rows = await dbQuery(
    `select * from trade_runs
     where strategy_id = $1
     order by created_at desc
     limit 1`,
    [String(strategyId)]
  );
  return rows?.[0] || null;
}

export async function getTradeByBrokerPositionId(positionId) {
  if (!tradeStateDbEnabled() || positionId == null) return null;
  const rows = await dbQuery(
    `select * from trade_runs
     where broker_position_id = $1
     order by created_at desc
     limit 1`,
    [String(positionId)]
  );
  return rows?.[0] || null;
}

export async function getTradeByBrokerOrderId(orderId) {
  if (!tradeStateDbEnabled() || orderId == null) return null;
  const rows = await dbQuery(
    `select * from trade_runs
     where broker_order_id = $1
     order by created_at desc
     limit 1`,
    [String(orderId)]
  );
  return rows?.[0] || null;
}

export async function listRecentTrades(limit = 50) {
  if (!tradeStateDbEnabled()) return [];
  const safeLimit = Math.min(200, Math.max(1, Number(limit) || 50));
  return dbQuery(
    `select * from trade_runs
     order by created_at desc
     limit $1`,
    [safeLimit]
  );
}

export async function transitionTradeState(
  tradeId,
  nextState,
  { eventType = "STATE_TRANSITION", payload = null, error = null } = {}
) {
  if (!tradeStateDbEnabled() || !tradeId) return null;

  if (!Object.values(TRADE_STATES).includes(nextState)) {
    throw new Error(`Unknown trade state: ${nextState}`);
  }

  const current = await getTradeById(tradeId);
  if (!current) throw new Error(`Trade state record not found: ${tradeId}`);

  if (current.state === nextState) {
    await recordTradeEvent(tradeId, eventType, {
      fromState: current.state,
      toState: nextState,
      payload: {
        duplicateTransition: true,
        ...(payload || {})
      }
    });
    return current;
  }

  const allowed = ALLOWED_TRANSITIONS[current.state] || [];
  if (!allowed.includes(nextState)) {
    throw new Error(
      `Invalid trade state transition ${current.state} -> ${nextState}`
    );
  }

  const closedState =
    nextState === TRADE_STATES.POSITION_CLOSED ||
    nextState === TRADE_STATES.RECONCILED;

  const rows = await dbQuery(
    `update trade_runs
     set state = $2,
         last_error = case when $3::text is null then last_error else $3 end,
         closed_at = case when $4 then coalesce(closed_at, now()) else closed_at end,
         updated_at = now()
     where id = $1 and state = $5
     returning *`,
    [
      String(tradeId),
      nextState,
      error || null,
      closedState,
      current.state
    ]
  );

  if (!rows.length) {
    throw new Error(
      "Trade state changed concurrently; reload before transitioning"
    );
  }

  await recordTradeEvent(tradeId, eventType, {
    fromState: current.state,
    toState: nextState,
    payload
  });

  return rows[0];
}

export async function updateTradeFromPreview(tradeId, preview, account = null) {
  if (!tradeStateDbEnabled() || !tradeId || !preview) return null;

  const s = preview.sizing || {};
  const i = preview.instrument || {};

  const rows = await dbQuery(
    `update trade_runs
     set account_id = coalesce($2, account_id),
         trade_route_id = coalesce($3, trade_route_id),
         info_route_id = coalesce($4, info_route_id),
         tradable_instrument_id = coalesce($5, tradable_instrument_id),
         lots = coalesce($6, lots),
         units = coalesce($7, units),
         entry_price = coalesce($8, entry_price),
         stop_loss = coalesce($9, stop_loss),
         take_profit = coalesce($10, take_profit),
         risk_reward = coalesce($11, risk_reward),
         risk_amount = coalesce($12, risk_amount),
         risk_percent = coalesce($13, risk_percent),
         preview_json = $14::jsonb,
         updated_at = now()
     where id = $1
     returning *`,
    [
      String(tradeId),
      account?.id || preview.account?.id || null,
      i.tradeRouteId || null,
      i.infoRouteId || null,
      i.tradableInstrumentId || null,
      s.lots ?? null,
      s.units ?? null,
      s.entryPrice ?? null,
      s.stopLoss ?? null,
      s.takeProfit ?? null,
      s.riskReward ?? null,
      s.estimatedRiskAmount ?? null,
      s.estimatedRiskPercent ?? null,
      jsonValue(preview)
    ]
  );

  await recordAccountSnapshot(tradeId, preview);

  return rows?.[0] || null;
}

function deepFind(value, wantedKeys) {
  if (value == null) return null;

  if (Array.isArray(value)) {
    for (const item of value) {
      const found = deepFind(item, wantedKeys);
      if (found != null) return found;
    }
    return null;
  }

  if (typeof value !== "object") return null;

  for (const [key, item] of Object.entries(value)) {
    if (wantedKeys.has(key.toLowerCase()) && item != null) {
      return item;
    }
  }

  for (const item of Object.values(value)) {
    const found = deepFind(item, wantedKeys);
    if (found != null) return found;
  }

  return null;
}

export async function updateTradeBrokerResponse(
  tradeId,
  response,
  { orderId = null, positionId = null } = {}
) {
  if (!tradeStateDbEnabled() || !tradeId) return null;

  const discoveredOrderId =
    orderId ??
    deepFind(response, new Set(["orderid", "order_id"]));

  const discoveredPositionId =
    positionId ??
    deepFind(response, new Set(["positionid", "position_id"]));

  const rows = await dbQuery(
    `update trade_runs
     set broker_order_id = coalesce($2, broker_order_id),
         broker_position_id = coalesce($3, broker_position_id),
         broker_response_json = coalesce($4::jsonb, broker_response_json),
         updated_at = now()
     where id = $1
     returning *`,
    [
      String(tradeId),
      discoveredOrderId == null ? null : String(discoveredOrderId),
      discoveredPositionId == null ? null : String(discoveredPositionId),
      jsonValue(response)
    ]
  );

  return rows?.[0] || null;
}

export async function recordAccountSnapshot(tradeId, preview) {
  if (!tradeStateDbEnabled() || !preview) return null;

  const rows = await dbQuery(
    `insert into account_snapshots (
      trade_id,
      account_id,
      equity,
      balance,
      open_positions,
      pending_orders,
      snapshot_json
    ) values ($1,$2,$3,$4,$5,$6,$7::jsonb)
    returning *`,
    [
      tradeId || null,
      preview.account?.id == null ? null : String(preview.account.id),
      preview.sizing?.equity ?? null,
      preview.account?.balance ?? null,
      preview.exposure?.openPositions ?? null,
      preview.exposure?.pendingOrders ?? null,
      jsonValue({
        account: preview.account || null,
        sizing: preview.sizing || null,
        exposure: preview.exposure || null,
        quote: preview.quote || null
      })
    ]
  );

  return rows?.[0] || null;
}

export async function markTradeError(
  tradeId,
  error,
  state = TRADE_STATES.EXECUTION_UNKNOWN
) {
  if (!tradeStateDbEnabled() || !tradeId) return null;

  try {
    return await transitionTradeState(tradeId, state, {
      eventType: "TRADE_ERROR",
      error: error?.message || String(error),
      payload: {
        message: error?.message || String(error)
      }
    });
  } catch (transitionError) {
    await dbQuery(
      `update trade_runs
       set last_error = $2, updated_at = now()
       where id = $1`,
      [String(tradeId), error?.message || String(error)]
    );

    await recordTradeEvent(tradeId, "TRADE_ERROR_UNTRANSITIONED", {
      payload: {
        message: error?.message || String(error),
        transitionError: transitionError.message
      }
    });

    return getTradeById(tradeId);
  }
}

async function advanceToAccepted(trade) {
  let current = trade;
  if (!current) return null;

  if (current.state === TRADE_STATES.RISK_APPROVED) {
    current = await transitionTradeState(
      current.id,
      TRADE_STATES.ORDER_SUBMITTED,
      { eventType: "BROKER_RECONCILIATION" }
    );
  }

  if (current.state === TRADE_STATES.ORDER_SUBMITTED) {
    current = await transitionTradeState(
      current.id,
      TRADE_STATES.ORDER_ACCEPTED,
      { eventType: "BROKER_RECONCILIATION" }
    );
  }

  return current;
}

async function advanceToPositionOpen(trade) {
  let current = await advanceToAccepted(trade);
  if (!current) return null;

  if (current.state === TRADE_STATES.ORDER_ACCEPTED) {
    current = await transitionTradeState(
      current.id,
      TRADE_STATES.ORDER_FILLED,
      { eventType: "BROKER_RECONCILIATION" }
    );
  }

  if (
    current.state === TRADE_STATES.ORDER_FILLED ||
    current.state === TRADE_STATES.PARTIAL_FILL ||
    current.state === TRADE_STATES.EXECUTION_UNKNOWN ||
    current.state === TRADE_STATES.POSITION_MISMATCH
  ) {
    current = await transitionTradeState(
      current.id,
      TRADE_STATES.POSITION_OPEN,
      { eventType: "BROKER_RECONCILIATION" }
    );
  }

  return current;
}

export async function syncTradeFromVerification({
  strategyId = null,
  orderId = null,
  positionId = null,
  pendingOrder = null,
  finalOrder = null,
  openPosition = null
}) {
  if (!tradeStateDbEnabled()) return null;

  let trade = null;

  if (strategyId) trade = await getTradeByStrategyId(strategyId);
  if (!trade && positionId) trade = await getTradeByBrokerPositionId(positionId);
  if (!trade && orderId) trade = await getTradeByBrokerOrderId(orderId);

  if (!trade) return null;

  const mappedOrderId =
    finalOrder?.orderId ??
    finalOrder?.id ??
    pendingOrder?.orderId ??
    pendingOrder?.id ??
    orderId ??
    null;

  const mappedPositionId =
    openPosition?.positionId ??
    openPosition?.id ??
    finalOrder?.positionId ??
    positionId ??
    null;

  trade = await updateTradeBrokerResponse(
    trade.id,
    {
      verification: {
        pendingOrder,
        finalOrder,
        openPosition
      }
    },
    {
      orderId: mappedOrderId,
      positionId: mappedPositionId
    }
  );

  await recordTradeEvent(trade.id, "BROKER_VERIFICATION", {
    fromState: trade.state,
    toState: trade.state,
    payload: {
      pendingOrderFound: Boolean(pendingOrder),
      finalOrderFound: Boolean(finalOrder),
      openPositionFound: Boolean(openPosition),
      mappedOrderId,
      mappedPositionId
    }
  });

  if (openPosition) {
    trade = await advanceToPositionOpen(trade);
  } else if (pendingOrder) {
    trade = await advanceToAccepted(trade);
  }

  return trade;
}
