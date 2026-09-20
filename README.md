# TradeLocker ↔ ChatGPT Gateway

A minimal private Next.js gateway for TradeLocker REST execution.

## 1. Deploy
Import this project into Vercel.

## 2. Add Vercel environment variables
Copy the keys from `.env.example`.

Do not put your TradeLocker password into source code or chat messages.

Start with:
- `TRADELOCKER_ENV=demo` (or `live` only when ready)
- `TRADING_ENABLED=false`

## 3. Required TradeLocker values
- Email
- Password
- Server
- Account ID
- Account number (`accNum`)

The account ID is the number shown after `#` in TradeLocker's account switcher.

## 4. Test the connection
GET:
`/api/tradelocker/account`

## 5. Dry-run an order
POST `/api/tradelocker/order`

Header:
`x-trade-approval-key: YOUR_SECRET`

JSON:
```json
{
  "side": "buy",
  "qty": 0.01,
  "routeId": 1,
  "tradableInstrumentId": 123,
  "stopLoss": 1.0800,
  "takeProfit": 1.0900
}
```

While `TRADING_ENABLED=false`, the gateway validates the request but does not submit it.

## 6. Enable execution
After the connection and dry-run work:
`TRADING_ENABLED=true`

The approval header is still required.

## ChatGPT integration
Expose this gateway through a ChatGPT custom app/action or MCP server. Keep the approval key and TradeLocker credentials server-side.

## Next safety additions
- risk as % of equity
- max daily loss
- max concurrent positions
- symbol allow-list
- spread/slippage guard
- duplicate-order protection
- kill switch
- audit log

## Instrument details

Defaults to the USDCHF IDs discovered for this account:

`GET /api/tradelocker/instrument-details`

You can also query another instrument:

`GET /api/tradelocker/instrument-details?tradableInstrumentId=7876&routeId=540005&symbol=USDCHF`

This endpoint is read-only and is used to retrieve lot size, lot step, quoting currency, and other instrument settings before order sizing.
