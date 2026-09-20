export default function Home() {
  return (
    <main>
      <h1>TradeLocker ↔ ChatGPT Gateway</h1>
      <p>Private TradeLocker execution gateway with mandatory risk controls.</p>

      <h2>Read endpoints</h2>
      <ul>
        <li><code>GET /api/tradelocker/account</code> — connection/account check</li>
        <li><code>GET /api/tradelocker/account-readable</code> — account state + config</li>
        <li><code>GET /api/tradelocker/config</code> — field/config metadata</li>
        <li><code>GET /api/tradelocker/instruments</code> — available instruments</li>
        <li><code>GET /api/tradelocker/instrument-details</code> — lot/size/settings</li>
        <li><code>GET /api/tradelocker/quote</code> — current quote</li>
        <li><code>GET /api/tradelocker/positions</code> — open positions</li>
        <li><code>GET /api/tradelocker/orders</code> — non-final orders</li>
      </ul>

      <h2>Risk / execution</h2>
      <ul>
        <li><code>POST /api/tradelocker/risk-preview</code> — risk checks only</li>
        <li><code>POST /api/tradelocker/order</code> — risk checks + approved execution</li>
      </ul>

      <p><code>TRADING_ENABLED=false</code> keeps order execution in dry-run mode.</p>
      <p><code>KILL_SWITCH=true</code> blocks execution.</p>
    </main>
  );
}