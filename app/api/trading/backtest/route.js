import { NextResponse } from "next/server";
import {
  runBacktest,
  strategyFromSignals
} from "../../../../lib/backtest";
import {
  createForexStrategyV1
} from "../../../../lib/forexStrategyV1";
import {
  FOREX_STRATEGY_V1_CONFIG
} from "../../../../lib/forexStrategyV1Config";
import {
  fetchTradeLockerHistory,
  fetchTradeLockerInstrumentSizing
} from "../../../../lib/marketData";

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
    const signals = Array.isArray(body.signals) ? body.signals : [];

    let candles = Array.isArray(body.candles) ? body.candles : [];
    let marketData = null;
    let brokerSizing = body.options?.sizing || null;

    if (candles.length < 2 && body.marketData) {
      marketData = await fetchTradeLockerHistory(body.marketData);
      candles = marketData.candles;
    }

    if (
      !brokerSizing &&
      body.marketData?.tradableInstrumentId &&
      body.marketData?.tradeRouteId
    ) {
      brokerSizing = await fetchTradeLockerInstrumentSizing({
        tradableInstrumentId:
          body.marketData.tradableInstrumentId,
        tradeRouteId: body.marketData.tradeRouteId,
        accountCurrency:
          body.marketData.accountCurrency || "USD",
        maxLots:
          body.marketData.maxLots ||
          Number(process.env.MAX_LOTS_PER_TRADE || 0.01)
      });
    }

    if (candles.length < 2) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Provide at least 2 candles or a marketData request that returns at least 2 TradeLocker bars"
        },
        { status: 400 }
      );
    }

    if (candles.length > 100000) {
      return NextResponse.json(
        { ok: false, error: "Maximum 100000 candles per backtest" },
        { status: 400 }
      );
    }

    const backtestOptions = {
      ...(body.options || {}),
      ...(brokerSizing
        ? {
            sizing: brokerSizing,
            pipSize:
              body.options?.pipSize ?? brokerSizing.pipSize
          }
        : {})
    };

    const strategyMode =
      body.strategyMode === "forex-v1"
        ? "forex-v1"
        : "explicit-signals";

    const strategy =
      strategyMode === "forex-v1"
        ? createForexStrategyV1({
            symbol:
              body.marketData?.symbol ||
              body.symbol ||
              "USDCHF",
            config: FOREX_STRATEGY_V1_CONFIG
          })
        : strategyFromSignals(signals);

    const result = await runBacktest({
      candles,
      strategy:
        strategyMode === "forex-v1"
          ? context =>
              strategy({
                ...context,
                spreadPips:
                  backtestOptions.spreadPips ?? null
              })
          : strategy,
      indicatorConfig:
        strategyMode === "forex-v1"
          ? FOREX_STRATEGY_V1_CONFIG.indicators.entry
          : body.indicatorConfig || {},
      higherTimeframe:
        strategyMode === "forex-v1"
          ? {
              resolution:
                FOREX_STRATEGY_V1_CONFIG.timeframes.regime,
              indicatorConfig:
                FOREX_STRATEGY_V1_CONFIG.indicators.regime
            }
          : body.higherTimeframe || null,
      options: backtestOptions
    });

    return NextResponse.json({
      ok: true,
      simulated: true,
      strategyMode,
      candleSource: marketData ? "tradelocker" : "request",
      brokerSizing,
      marketData: marketData
        ? {
            symbol: marketData.symbol,
            tradableInstrumentId: marketData.tradableInstrumentId,
            infoRouteId: marketData.infoRouteId,
            resolution: marketData.resolution,
            from: marketData.from,
            to: marketData.to,
            returnedBars: marketData.returnedBars,
            truncated: marketData.truncated,
            chunks: marketData.chunks
          }
        : null,
      result
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, simulated: true, error: error.message },
      { status: 400 }
    );
  }
}
