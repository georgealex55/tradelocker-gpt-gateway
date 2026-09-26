import { accountId, tlFetch } from "./tradelocker";

function routeId(routes, type) {
  if (!Array.isArray(routes)) return null;
  const match = routes.find(
    route => String(route?.type || "").toUpperCase() === type
  );
  const id = Number(match?.id);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function listForexInstruments() {
  const raw = await tlFetch(
    `/trade/accounts/${accountId()}/instruments`
  );

  const instruments =
    raw?.d?.instruments ||
    raw?.instruments ||
    [];

  if (!Array.isArray(instruments)) {
    throw new Error("TradeLocker instruments response is not an array");
  }

  return instruments
    .filter(
      instrument =>
        String(instrument?.type || "").toUpperCase() === "FOREX"
    )
    .map(instrument => ({
      symbol: String(
        instrument.name ||
        instrument.localizedName ||
        ""
      ).toUpperCase(),
      description: instrument.description || null,
      tradableInstrumentId:
        Number(instrument.tradableInstrumentId) || null,
      instrumentId: Number(instrument.id) || null,
      infoRouteId: routeId(instrument.routes, "INFO"),
      tradeRouteId: routeId(instrument.routes, "TRADE"),
      barSource: instrument.barSource || null,
      hasIntraday: Boolean(instrument.hasIntraday),
      hasDaily: Boolean(instrument.hasDaily),
      marketDataExchange: instrument.marketDataExchange || null,
      tradingExchange: instrument.tradingExchange || null
    }))
    .filter(
      instrument =>
        instrument.symbol &&
        instrument.tradableInstrumentId &&
        instrument.infoRouteId
    )
    .sort((a, b) => a.symbol.localeCompare(b.symbol));
}
