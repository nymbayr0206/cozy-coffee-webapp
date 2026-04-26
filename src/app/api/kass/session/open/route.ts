import { NextResponse } from "next/server";
import { jsonError } from "@/lib/kass/errors";
import { openSession } from "@/lib/kass/store";
import { parseNumber, readJsonBody, requireString } from "@/lib/kass/validation";

export const runtime = "nodejs";

interface OpenSessionBody {
  cashier_name?: unknown;
  opening_cash?: unknown;
}

export async function POST(request: Request) {
  try {
    const body = await readJsonBody<OpenSessionBody>(request);
    const cashierName = requireString(body.cashier_name, "cashier_name");
    const openingCash = parseNumber(body.opening_cash, "opening_cash", { min: 0 });
    const session = openSession(cashierName, openingCash);

    return NextResponse.json(session, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
