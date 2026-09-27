import { NextResponse } from "next/server";
import { listForexInstruments } from "../../../../lib/forexUniverse";
import { fetchTradeLockerHistory, fetchTradeLockerInstrumentSizing } from "../../../../lib/marketData";
import { killSwitchEnabled } from "../../../../lib/tradeGuard";
import { historicalMacroCalendar } from "../../../../lib/historicalMacroEvents";
import { tradeStateDbConfigured, tradeStateDbEnabled } from "../../../../lib/db";
import {
  ensureHistoryCollection,
  loadHistoryCollection,
  saveHistoryMetadata,
  saveHistoryChunk,
  advanceHistoryCollection
} from "../../../../lib/research/historyStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const SYMBOLS = ["USDCHF","EURUSD","GBPUSD"];
const REQUESTED_FROM = Date.parse("2024-01-01T00:00:00.000Z");
const REQUESTED_TO = Date.parse("2026-09-25T21:00:00.000Z");
const WARMUP_FROM = REQUESTED_FROM - 30 * 86400000;
const CHUNK_MS = 14 * 86400000;
const MAX_CHUNKS_PER_STEP = 3;

const json = (data, status = 200) =>
  NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });

function safety() {
  const tradingEnabled = String(process.env.TRADING_ENABLED || "false").toLowerCase() === "true";
  const killSwitch = killSwitchEnabled();
  if (tradingEnabled || !killSwitch) throw new Error("RESEARCH_REQUIRES_EXECUTION_DISABLED");
  return { tradingEnabled, killSwitch };
}

export async function GET(req) {
  const action = new URL(req.url).searchParams.get("action") || "status";
  let stage = "start";
  try {
    stage = "safety";
    const safe = safety();
    if (action === "status") {
      stage = "status:load";
      return json({ ok: true, readOnlyTrading: true, safety: safe, db: { configured: tradeStateDbConfigured(), enabled: tradeStateDbEnabled() }, ...(await loadHistoryCollection()) });
    }
    if (action !== "step") return json({ ok: false, error: "INVALID_ACTION" }, 400);

    stage = "collection:ensure";
    let collection = await ensureHistoryCollection({
      requestedFrom: REQUESTED_FROM,
      requestedTo: REQUESTED_TO,
      warmupFrom: WARMUP_FROM,
      calendar: historicalMacroCalendar(),
      safety: safe
    });

    if (collection.status === "READY") {
      return json({ ok: true, readOnlyTrading: true, safety: safe, ...(await loadHistoryCollection()) });
    }

    let symbol = collection.current_symbol || SYMBOLS[0];
    let cursor = Number(collection.next_from || WARMUP_FROM);
    let processed = 0;
    const requestedEnd = REQUESTED_TO - 1;
    const instruments = await listForexInstruments();

    while (processed < MAX_CHUNKS_PER_STEP && symbol) {
      const symbolIndex = SYMBOLS.indexOf(symbol);
      if (symbolIndex < 0) throw new Error("INVALID_RESEARCH_SYMBOL");

      const instrument = instruments.find(i => i.symbol === symbol);
      if (!instrument?.tradableInstrumentId || !instrument?.infoRouteId || !instrument?.tradeRouteId) {
        throw new Error(`MISSING_INSTRUMENT_${symbol}`);
      }

      if (!collection.metadata_json?.[symbol]) {
        const sizing = await fetchTradeLockerInstrumentSizing({
          tradableInstrumentId: instrument.tradableInstrumentId,
          tradeRouteId: instrument.tradeRouteId,
          maxLots: 0.01
        });
        await saveHistoryMetadata(symbol, {
          symbol,
          tradableInstrumentId: instrument.tradableInstrumentId,
          tradeRouteId: instrument.tradeRouteId,
          infoRouteId: instrument.infoRouteId,
          pipSize: 0.0001,
          lotSize: sizing.lotSize,
          minLot: sizing.minLot,
          lotStep: sizing.lotStep,
          maxLot: sizing.maxLot,
          tickSize: sizing.tickSize,
          baseCurrency: sizing.baseCurrency,
          quotingCurrency: sizing.quotingCurrency,
          barSource: String(instrument.barSource || "").toUpperCase(),
          verifiedAt: new Date().toISOString(),
          source: "TradeLocker instrument list + instrument details + history"
        });
        collection = (await loadHistoryCollection()).collection;
      }

      const end = Math.min(cursor + CHUNK_MS - 1, requestedEnd);
      let history;
      try {
        history = await fetchTradeLockerHistory({
          symbol,
          tradableInstrumentId: instrument.tradableInstrumentId,
          infoRouteId: instrument.infoRouteId,
          resolution: "15m",
          from: cursor,
          to: end,
          maxBars: 2000
        });
      } catch {
        const midpoint = Math.min(cursor + 7 * 86400000 - 1, end);
        const left = await fetchTradeLockerHistory({
          symbol,
          tradableInstrumentId: instrument.tradableInstrumentId,
          infoRouteId: instrument.infoRouteId,
          resolution: "15m",
          from: cursor,
          to: midpoint,
          maxBars: 1000
        });
        const right = midpoint < end ? await fetchTradeLockerHistory({
          symbol,
          tradableInstrumentId: instrument.tradableInstrumentId,
          infoRouteId: instrument.infoRouteId,
          resolution: "15m",
          from: midpoint + 1,
          to: end,
          maxBars: 1000
        }) : { candles: [], chunks: [], truncated: false };
        const merged = new Map([...left.candles, ...right.candles].map(c => [c.time, c]));
        history = {
          candles: [...merged.values()].sort((a,b) => a.time-b.time),
          chunks: [...left.chunks, ...right.chunks],
          truncated: left.truncated || right.truncated
        };
      }
      if (history.truncated || history.chunks.some(c => !["ok","no_data","no-data"].includes(c.status))) {
        throw new Error(`HISTORY_INCOMPLETE_${symbol}`);
      }

      await saveHistoryChunk({
        symbol,
        chunkFrom: cursor,
        chunkTo: end,
        candles: history.candles
      });
      processed += 1;

      const nextCursor = end + 1;
      if (nextCursor > requestedEnd) {
        const nextSymbol = SYMBOLS[symbolIndex + 1] || null;
        if (!nextSymbol) {
          await advanceHistoryCollection({ currentSymbol: null, nextFrom: null, ready: true });
          symbol = null;
          break;
        }
        symbol = nextSymbol;
        cursor = WARMUP_FROM;
        await advanceHistoryCollection({ currentSymbol: symbol, nextFrom: cursor });
        collection = (await loadHistoryCollection()).collection;
      } else {
        cursor = nextCursor;
        await advanceHistoryCollection({ currentSymbol: symbol, nextFrom: cursor });
      }
    }

    return json({
      ok: true,
      readOnlyTrading: true,
      safety: safe,
      processedChunks: processed,
      ...(await loadHistoryCollection())
    });
  } catch (error) {
    const message = String(error?.message || "");
    const safeError =
      message.startsWith("RESEARCH_") ||
      message.startsWith("HISTORY_") ||
      message.startsWith("MISSING_INSTRUMENT_")
        ? message
        : "RESEARCH_COLLECTION_STEP_FAILED";
    return json({ ok: false, readOnlyTrading: true, stage, db: { configured: tradeStateDbConfigured(), enabled: tradeStateDbEnabled() }, error: safeError }, 500);
  }
}
