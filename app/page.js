export default function Home() {
  return (
    <main>
      <h1>TradeLocker ↔ ChatGPT Gateway</h1>
      <p>Private execution gateway. Credentials stay in server-side environment variables.</p>
      <h2>Endpoints</h2>
      <ul>
        <li><code>GET /api/tradelocker/account</code> — connection/account check</li>
        <li><code>GET /api/tradelocker/account-readable</code> — account state + config</li>
        <li><code>GET /api/tradelocker/config</code> — TradeLocker field/config metadata</li>
        <li><code>GET /api/tradelocker/instruments</code> — available account instruments</li>
        <li><code>GET /api/tradelocker/instrument-details</code> — instrument lot/size/settings</li>
        <li><code>GET /api/tradelocker/positions</code> — open positions</li>
        <li><code>GET /api/tradelocker/orders</code> — non-final orders</li>
        <li><code>POST /api/tradelocker/order</code> — validate/execute an approved order</li>
      </ul>
      <p>Live order requests require <code>x-trade-approval-key</code>.</p>
    </main>
  );
}
