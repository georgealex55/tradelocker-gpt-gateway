import { NextResponse } from "next/server";
import { listForexInstruments } from "../../../../lib/forexUniverse";
import { fetchTradeLockerHistory } from "../../../../lib/marketData";
import { killSwitchEnabled } from "../../../../lib/tradeGuard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const SYMBOLS = ["USDCHF", "EURUSD", "GBPUSD"];

function safeRuntime() {
  const tradingEnabled =
    String(process.env.TRADING_ENABLED || "false").toLowerCase() === "true";
  const killSwitch = killSwitchEnabled();
  if (tradingEnabled || !killSwitch) {
    throw new Error("RESEARCH_REQUIRES_EXECUTION_DISABLED");
  }
  return { tradingEnabled, killSwitch };
}

export async function GET() {
  try {
    const safety = safeRuntime();
    const instruments = await listForexInstruments();
    const to = Date.now();
    const from = to - 7 * 24 * 60 * 60 * 1000;
    const pairs = {};

    for (const symbol of SYMBOLS) {
      const instrument = instruments.find(i => i.symbol === symbol);
      if (!instrument?.tradableInstrumentId || !instrument?.infoRouteId) {
        throw new Error(`MISSING_INSTRUMENT_${symbol}`);
      }

      const history = await fetchTradeLockerHistory({
        symbol,
        tradableInstrumentId: instrument.tradableInstrumentId,
        infoRouteId: instrument.infoRouteId,
        resolution: "15m",
        from,
        to,
        maxBars: 1000
      });

      pairs[symbol] = {
        tradableInstrumentId: instrument.tradableInstrumentId,
        infoRouteId: instrument.infoRouteId,
        returnedBars: history.returnedBars,
        truncated: history.truncated,
        firstBar: history.candles[0]?.time ?? null,
        lastBar: history.candles.at(-1)?.time ?? null,
        chunks: history.chunks
      };
    }

    return NextResponse.json({
      ok: true,
      readOnly: true,
      purpose: "portfolio-144-history-smoke-test",
      safety,
      requested: { resolution: "15m", from, to },
      pairs
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const safe = [
      "RESEARCH_REQUIRES_EXECUTION_DISABLED",
      ...SYMBOLS.map(s => `MISSING_INSTRUMENT_${s}`)
    ];
    return NextResponse.json({
      ok: false,
      readOnly: true,
      error: safe.includes(error.message) ? error.message : "HISTORY_SMOKE_TEST_FAILED"
    }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}
