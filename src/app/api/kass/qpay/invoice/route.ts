import { NextResponse } from "next/server";
import { jsonError } from "@/lib/kass/errors";
import { createOdooQpayInvoice } from "@/lib/kass/odoo";
import { assertSessionOpen } from "@/lib/kass/store";
import { parseOrderLines, readJsonBody, requireString } from "@/lib/kass/validation";

export const runtime = "nodejs";

interface QpayInvoiceBody {
  session_id?: unknown;
  lines?: unknown;
}

export async function POST(request: Request) {
  try {
    const body = await readJsonBody<QpayInvoiceBody>(request);
    const sessionId = requireString(body.session_id, "session_id");
    const lines = parseOrderLines(body.lines);

    assertSessionOpen(sessionId);

    const invoice = await createOdooQpayInvoice(lines);
    return NextResponse.json(invoice, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
