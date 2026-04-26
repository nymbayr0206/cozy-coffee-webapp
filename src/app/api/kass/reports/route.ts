import { NextResponse } from "next/server";
import { jsonError, KassServerError } from "@/lib/kass/errors";
import { getOdooSalesReport } from "@/lib/kass/odoo";

export const runtime = "nodejs";

const allowedPeriods = new Set(["day", "week", "month", "year"]);

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const period = url.searchParams.get("period") ?? "day";
    const start = url.searchParams.get("start");
    const end = url.searchParams.get("end");

    if (!allowedPeriods.has(period)) {
      throw new KassServerError("validation_error", "Тайлангийн хугацааны төрөл буруу байна.", 400);
    }

    if (!start || !end) {
      throw new KassServerError("validation_error", "start болон end огноо шаардлагатай.", 400);
    }

    const report = await getOdooSalesReport(start, end);

    return NextResponse.json({
      period,
      ...report,
    });
  } catch (error) {
    return jsonError(error);
  }
}
