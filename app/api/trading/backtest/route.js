import { NextResponse } from "next/server";
import {
  runBacktest,
  strategyFromSignals
} from "../../../../lib/backtest";
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

    const result = await runBacktest({
      candles,
      strategy: strategyFromSignals(signals),
      indicatorConfig: body.indicatorConfig || {},
      higherTimeframe: body.higherTimeframe || null,
      options: backtestOptions
    });

    return NextResponse.json({
      ok: true,
      simulated: true,
      strategyMode: "explicit-signals",
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
