import { NextResponse } from "next/server";
import { killSwitchEnabled } from "../../../../lib/tradeGuard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const SYMBOLS = ["USDCHF", "EURUSD", "GBPUSD"];
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function authorized(request) {
  if (process.env.VERCEL_ENV !== "production") return true;
  const secret = process.env.CRON_SECRET;
  return Boolean(
    secret && request.headers.get("authorization") === "Bearer " + secret
  );
}

function safetyState() {
  return {
    tradingEnabled:
      String(process.env.TRADING_ENABLED || "false").toLowerCase() === "true",
    killSwitch: killSwitchEnabled()
  };
}

async function runOne(origin, symbol, secret) {
  const url = new URL("/api/trading/scalp-dry-run", origin);
  url.searchParams.set("symbol", symbol);

  let last = null;

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const response = await fetch(url, {
        method: "GET",
        cache: "no-store",
        signal: AbortSignal.timeout(90000),
        headers: secret ? { authorization: "Bearer " + secret } : {}
      });

      const text = await response.text();
      let body;
      try { body = JSON.parse(text); }
      catch { body = { ok:false, error:text || "NON_JSON_RESPONSE" }; }

      last = {
        symbol,
        attempt,
        httpStatus: response.status,
        ...body
      };

      const errorText = String(body?.error || "");
      const retryable =
        response.status === 429 ||
        response.status >= 500 ||
        errorText.includes("429") ||
        errorText.toLowerCase().includes("rate limit");

      if (!retryable) return last;
    } catch (error) {
      last = {
        symbol,
        attempt,
        ok:false,
        error:String(error?.message || error)
      };
    }

    if (attempt < 3) await sleep(1500 * attempt);
  }

  return last;
}

export async function GET(request) {
  if (!authorized(request)) {
    return NextResponse.json(
      { ok:false, error:"Unauthorized scalp dry-run cron request" },
      { status:401 }
    );
  }

  const safety = safetyState();
  if (safety.tradingEnabled || !safety.killSwitch) {
    return NextResponse.json(
      {
        ok:false,
        mode:"SCALP_2M_DRY_RUN_CRON",
        liveExecutionPossible:false,
        error:"CRON_REQUIRES_TRADING_DISABLED_AND_KILL_SWITCH_ON",
        safety:{ ...safety, brokerOrderSubmitted:false }
      },
      { status:409, headers:{ "Cache-Control":"no-store" } }
    );
  }

  const origin = new URL(request.url).origin;
  const secret = process.env.CRON_SECRET || "";
  const results = [];

  for (let i = 0; i < SYMBOLS.length; i++) {
    if (i > 0) await sleep(1250);
    results.push(await runOne(origin, SYMBOLS[i], secret));
  }

  const summary = {
    fresh: results.filter(r => r?.status === "DRY_RUN_COMPLETE").length,
    blocked: results.filter(r => r?.status === "BLOCKED" || r?.status === "RISK_REJECTED").length,
    noFreshEntry: results.filter(r => r?.status === "NO_FRESH_ENTRY").length,
    idempotentReplay: results.filter(r => r?.status === "IDEMPOTENT_REPLAY").length,
    errors: results.filter(r => r?.ok === false).length
  };

  return NextResponse.json(
    {
      ok: summary.errors === 0,
      mode:"SCALP_2M_DRY_RUN_CRON",
      scheduled:true,
      cadence:"*/5 * * * *",
      generatedAt:Date.now(),
      symbols:SYMBOLS,
      summary,
      results,
      safety:{
        ...safety,
        liveExecutionPossible:false,
        brokerOrderSubmitted:false
      }
    },
    { headers:{ "Cache-Control":"no-store" } }
  );
}
