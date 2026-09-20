import { NextResponse } from "next/server";
import { tlFetch, accountId } from "../../../../lib/tradelocker";

function findKey(obj, target) {
  if (!obj || typeof obj !== "object") return null;

  for (const [k, v] of Object.entries(obj)) {
    if (k.toLowerCase() === target.toLowerCase()) {
      return { key: k, value: v };
    }
  }

  for (const v of Object.values(obj)) {
    const found = findKey(v, target);
    if (found) return found;
  }

  return null;
}

export async function GET() {
  try {
    const [state, config, accountInfo] = await Promise.all([
      tlFetch(`/trade/accounts/${accountId()}/state`),
      tlFetch("/trade/config"),
      tlFetch("/trade/accounts").catch((e) => ({ error: e.message }))
    ]);

    const accountDetailsConfig = findKey(config, "accountDetailsConfig");
    const accountDetailsData =
      state?.d?.accountDetailsData ??
      state?.accountDetailsData ??
      null;

    return NextResponse.json({
      ok: true,
      accountDetailsConfig,
      accountDetailsData,
      accountInfo
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e.message },
      { status: 500 }
    );
  }
}
