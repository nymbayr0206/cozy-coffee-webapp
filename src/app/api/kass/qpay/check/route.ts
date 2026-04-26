import { NextResponse } from "next/server";
import { jsonError } from "@/lib/kass/errors";
import { checkOdooQpayPayment } from "@/lib/kass/odoo";
import { parseNumber, readJsonBody } from "@/lib/kass/validation";

export const runtime = "nodejs";

interface QpayCheckBody {
  transaction_id?: unknown;
}

export async function POST(request: Request) {
  try {
    const body = await readJsonBody<QpayCheckBody>(request);
    const transactionId = Math.trunc(parseNumber(body.transaction_id, "transaction_id", { min: 1 }));
    const status = await checkOdooQpayPayment(transactionId);

    return NextResponse.json(status);
  } catch (error) {
    return jsonError(error);
  }
}
