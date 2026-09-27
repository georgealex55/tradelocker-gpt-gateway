import { runUsdchfResearch } from "../../lib/usdchfResearch";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function n(value, digits = 2) {
  const num = Number(value);
  return Number.isFinite(num) ? num.toFixed(digits) : "—";
}

function signed(value, suffix = "") {
  const num = Number(value);
  if (!Number.isFinite(num)) return "—";
  return `${num >= 0 ? "+" : ""}${num.toFixed(2)}${suffix}`;
}

function pct(value) {
  const num = Number(value);
  return Number.isFinite(num) ? `${num.toFixed(2)}%` : "—";
}

function money(value) {
  const num = Number(value);
  return Number.isFinite(num) ? `$${num.toFixed(2)}` : "—";
}

function Metric({ label, value }) {
  return (
    <div style={{
      padding: 10,
      background: "#111827",
      borderRadius: 10
    }}>
      <div style={{ fontSize: 11, color: "#9ca3af" }}>{label}</div>
      <strong>{value}</strong>
    </div>
  );
}

function BreakdownTable({ title, rows }) {
  return (
    <div style={{
      background: "#0f172a",
      border: "1px solid #374151",
      borderRadius: 12,
      padding: 14,
      overflowX: "auto"
    }}>
      <h3 style={{ marginTop: 0 }}>{title}</h3>
      <table style={{
        width: "100%",
        borderCollapse: "collapse",
        fontSize: 12
      }}>
        <thead>
          <tr style={{ color: "#9ca3af", textAlign: "left" }}>
            <th>Group</th>
            <th>Trades</th>
            <th>Win%</th>
            <th>Total R</th>
            <th>Expectancy</th>
          </tr>
        </thead>
        <tbody>
          {(rows || []).map(row => (
            <tr
              key={row.key}
              style={{ borderTop: "1px solid #1f2937" }}
            >
              <td>{row.key}</td>
              <td>{row.trades}</td>
              <td>{pct(row.winRate)}</td>
              <td>{n(row.totalR)}R</td>
              <td>{n(row.expectancyR)}R</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ResultCard({ result, accent }) {
  const s = result?.summary || {};

  return (
    <article style={{
      padding: 18,
      borderRadius: 16,
      background: "#111827",
      border: `1px solid ${accent}`
    }}>
      <h2 style={{ marginTop: 0 }}>{result?.label || "Result"}</h2>

      <div style={{
        display: "grid",
        gridTemplateColumns:
          "repeat(auto-fit,minmax(120px,1fr))",
        gap: 8
      }}>
        <Metric label="Risk ceiling" value="1%" />
        <Metric label="Trades" value={s.trades ?? "—"} />
        <Metric label="Win rate" value={pct(s.winRate)} />
        <Metric label="Profit factor" value={n(s.profitFactor)} />
        <Metric
          label="Expectancy"
          value={`${n(s.expectancyR)}R`}
        />
        <Metric label="Total R" value={`${n(s.totalR)}R`} />
        <Metric label="Return" value={pct(s.returnPercent)} />
        <Metric
          label="Max DD"
          value={pct(s.maxDrawdownPercent)}
        />
        <Metric
          label="End balance"
          value={money(s.endingBalance)}
        />
        <Metric
          label="Min-lot skips"
          value={s.minLotRiskSkips ?? "—"}
        />
      </div>

      <div style={{
        display: "grid",
        gridTemplateColumns:
          "repeat(auto-fit,minmax(220px,1fr))",
        gap: 12,
        marginTop: 14
      }}>
        <div style={{
          background: "#0f172a",
          padding: 12,
          borderRadius: 10
        }}>
          <strong>Longs</strong>
          <div>Trades: {s.long?.trades ?? 0}</div>
          <div>Win rate: {pct(s.long?.winRate)}</div>
          <div>Total: {n(s.long?.totalR)}R</div>
        </div>

        <div style={{
          background: "#0f172a",
          padding: 12,
          borderRadius: 10
        }}>
          <strong>Shorts</strong>
          <div>Trades: {s.short?.trades ?? 0}</div>
          <div>Win rate: {pct(s.short?.winRate)}</div>
          <div>Total: {n(s.short?.totalR)}R</div>
        </div>

        <div style={{
          background: "#0f172a",
          padding: 12,
          borderRadius: 10
        }}>
          <strong>Stop distance</strong>
          <div>
            Median: {n(s.stopDistance?.medianPips)} pips
          </div>
          <div>
            Average: {n(s.stopDistance?.averagePips)} pips
          </div>
          <div>
            Range: {n(s.stopDistance?.minPips)}–
            {n(s.stopDistance?.maxPips)} pips
          </div>
        </div>
      </div>

      <div style={{
        display: "grid",
        gap: 12,
        marginTop: 14
      }}>
        <BreakdownTable
          title="By month"
          rows={s.byMonth}
        />
        <BreakdownTable
          title="By entry hour (UTC)"
          rows={s.byHourUtc}
        />
      </div>
    </article>
  );
}

export default async function BacktestsPage() {
  let report = null;
  let error = null;

  try {
    report = await runUsdchfResearch();
  } catch (e) {
    error = e.message;
  }

  const comparison = report?.comparison || {};
  const counts = report?.macroCalendar?.counts || {};

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

      <h1>USDCHF Capital + Macro Validation</h1>

      <p style={{
        color: "#9ca3af",
        lineHeight: 1.6,
        maxWidth: 900
      }}>
        The USDCHF strategy keeps the 1% risk ceiling while testing the configured capital profile. This rerun keeps every
        strategy, sizing, spread, slippage, stop and target rule
        unchanged and adds only historical no-entry windows around
        official U.S. CPI, U.S. Employment Situation, FOMC policy
        decisions and SNB policy decisions.
      </p>

      {error ? (
        <div style={{
          padding: 16,
          borderRadius: 12,
          background: "#450a0a",
          color: "#fecaca"
        }}>
          Research error: {error}
        </div>
      ) : (
        <>
          <section style={{
            display: "grid",
            gridTemplateColumns:
              "repeat(auto-fit,minmax(160px,1fr))",
            gap: 10,
            margin: "20px 0"
          }}>
            <Metric label="Pair" value="USDCHF" />
            <Metric
              label="Period"
              value="2024-01-01 → 2026-09-25"
            />
            <Metric
              label="Bars downloaded"
              value={report?.barsDownloaded ?? "—"}
            />
            <Metric label="Starting capital" value={money(report?.assumptions?.startingBalance)} />
            <Metric label="Locked risk" value="1%" />
            <Metric label="Target" value="1.8R" />
            <Metric
              label="Macro events"
              value={counts.total ?? "—"}
            />
            <Metric
              label="CPI / Jobs / FOMC / SNB"
              value={
                counts.total != null
                  ? `${counts.cpi}/${counts.employment}/${counts.fomc}/${counts.snb}`
                  : "—"
              }
            />
          </section>

          <section style={{
            padding: 18,
            borderRadius: 14,
            background: "#0f172a",
            border: "1px solid #374151",
            marginBottom: 20
          }}>
            <h2 style={{ marginTop: 0 }}>
              Macro-filter impact
            </h2>

            <div style={{
              display: "grid",
              gridTemplateColumns:
                "repeat(auto-fit,minmax(160px,1fr))",
              gap: 10
            }}>
              <Metric
                label="Trades removed"
                value={comparison.tradesRemoved ?? "—"}
              />
              <Metric
                label="Total R change"
                value={signed(comparison.totalRChange, "R")}
              />
              <Metric
                label="Expectancy change"
                value={signed(
                  comparison.expectancyRChange,
                  "R"
                )}
              />
              <Metric
                label="Return change"
                value={signed(
                  comparison.returnPercentChange,
                  "%"
                )}
              />
              <Metric
                label="Max DD change"
                value={signed(
                  comparison.maxDrawdownPercentChange,
                  "%"
                )}
              />
              <Metric
                label="Ending balance change"
                value={money(comparison.endingBalanceChange)}
              />
            </div>
          </section>

          <section style={{ display: "grid", gap: 20 }}>
            <ResultCard
              result={report?.baseline}
              accent="#2563eb"
            />
            <ResultCard
              result={report?.macroFiltered}
              accent="#16a34a"
            />
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
