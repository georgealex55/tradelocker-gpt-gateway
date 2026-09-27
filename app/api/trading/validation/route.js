import { NextResponse } from "next/server";
import {
  runForexValidation,
  VALIDATION_PERIODS
} from "../../../../lib/forexValidation";

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const symbol = String(
      searchParams.get("symbol") || "USDCHF"
    ).toUpperCase();

    const period =
      searchParams.get("period") || "development";

    const result = await runForexValidation({
      symbol,
      period
    });

    return NextResponse.json({
      readOnly: true,
      validationPeriods: VALIDATION_PERIODS,
      result
    });
  } catch (error) {
    return NextResponse.json(
      {
        readOnly: true,
        error: error.message
      },
      { status: 400 }
    );
  }
}
