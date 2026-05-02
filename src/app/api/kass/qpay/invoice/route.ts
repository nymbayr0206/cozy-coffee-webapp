import { NextResponse } from "next/server";
import { jsonError } from "@/lib/kass/errors";
import { createOdooQpayInvoice } from "@/lib/kass/odoo";
import { assertSessionOpen } from "@/lib/kass/store";
import { parseNumber, parseOrderLines, readJsonBody, requireString } from "@/lib/kass/validation";

export const runtime = "nodejs";

interface QpayInvoiceBody {
  session_id?: unknown;
  lines?: unknown;
  amount?: unknown;
}

export async function POST(request: Request) {
  try {
    const body = await readJsonBody<QpayInvoiceBody>(request);
    const sessionId = requireString(body.session_id, "session_id");
    const lines = parseOrderLines(body.lines);
    const amount =
      body.amount === undefined || body.amount === null || body.amount === ""
        ? undefined
        : parseNumber(body.amount, "amount", { min: 0.01 });

    assertSessionOpen(sessionId);

    const invoice = await createOdooQpayInvoice(lines, amount);
    return NextResponse.json(invoice, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
