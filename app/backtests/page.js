import {
  runForexValidationMatrix
} from "../../lib/forexValidation";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function pct(value) {
  const n = Number(value);
  return Number.isFinite(n) ? `${n.toFixed(2)}%` : "—";
}

function num(value, digits = 2) {
  const n = Number(value);
  return Number.isFinite(n) ? n.toFixed(digits) : "—";
}

function money(value) {
  const n = Number(value);
  return Number.isFinite(n) ? `$${n.toFixed(2)}` : "—";
}

function Metric({ label, value }) {
  return (
    <div style={{
      padding: 10,
      background: "#111827",
      borderRadius: 10
    }}>
      <div style={{
        fontSize: 11,
        color: "#9ca3af",
        marginBottom: 4
      }}>
        {label}
      </div>
      <strong>{value}</strong>
    </div>
  );
}

function PeriodCard({ title, result }) {
  const s = result?.summary || {};

  return (
    <div style={{
      border: "1px solid #374151",
      borderRadius: 14,
      padding: 16,
      background: "#0f172a"
    }}>
      <h3 style={{ marginTop: 0 }}>{title}</h3>
      <div style={{
        fontSize: 12,
        color: "#9ca3af",
        marginBottom: 12
      }}>
        {result?.period?.from?.slice(0, 10)} → {
          result?.period?.to?.slice(0, 10)
        }
      </div>
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(3,minmax(0,1fr))",
        gap: 8
      }}>
        <Metric label="Trades" value={s.trades ?? "—"} />
        <Metric label="Win rate" value={pct(s.winRate)} />
        <Metric label="Profit factor" value={num(s.profitFactor)} />
        <Metric label="Expectancy" value={`${num(s.expectancyR)}R`} />
        <Metric label="Total R" value={`${num(s.totalR)}R`} />
        <Metric label="Return" value={pct(s.returnPercent)} />
        <Metric label="Max DD" value={pct(s.maxDrawdownPercent)} />
        <Metric label="End balance" value={money(s.endingBalance)} />
        <Metric label="Min-lot skips" value={s.minLotRiskSkips ?? "—"} />
      </div>
      <div style={{
        marginTop: 10,
        color: "#9ca3af",
        fontSize: 12
      }}>
        Risk/guard skips: {s.guardSkips ?? 0} · Total skipped signals: {
          s.skippedSignals ?? 0
        }
      </div>
    </div>
  );
}

export default async function BacktestsPage() {
  let report = null;
  let error = null;

  try {
    report = await runForexValidationMatrix();
  } catch (e) {
    error = e.message;
  }

  return (
    <main style={{
      maxWidth: 1200,
      margin: "0 auto",
      padding: "28px 20px 60px",
      fontFamily: "Arial, Helvetica, sans-serif",
      color: "#f9fafb",
      background: "#030712",
      minHeight: "100vh"
    }}>
      <a href="/" style={{ color: "#60a5fa" }}>
        ← Signal Console
      </a>

      <h1>Strategy V1 Validation</h1>

      <p style={{
        color: "#9ca3af",
        lineHeight: 1.6,
        maxWidth: 850
      }}>
        Chronological development and out-of-sample validation using
        TradeLocker 15-minute forex history, completed 1-hour regime
        candles, broker minimum-lot sizing, $150 starting capital,
        1% risk, 2-pip spread and 0.2-pip slippage assumptions.
        Parameters are unchanged between periods.
      </p>

      {error ? (
        <div style={{
          padding: 16,
          borderRadius: 12,
          border: "1px solid #dc2626",
          background: "#450a0a",
          color: "#fecaca"
        }}>
          Validation error: {error}
        </div>
      ) : (
        <>
          <section style={{
            display: "grid",
            gridTemplateColumns:
              "repeat(auto-fit,minmax(180px,1fr))",
            gap: 10,
            margin: "20px 0 26px"
          }}>
            <Metric label="Starting capital" value="$150" />
            <Metric label="Risk / trade" value="1%" />
            <Metric label="Max lot" value="0.01" />
            <Metric label="Target" value="1.8R" />
            <Metric label="Spread assumption" value="2.0 pips" />
            <Metric label="Slippage" value="0.2 pips" />
          </section>

          <section style={{ display: "grid", gap: 22 }}>
            {(report?.rows || []).map(row => (
              <article key={row.symbol} style={{
                padding: 18,
                borderRadius: 16,
                background: "#111827"
              }}>
                <h2 style={{ marginTop: 0 }}>{row.symbol}</h2>

                {!row.ok ? (
                  <div style={{ color: "#fca5a5" }}>
                    {row.error}
                  </div>
                ) : (
                  <>
                    <div style={{
                      color: "#9ca3af",
                      fontSize: 12,
                      marginBottom: 12
                    }}>
                      TradeLocker bars downloaded: {row.barsDownloaded}
                    </div>

                    <div style={{
                      display: "grid",
                      gridTemplateColumns:
                        "repeat(auto-fit,minmax(320px,1fr))",
                      gap: 14
                    }}>
                      <PeriodCard
                        title="Development"
                        result={row.development}
                      />
                      <PeriodCard
                        title="Out of sample"
                        result={row.outOfSample}
                      />
                    </div>
                  </>
                )}
              </article>
            ))}
          </section>

          <div style={{
            marginTop: 24,
            color: "#9ca3af",
            fontSize: 12
          }}>
            Generated: {
              report?.generatedAt
                ? new Date(report.generatedAt).toISOString()
                : "—"
            }
          </div>
        </>
      )}
    </main>
  );
}
