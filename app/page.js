export default function Home() {
  return (
    <main>
      <h1>TradeLocker ↔ ChatGPT Gateway</h1>
      <p>Private execution gateway. Credentials stay in server-side environment variables.</p>
      <h2>Endpoints</h2>
      <ul>
        <li><code>GET /api/tradelocker/account</code> — connection/account check</li>
        <li><code>POST /api/tradelocker/order</code> — execute a validated order</li>
      </ul>
      <p>Live order requests require <code>x-trade-approval-key</code>.</p>
    </main>
  );
}
