export default function Home() {
  return (
    <main>
      <h1>TradeLocker ↔ ChatGPT Gateway</h1>
      <p>
        Private TradeLocker execution gateway with mandatory risk controls and
        durable trade-state tracking.
      </p>

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
        <li><code>GET /api/tradelocker/verify-trade</code> — verify and reconcile order/position state</li>
        <li><code>GET /api/trading/trades</code> — protected durable trade-state query</li>
        <li><code>GET /api/trading/db-health</code> — protected database health check</li>
        <li><code>GET /api/trading/forex-universe</code> — protected TradeLocker FOREX universe + INFO/TRADE routes</li>
      </ul>

      <h2>Market data / testing</h2>
      <ul>
        <li><code>POST /api/trading/history</code> — protected TradeLocker historical bars</li>
        <li><code>POST /api/trading/indicators</code> — protected indicator calculations</li>
        <li><code>POST /api/trading/backtest</code> — protected broker-constrained replay backtest</li>
      </ul>

      <h2>Risk / execution</h2>
      <ul>
        <li><code>POST /api/tradelocker/risk-preview</code> — risk checks only</li>
        <li><code>POST /api/tradelocker/order</code> — risk + duplicate checks + state tracking + approved execution</li>
        <li><code>POST /api/tradelocker/close-position</code> — full/partial position close + state event</li>
      </ul>

      <p>
        <code>TRADING_ENABLED=false</code> keeps order and close execution in
        dry-run mode.
      </p>
      <p><code>KILL_SWITCH=true</code> blocks execution.</p>
      <p>
        Configure <code>DATABASE_URL</code> and apply
        <code> db/migrations/001_trade_state.sql</code> to enable durable state.
      </p>
    </main>
  );
}
