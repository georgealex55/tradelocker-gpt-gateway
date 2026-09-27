import { NextResponse } from "next/server";
import { runUsdchfResearch } from "../../../../lib/usdchfResearch";

export async function GET() {
  try {
    const result = await runUsdchfResearch();
    return NextResponse.json({
      ok: true,
      readOnly: true,
      result
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, readOnly: true, error: error.message },
      { status: 400 }
    );
  }
}
