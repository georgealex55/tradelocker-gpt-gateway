"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const POLL_MS = 30000;

function fmt(value, digits = 5) {
  const n = Number(value);
  return Number.isFinite(n) ? n.toFixed(digits) : "—";
}

function pct(value, digits = 1) {
  const n = Number(value);
  return Number.isFinite(n) ? `${(n * 100).toFixed(digits)}%` : "—";
}

function time(value) {
  if (!value) return "—";
  const n = Number(value);
  const date = Number.isFinite(n) ? new Date(n) : new Date(value);
  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit"
      });
}

function statusStyle(status) {
  if (status === "SIGNAL_READY") {
    return {
      border: "#22c55e",
      glow: "0 0 32px rgba(34,197,94,.32)",
      badge: "#16a34a",
      label: "SIGNAL READY"
    };
  }

  if (status === "BLOCKED") {
    return {
      border: "#ef4444",
      glow: "0 0 24px rgba(239,68,68,.18)",
      badge: "#b91c1c",
      label: "BLOCKED"
    };
  }

  if (status === "SETUP_FORMING") {
    return {
      border: "#f59e0b",
      glow: "0 0 24px rgba(245,158,11,.18)",
      badge: "#b45309",
      label: "SETUP FORMING"
    };
  }

  return {
    border: "#3b82f6",
    glow: "0 0 18px rgba(59,130,246,.14)",
    badge: "#1d4ed8",
    label: "WATCHING"
  };
}

function Metric({ label, value, strong = false }) {
  return (
    <div style={{
      padding: "9px 10px",
      borderRadius: 10,
      background: "rgba(255,255,255,.045)",
      minWidth: 0
    }}>
      <div style={{
        fontSize: 10,
        color: "#94a3b8",
        textTransform: "uppercase",
        letterSpacing: ".07em",
        marginBottom: 4
      }}>
        {label}
      </div>
      <div style={{
        fontSize: strong ? 18 : 13,
        fontWeight: strong ? 800 : 700,
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap"
      }}>
        {value}
      </div>
    </div>
  );
}

function Pass({ label, ok, value }) {
  return (
    <div style={{
      display: "flex",
      justifyContent: "space-between",
      gap: 10,
      padding: "5px 0",
      borderBottom: "1px solid rgba(255,255,255,.05)",
      fontSize: 12
    }}>
      <span style={{ color: "#cbd5e1" }}>{label}</span>
      <strong style={{ color: ok ? "#86efac" : "#fca5a5" }}>
        {value ?? (ok ? "PASS" : "WAIT")}
      </strong>
    </div>
  );
}

function SignalPanel({ data, error, loading }) {
  const signal = data?.signal || null;
  const status = signal?.status || "WATCHING";
  const tone = statusStyle(status);
  const quality = signal?.breakoutQuality || {};
  const bos = signal?.structureEvent;
  const high = signal?.latestHigh;
  const low = signal?.latestLow;
  const ready = status === "SIGNAL_READY";

  return (
    <section
      id="structure-a2-floating-panel"
      style={{
        width: "100%",
        boxSizing: "border-box",
        background: "#070b14",
        color: "#f8fafc",
        border: `2px solid ${tone.border}`,
        borderRadius: 18,
        padding: 16,
        boxShadow: tone.glow,
        fontFamily:
          "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
      }}
    >
      <div style={{
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "space-between",
        gap: 12
      }}>
        <div>
          <div style={{
            fontSize: 11,
            letterSpacing: ".14em",
            color: "#60a5fa",
            fontWeight: 800
          }}>
            STRUCTURE A2 · LIVE SHADOW
          </div>
          <div style={{
            fontSize: 27,
            fontWeight: 900,
            marginTop: 3
          }}>
            USDCHF
          </div>
        </div>

        <div style={{
          background: tone.badge,
          color: "#fff",
          borderRadius: 999,
          padding: "7px 10px",
          fontSize: 11,
          fontWeight: 900,
          letterSpacing: ".06em"
        }}>
          {loading && !signal ? "LOADING" : tone.label}
        </div>
      </div>

      {error ? (
        <div style={{
          marginTop: 14,
          padding: 10,
          borderRadius: 10,
          background: "#450a0a",
          color: "#fecaca",
          fontSize: 12
        }}>
          {error}
        </div>
      ) : null}

      <div style={{
        marginTop: 14,
        padding: "12px 14px",
        borderRadius: 12,
        background: ready
          ? "rgba(34,197,94,.13)"
          : "rgba(255,255,255,.04)",
        border: ready
          ? "1px solid rgba(34,197,94,.45)"
          : "1px solid rgba(255,255,255,.07)"
      }}>
        <div style={{
          fontSize: 11,
          color: "#94a3b8",
          marginBottom: 3
        }}>
          Current instruction
        </div>
        <div style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: 8
        }}>
          <strong style={{
            fontSize: 26,
            color: signal?.action === "SELL"
              ? "#fb7185"
              : "#e2e8f0"
          }}>
            {signal?.action || "HOLD"}
          </strong>
          <span style={{
            color: "#94a3b8",
            fontSize: 11,
            textAlign: "right"
          }}>
            {signal?.candidateStage || "Waiting for scanner data"}
          </span>
        </div>
      </div>

      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(3,minmax(0,1fr))",
        gap: 8,
        marginTop: 10
      }}>
        <Metric
          label="Trend"
          value={signal?.structureTrend || "—"}
          strong
        />
        <Metric
          label="Spread"
          value={signal?.spreadPips != null
            ? `${fmt(signal.spreadPips, 1)} p`
            : "—"}
          strong
        />
        <Metric
          label="Fresh"
          value={signal?.freshForEntry === true
            ? "YES"
            : signal?.freshForEntry === false
              ? "NO"
              : "—"}
          strong
        />
      </div>

      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(2,minmax(0,1fr))",
        gap: 8,
        marginTop: 8
      }}>
        <Metric label="Entry" value={fmt(signal?.referenceEntry)} />
        <Metric label="Stop" value={fmt(signal?.stopLoss)} />
        <Metric
          label="Stop distance"
          value={signal?.stopPips != null
            ? `${fmt(signal.stopPips, 1)} pips`
            : "—"}
        />
        <Metric
          label="ATR"
          value={fmt(signal?.atr)}
        />
      </div>

      <div style={{
        marginTop: 12,
        borderTop: "1px solid rgba(255,255,255,.08)",
        paddingTop: 10
      }}>
        <div style={{
          fontSize: 11,
          color: "#94a3b8",
          textTransform: "uppercase",
          letterSpacing: ".08em",
          marginBottom: 4
        }}>
          Structure
        </div>
        <Pass
          label="Market structure"
          ok={signal?.structureTrend === "BEARISH"}
          value={signal?.structureTrend || "—"}
        />
        <Pass
          label="Last swing high"
          ok={high?.label === "LH"}
          value={high?.label
            ? `${high.label} · ${fmt(high.price)}`
            : "—"}
        />
        <Pass
          label="Last swing low"
          ok={low?.label === "LL"}
          value={low?.label
            ? `${low.label} · ${fmt(low.price)}`
            : "—"}
        />
        <Pass
          label="Structure event"
          ok={bos?.type === "BOS_BEARISH"}
          value={bos?.type || "—"}
        />
      </div>

      <div style={{
        marginTop: 10,
        borderTop: "1px solid rgba(255,255,255,.08)",
        paddingTop: 10
      }}>
        <div style={{
          fontSize: 11,
          color: "#94a3b8",
          textTransform: "uppercase",
          letterSpacing: ".08em",
          marginBottom: 4
        }}>
          Breakout quality
        </div>
        <Pass
          label="Close location ≥ 75%"
          ok={quality.closeLocationPass === true}
          value={quality.closeLocation != null
            ? pct(quality.closeLocation)
            : "—"}
        />
        <Pass
          label="Body ≥ 50%"
          ok={quality.bodyFractionPass === true}
          value={quality.bodyFraction != null
            ? pct(quality.bodyFraction)
            : "—"}
        />
        <Pass
          label="Displacement ≥ 0.10 ATR"
          ok={quality.displacementPass === true}
          value={quality.displacementATR != null
            ? `${fmt(quality.displacementATR, 2)} ATR`
            : "—"}
        />
      </div>

      {signal?.blocks?.length ? (
        <div style={{
          marginTop: 10,
          padding: "8px 10px",
          borderRadius: 9,
          background: "rgba(239,68,68,.12)",
          color: "#fecaca",
          fontSize: 11
        }}>
          Blocked: {signal.blocks.join(", ")}
        </div>
      ) : null}

      <div style={{
        marginTop: 12,
        display: "flex",
        justifyContent: "space-between",
        gap: 10,
        color: "#64748b",
        fontSize: 10
      }}>
        <span>
          Candle: {time(signal?.candleTime)}
        </span>
        <span>
          Updated: {time(signal?.updatedAt || data?.generatedAt)}
        </span>
      </div>

      <div style={{
        marginTop: 8,
        paddingTop: 8,
        borderTop: "1px solid rgba(255,255,255,.06)",
        color: "#64748b",
        fontSize: 10,
        textAlign: "center"
      }}>
        SHADOW ONLY · NO BROKER ORDER
      </div>
    </section>
  );
}

export default function StructureA2Console() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [floating, setFloating] = useState(false);
  const panelRef = useRef(null);
  const hostRef = useRef(null);
  const pipWindowRef = useRef(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch(
        "/api/public/structure-a2-status",
        { cache: "no-store" }
      );
      const body = await response.json();

      if (!response.ok || body.ok !== true) {
        throw new Error(body.error || "Signal feed unavailable");
      }

      setData(body);
      setError(null);
    } catch (err) {
      setError(String(err?.message || err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const id = window.setInterval(load, POLL_MS);
    return () => window.clearInterval(id);
  }, [load]);

  useEffect(() => {
    return () => {
      try {
        pipWindowRef.current?.close();
      } catch {}
    };
  }, []);

  const openFloating = async () => {
    const panel = panelRef.current;
    if (!panel) return;

    if ("documentPictureInPicture" in window) {
      try {
        const pipWindow =
          await window.documentPictureInPicture.requestWindow({
            width: 390,
            height: 720
          });

        pipWindow.document.body.style.margin = "0";
        pipWindow.document.body.style.padding = "10px";
        pipWindow.document.body.style.background = "#020617";
        pipWindow.document.body.style.overflow = "auto";
        pipWindow.document.body.appendChild(panel);

        pipWindowRef.current = pipWindow;
        setFloating(true);

        pipWindow.addEventListener("pagehide", () => {
          if (hostRef.current && panel) {
            hostRef.current.appendChild(panel);
          }
          pipWindowRef.current = null;
          setFloating(false);
        }, { once: true });

        return;
      } catch {}
    }

    window.open(
      "/structure-a2-console",
      "StructureA2SignalConsole",
      "popup=yes,width=420,height=780,resizable=yes,scrollbars=yes"
    );
  };

  const returnPanel = () => {
    const panel = panelRef.current;
    const host = hostRef.current;

    if (panel && host) {
      host.appendChild(panel);
    }

    try {
      pipWindowRef.current?.close();
    } catch {}

    pipWindowRef.current = null;
    setFloating(false);
  };

  return (
    <main style={{
      minHeight: "100vh",
      background:
        "radial-gradient(circle at top,#111827 0,#030712 52%,#020617 100%)",
      color: "#f8fafc",
      padding: "24px 16px 48px",
      fontFamily:
        "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    }}>
      <div style={{
        maxWidth: 720,
        margin: "0 auto"
      }}>
        <header style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-end",
          gap: 16,
          marginBottom: 18,
          flexWrap: "wrap"
        }}>
          <div>
            <div style={{
              color: "#60a5fa",
              fontSize: 11,
              fontWeight: 800,
              letterSpacing: ".12em"
            }}>
              TRADELOCKER COMPANION
            </div>
            <h1 style={{
              fontSize: 30,
              margin: "5px 0"
            }}>
              Structure A2 Signal Screen
            </h1>
            <div style={{
              color: "#94a3b8",
              fontSize: 13
            }}>
              Keep this beside or above TradeLocker while the shadow scanner runs.
            </div>
          </div>

          <div style={{
            display: "flex",
            gap: 8,
            flexWrap: "wrap"
          }}>
            <button
              onClick={load}
              type="button"
              style={{
                border: "1px solid #334155",
                background: "#0f172a",
                color: "#e2e8f0",
                borderRadius: 10,
                padding: "9px 12px",
                fontWeight: 800,
                cursor: "pointer"
              }}
            >
              Refresh
            </button>
            <button
              onClick={floating ? returnPanel : openFloating}
              type="button"
              style={{
                border: "1px solid #2563eb",
                background: floating ? "#334155" : "#1d4ed8",
                color: "#fff",
                borderRadius: 10,
                padding: "9px 12px",
                fontWeight: 900,
                cursor: "pointer"
              }}
            >
              {floating ? "Return Panel" : "Always on Top"}
            </button>
          </div>
        </header>

        <div ref={hostRef}>
          <div ref={panelRef}>
            <SignalPanel
              data={data}
              error={error}
              loading={loading}
            />
          </div>
        </div>

        <section style={{
          marginTop: 16,
          padding: 14,
          borderRadius: 12,
          background: "rgba(15,23,42,.75)",
          border: "1px solid #1e293b",
          color: "#94a3b8",
          fontSize: 12,
          lineHeight: 1.55
        }}>
          The panel refreshes every 30 seconds from the latest persisted
          Structure A2 shadow observation. The scanner itself remains
          read-only and continues on its normal production schedule.
          “Always on Top” uses browser Picture-in-Picture when supported;
          otherwise it opens a compact pop-out window.
        </section>
      </div>
    </main>
  );
}
