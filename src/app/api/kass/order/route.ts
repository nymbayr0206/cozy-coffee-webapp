import { NextResponse } from "next/server";
import { jsonError } from "@/lib/kass/errors";
import { createOdooSaleOrder, linkOdooQpayTransactionToSaleOrder } from "@/lib/kass/odoo";
import { addOrder, assertSessionOpen, nextReceiptNumber } from "@/lib/kass/store";
import {
  parseOrderLines,
  parseNumber,
  parsePaymentMethod,
  readJsonBody,
  requireString,
} from "@/lib/kass/validation";

export const runtime = "nodejs";

interface CreateOrderBody {
  session_id?: unknown;
  payment_method?: unknown;
  lines?: unknown;
  qpay_transaction_id?: unknown;
}

export async function POST(request: Request) {
  try {
    const body = await readJsonBody<CreateOrderBody>(request);
    const sessionId = requireString(body.session_id, "session_id");
    const paymentMethod = parsePaymentMethod(body.payment_method);
    const lines = parseOrderLines(body.lines);
    const qpayTransactionId =
      paymentMethod === "qpay" && body.qpay_transaction_id !== undefined && body.qpay_transaction_id !== null
        ? Math.trunc(parseNumber(body.qpay_transaction_id, "qpay_transaction_id", { min: 1 }))
        : null;

    assertSessionOpen(sessionId);

    const odooOrderId = await createOdooSaleOrder(lines, paymentMethod);
    if (qpayTransactionId && typeof odooOrderId === "number") {
      await linkOdooQpayTransactionToSaleOrder(qpayTransactionId, odooOrderId);
    }

    const total = lines.reduce((sum, line) => sum + line.quantity * line.price, 0);
    const order = addOrder({
      order_id: odooOrderId,
      qpay_transaction_id: qpayTransactionId ?? undefined,
      receipt_number: nextReceiptNumber(),
      session_id: sessionId,
      payment_method: paymentMethod,
      total,
      lines,
      created_at: new Date().toISOString(),
    });

    return NextResponse.json(order, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
