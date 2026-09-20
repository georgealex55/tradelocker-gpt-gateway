import { NextResponse } from "next/server";
import {
  killSwitchEnabled,
  killSwitchRawState
} from "../../../../lib/tradeGuard";

function maskAccountId(value) {
  if (!value) return null;
  const s = String(value);
  if (s.length <= 4) return s;
  return "*".repeat(Math.max(0, s.length - 4)) + s.slice(-4);
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    runtime: {
      tradingEnabled: String(process.env.TRADING_ENABLED || "false").toLowerCase() === "true",
      killSwitch: killSwitchEnabled(),
      killSwitchRawState: killSwitchRawState(),
      expectedAccountId: maskAccountId(
        process.env.EXPECTED_ACCOUNT_ID || process.env.TRADELOCKER_ACCOUNT_ID
      ),
      maxRiskPercent: process.env.MAX_RISK_PERCENT || "1",
      maxSpreadPips: process.env.MAX_SPREAD_PIPS || "3",
      maxLotsPerTrade: process.env.MAX_LOTS_PER_TRADE || "0.01",
      maxOrderUnits: process.env.MAX_ORDER_UNITS || "1000",
      staleQuoteGuard:
        String(process.env.STALE_QUOTE_GUARD || "true").toLowerCase() === "true",
      idempotencyRequired:
        String(process.env.IDEMPOTENCY_REQUIRED || "true").toLowerCase() === "true",
      vercelEnv: process.env.VERCEL_ENV || null,
      vercelGitCommitSha: process.env.VERCEL_GIT_COMMIT_SHA || null,
      vercelGitCommitRef: process.env.VERCEL_GIT_COMMIT_REF || null
    }
  });
}
