import { NextResponse } from "next/server";
import { listForexInstruments } from "../../../../lib/forexUniverse";
import { fetchTradeLockerHistory, fetchTradeLockerInstrumentSizing } from "../../../../lib/marketData";
import { killSwitchEnabled } from "../../../../lib/tradeGuard";
import { historicalMacroCalendar } from "../../../../lib/historicalMacroEvents";
import { validateDataset, preparePair, fitSchedule, evaluateCombo } from "../../../../lib/research/prepare.mjs";
import { SYMBOLS, combinations, ENGINE_VERSION } from "../../../../lib/research/policies.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const REQUESTED_FROM = "2024-01-01T00:00:00.000Z";
const REQUESTED_TO = "2026-09-25T21:00:00.000Z";
const WARMUP_FROM = Date.parse(REQUESTED_FROM) - 30 * 86400000;

function safety() {
  const tradingEnabled = String(process.env.TRADING_ENABLED || "false").toLowerCase() === "true";
  const killSwitch = killSwitchEnabled();
  if (tradingEnabled || !killSwitch) throw new Error("RESEARCH_REQUIRES_EXECUTION_DISABLED");
  return { tradingEnabled, killSwitch };
}

export async function GET() {
  let stage = "start";
  try {
    stage = "safety";
    const safe = safety();
    const collectedAt = new Date().toISOString();
    stage = "instruments";
    const instruments = await listForexInstruments();
    const dataset = {
      source: "tradelocker",
      requestedFrom: REQUESTED_FROM,
      requestedTo: REQUESTED_TO,
      collectedAt,
      safety: safe,
      calendar: historicalMacroCalendar(),
      pairs: {}
    };

    for (const symbol of SYMBOLS) {
      stage = `collect:${symbol}`;
      const instrument = instruments.find(i => i.symbol === symbol);
      if (!instrument?.tradableInstrumentId || !instrument?.infoRouteId || !instrument?.tradeRouteId) {
        throw new Error(`MISSING_INSTRUMENT_${symbol}`);
      }
      stage = `sizing:${symbol}`;
      const sizing = await fetchTradeLockerInstrumentSizing({
        tradableInstrumentId: instrument.tradableInstrumentId,
        tradeRouteId: instrument.tradeRouteId,
        maxLots: 0.01
      });
      stage = `history:${symbol}`;
      const history = await fetchTradeLockerHistory({
        symbol,
        tradableInstrumentId: instrument.tradableInstrumentId,
        infoRouteId: instrument.infoRouteId,
        resolution: "15m",
        from: WARMUP_FROM,
        to: Date.parse(REQUESTED_TO) - 1,
        maxBars: 100000
      });
      stage = `history-check:${symbol}`;
      if (history.truncated || history.chunks.some(c => !["ok","no_data","no-data"].includes(c.status))) {
        throw new Error(`HISTORY_INCOMPLETE_${symbol}`);
      }
      stage = `dataset:${symbol}`;
      dataset.pairs[symbol] = {
        metadata: {
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
          verifiedAt: collectedAt,
          source: "TradeLocker instrument list + instrument details + history"
        },
        candles: history.candles,
        truncated: false
      };
    }

    stage = "validate";
    const prepared = validateDataset(dataset);
    stage = "prepare";
    for (const symbol of SYMBOLS) prepared.pairs[symbol] = preparePair(prepared.pairs[symbol]);
    stage = "fit";
    const schedule = fitSchedule(prepared);
    stage = "evaluate";
    const results = combinations().slice(0, 12).map(combo => evaluateCombo(prepared, combo, schedule));

    return NextResponse.json({
      ok: true,
      readOnly: true,
      engineVersion: ENGINE_VERSION,
      safety: safe,
      requested: { from: REQUESTED_FROM, to: REQUESTED_TO },
      coverage: prepared.coverage,
      missingByPair: prepared.missingByPair,
      droppedIncompleteHours: prepared.droppedIncompleteHours,
      calendar: {
        complete: prepared.calendar.complete,
        reviewedAt: prepared.calendar.reviewedAt,
        events: prepared.calendar.blackouts.length,
        coverage: prepared.calendar.coverage
      },
      schedule,
      pilot: {
        completed: results.length,
        results: results.map(r => ({
          combo: r.combo,
          eligible: r.eligible,
          rejectionReasons: r.rejectionReasons,
          validation: r.validation?.metrics,
          score: r.score
        }))
      }
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("research-pilot-12", error?.message || "unknown");
    return NextResponse.json({
      ok: false,
      readOnly: true,
      stage,
      error: String(error?.message || "").startsWith("CALENDAR_") ? error.message : String(error?.message || "").startsWith("RESEARCH_") ? error.message : "RESEARCH_PILOT_FAILED"
    }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}
