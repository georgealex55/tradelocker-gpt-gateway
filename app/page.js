import {
  scanPreferredForexSignals
} from "../lib/forexSignals";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function money(value) {
  const n = Number(value);
  return Number.isFinite(n)
    ? `$${n.toFixed(2)}`
    : "—";
}

function price(value) {
  const n = Number(value);
  return Number.isFinite(n)
    ? n.toFixed(5)
    : "—";
}

function number(value, digits = 2) {
  const n = Number(value);
  return Number.isFinite(n)
    ? n.toFixed(digits)
    : "—";
}

function statusTone(status) {
  switch (status) {
    case "SIGNAL_READY":
      return {
        background: "#052e16",
        border: "#16a34a",
        text: "#bbf7d0"
      };
    case "SETUP_FORMING":
      return {
        background: "#422006",
        border: "#d97706",
        text: "#fde68a"
      };
    case "BLOCKED":
      return {
        background: "#450a0a",
        border: "#dc2626",
        text: "#fecaca"
      };
    default:
      return {
        background: "#172554",
        border: "#2563eb",
        text: "#bfdbfe"
      };
  }
}

function executionTone(status) {
  if (status === "ARMED") return "#16a34a";
  if (status === "DRY_RUN") return "#d97706";
  return "#dc2626";
}

function CheckRow({ label, value }) {
  return (
    <div style={{
      display: "flex",
      justifyContent: "space-between",
      gap: 12,
      padding: "4px 0",
      fontSize: 13
    }}>
      <span style={{ color: "#9ca3af" }}>{label}</span>
      <strong style={{
        color: value ? "#86efac" : "#fca5a5"
      }}>
        {value ? "PASS" : "WAIT"}
      </strong>
    </div>
  );
}

function SignalCard({ row }) {
  if (!row.ok) {
    return (
      <article style={{
        border: "1px solid #7f1d1d",
        borderRadius: 14,
        padding: 18,
        background: "#1f1111"
      }}>
        <strong>{row.instrument?.symbol || "PAIR"}</strong>
        <p style={{ color: "#fca5a5" }}>
          Scan error: {row.error}
        </p>
      </article>
    );
  }

  const signal = row.signal || {};
  const tone = statusTone(signal.status);
  const risk = row.riskEstimate;
  const execution = row.execution || {};

  return (
    <article style={{
      border: `1px solid ${tone.border}`,
      borderRadius: 16,
      padding: 18,
      background: tone.background,
      boxShadow: "0 8px 24px rgba(0,0,0,.18)"
    }}>
      <div style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "flex-start",
        gap: 16
      }}>
        <div>
          <div style={{
            fontSize: 24,
            fontWeight: 800,
            letterSpacing: ".02em"
          }}>
            {row.instrument.symbol}
          </div>
          <div style={{
            color: tone.text,
            fontWeight: 700,
            marginTop: 4
          }}>
            {signal.status || "WATCHING"}
          </div>
        </div>

        <div style={{
          textAlign: "right",
          fontSize: 13
        }}>
          <div style={{ color: "#9ca3af" }}>
            Action
          </div>
          <strong style={{ fontSize: 20 }}>
            {signal.action || "HOLD"}
          </strong>
        </div>
      </div>

      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(2,minmax(0,1fr))",
        gap: 10,
        marginTop: 18
      }}>
        <div>
          <span style={{ color: "#9ca3af", fontSize: 12 }}>
            Reference
          </span>
          <div>{price(signal.referenceEntry)}</div>
        </div>
        <div>
          <span style={{ color: "#9ca3af", fontSize: 12 }}>
            Spread
          </span>
          <div>{number(row.quote?.spreadPips)} pips</div>
        </div>
        <div>
          <span style={{ color: "#9ca3af", fontSize: 12 }}>
            Stop
          </span>
          <div>{price(signal.stopLoss)}</div>
        </div>
        <div>
          <span style={{ color: "#9ca3af", fontSize: 12 }}>
            Target
          </span>
          <div>{price(signal.takeProfit)}</div>
        </div>
      </div>

      <div style={{
        borderTop: "1px solid rgba(255,255,255,.12)",
        marginTop: 16,
        paddingTop: 12
      }}>
        <CheckRow label="EMA trend" value={signal.checks?.emaTrend} />
        <CheckRow label="Pullback" value={signal.checks?.pullback} />
        <CheckRow label="RSI reset" value={signal.checks?.rsiReset} />
        <CheckRow label="RSI trigger" value={signal.checks?.rsiTrigger} />
        <CheckRow label="MACD cross" value={signal.checks?.macdCross} />
        <CheckRow label="Price break" value={signal.checks?.previousBarBreak} />
      </div>

      <div style={{
        borderTop: "1px solid rgba(255,255,255,.12)",
        marginTop: 12,
        paddingTop: 12,
        display: "grid",
        gap: 6,
        fontSize: 13
      }}>
        <div>
          H1 bias: <strong>{signal.regime?.bias || "NONE"}</strong>
        </div>
        <div>
          ADX: <strong>{number(signal.regime?.checks?.adx)}</strong>
        </div>
        <div>
          Risk budget: <strong>
            {risk ? money(risk.riskBudget) : "—"}
          </strong>
        </div>
        <div>
          0.01-lot risk estimate: <strong>
            {risk?.minLotRisk != null
              ? money(risk.minLotRisk)
              : "—"}
          </strong>
        </div>
        {signal.blocks?.length ? (
          <div style={{ color: "#fecaca" }}>
            Blocked by: {signal.blocks.join(", ")}
          </div>
        ) : null}
      </div>

      <div style={{
        marginTop: 14,
        borderRadius: 10,
        padding: "10px 12px",
        background: "rgba(0,0,0,.24)",
        display: "flex",
        justifyContent: "space-between",
        gap: 12
      }}>
        <span>Execution</span>
        <strong style={{
          color: executionTone(execution.status)
        }}>
          {execution.status || "BLOCKED"}
          {execution.reason
            ? ` · ${execution.reason}`
            : ""}
        </strong>
      </div>
    </article>
  );
}

export default async function Home() {
  let scan = null;
  let error = null;

  try {
    scan = await scanPreferredForexSignals();
  } catch (e) {
    error = e.message;
  }

  return (
    <main style={{
      maxWidth: 1180,
      margin: "0 auto",
      padding: "28px 20px 60px",
      fontFamily: "Arial, Helvetica, sans-serif",
      color: "#f9fafb",
      background: "#030712",
      minHeight: "100vh"
    }}>
      <header style={{ marginBottom: 26 }}>
        <div style={{
          fontSize: 12,
          letterSpacing: ".12em",
          color: "#60a5fa",
          fontWeight: 700
        }}>
          TRADELOCKER FOREX
        </div>
        <h1 style={{
          fontSize: 36,
          margin: "6px 0 8px"
        }}>
          Forex Signal Console
        </h1>
        <p style={{
          color: "#9ca3af",
          maxWidth: 760,
          lineHeight: 1.6
        }}>
          Strategy V1 scans TradeLocker forex data directly.
          Signals are informational during validation; the existing
          risk engine and execution guards remain authoritative.
        </p>
      </header>

      <section style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))",
        gap: 12,
        marginBottom: 24
      }}>
        <div style={{
          padding: 14,
          borderRadius: 12,
          background: "#111827"
        }}>
          <div style={{ color: "#9ca3af", fontSize: 12 }}>
            Strategy
          </div>
          <strong>H1 Trend + M15 Pullback</strong>
        </div>
        <div style={{
          padding: 14,
          borderRadius: 12,
          background: "#111827"
        }}>
          <div style={{ color: "#9ca3af", fontSize: 12 }}>
            Baseline capital
          </div>
          <strong>$150</strong>
        </div>
        <div style={{
          padding: 14,
          borderRadius: 12,
          background: "#111827"
        }}>
          <div style={{ color: "#9ca3af", fontSize: 12 }}>
            Max risk / trade
          </div>
          <strong>1%</strong>
        </div>
        <div style={{
          padding: 14,
          borderRadius: 12,
          background: "#111827"
        }}>
          <div style={{ color: "#9ca3af", fontSize: 12 }}>
            Target
          </div>
          <strong>1.8R</strong>
        </div>
      </section>

      {error ? (
        <div style={{
          border: "1px solid #dc2626",
          background: "#450a0a",
          borderRadius: 12,
          padding: 16,
          color: "#fecaca"
        }}>
          Signal scan unavailable: {error}
        </div>
      ) : (
        <>
          <div style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 12,
            marginBottom: 12,
            color: "#9ca3af",
            fontSize: 13
          }}>
            <span>
              Pairs found: {scan?.foundSymbols?.join(", ") || "none"}
            </span>
            <span>
              Updated: {
                scan?.generatedAt
                  ? new Date(scan.generatedAt).toISOString()
                  : "—"
              }
            </span>
          </div>

          <section style={{
            display: "grid",
            gridTemplateColumns:
              "repeat(auto-fit,minmax(260px,1fr))",
            gap: 16
          }}>
            {(scan?.results || []).map(row => (
              <SignalCard
                key={row.instrument?.symbol || row.error}
                row={row}
              />
            ))}
          </section>
        </>
      )}

      <section style={{
        marginTop: 30,
        padding: 18,
        borderRadius: 14,
        background: "#111827"
      }}>
        <h2 style={{ marginTop: 0 }}>Signal states</h2>
        <p style={{ color: "#9ca3af", lineHeight: 1.6 }}>
          WATCHING means no qualified setup yet. SETUP_FORMING means
          several requirements are aligned. SIGNAL_READY means the
          strategy conditions are complete. BLOCKED means the system
          is standing down because of session, event-risk, volatility,
          data warmup, or another protection.
        </p>
        <p style={{ color: "#9ca3af", marginBottom: 0 }}>
          Refresh the page to request a new TradeLocker scan.
          Automated refresh/streaming can be added after the
          read-only signal path is validated.
        </p>
      </section>
    </main>
  );
}
