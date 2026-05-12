import { NextResponse } from "next/server";
import { jsonError, KassServerError } from "@/lib/kass/errors";
import { consumeOdooRecipeStock, createOdooSaleOrder, linkOdooQpayTransactionToSaleOrder } from "@/lib/kass/odoo";
import { addOrder, assertSessionOpen, nextReceiptNumber } from "@/lib/kass/store";
import {
  parsePaymentParts,
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
  payments?: unknown;
  partner_id?: unknown;
  partner_name?: unknown;
  lines?: unknown;
  qpay_transaction_id?: unknown;
}

export async function POST(request: Request) {
  try {
    const body = await readJsonBody<CreateOrderBody>(request);
    const sessionId = requireString(body.session_id, "session_id");
    const lines = parseOrderLines(body.lines);
    const total = lines.reduce((sum, line) => sum + line.quantity * line.price, 0);
    const payments =
      body.payments !== undefined
        ? parsePaymentParts(body.payments, total)
        : [{ method: parsePaymentMethod(body.payment_method), amount: total }];
    const paymentMethod = payments.length === 1 ? payments[0].method : "mixed";
    const qpayPayment = payments.find((payment) => payment.method === "qpay");
    const creditPayment = payments.find((payment) => payment.method === "credit");
    const partnerId =
      body.partner_id === undefined || body.partner_id === null || body.partner_id === ""
        ? null
        : Math.trunc(parseNumber(body.partner_id, "partner_id", { min: 1 }));
    const partnerName = typeof body.partner_name === "string" && body.partner_name.trim() ? body.partner_name.trim() : null;
    const qpayTransactionId =
      qpayPayment && body.qpay_transaction_id !== undefined && body.qpay_transaction_id !== null
        ? Math.trunc(parseNumber(body.qpay_transaction_id, "qpay_transaction_id", { min: 1 }))
        : null;

    if (creditPayment && !partnerId) {
      throw new KassServerError("validation_error", "Зээлээр бүртгэх харилцагч сонгоно уу.", 400);
    }

    assertSessionOpen(sessionId);

    await consumeOdooRecipeStock(lines);
    const odooOrderId = await createOdooSaleOrder(lines, paymentMethod, payments, partnerId);
    if (qpayTransactionId && typeof odooOrderId === "number") {
      await linkOdooQpayTransactionToSaleOrder(qpayTransactionId, odooOrderId);
    }

    const order = addOrder({
      order_id: odooOrderId,
      qpay_transaction_id: qpayTransactionId ?? undefined,
      receipt_number: nextReceiptNumber(),
      session_id: sessionId,
      payment_method: paymentMethod,
      payment_parts: payments,
      partner_id: partnerId,
      partner_name: partnerName,
      total,
      lines,
      created_at: new Date().toISOString(),
    });

    return NextResponse.json(order, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
