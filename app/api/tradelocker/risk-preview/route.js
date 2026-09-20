import { NextResponse } from "next/server";
import { buildRiskPreview } from "../../../../lib/risk";

export async function POST(req) {
  try {
    const body = await req.json();
    const preview = await buildRiskPreview(body);
    return NextResponse.json(
      { ok: preview.ok, dryRun: true, preview },
      { status: preview.ok ? 200 : 400 }
    );
  } catch (e) {
    return NextResponse.json(
      { ok: false, dryRun: true, error: e.message },
      { status: 400 }
    );
  }
}