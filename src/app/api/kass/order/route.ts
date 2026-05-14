import { NextResponse } from "next/server";
import { jsonError, KassServerError } from "@/lib/kass/errors";
import {
  consumeOdooRecipeStock,
  createOdooSaleOrder,
  linkOdooQpayTransactionToSaleOrder,
  previewOdooRecipeStockConsumption,
  redeemOdooLoyaltyCoupon,
  recordOdooLoyaltyPurchase,
  validateOdooLoyaltyCoupon,
  validateOdooLoyaltyMemberQr,
} from "@/lib/kass/odoo";
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
  coupon_qr_token?: unknown;
  coupon_pin?: unknown;
  loyalty_phone?: unknown;
  loyalty_qr_token?: unknown;
  loyalty_coffee_quantity?: unknown;
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
    const couponPayment = payments.find((payment) => payment.method === "coupon");
    const partnerId =
      body.partner_id === undefined || body.partner_id === null || body.partner_id === ""
        ? null
        : Math.trunc(parseNumber(body.partner_id, "partner_id", { min: 1 }));
    const partnerName = typeof body.partner_name === "string" && body.partner_name.trim() ? body.partner_name.trim() : null;
    const qpayTransactionId =
      qpayPayment && body.qpay_transaction_id !== undefined && body.qpay_transaction_id !== null
        ? Math.trunc(parseNumber(body.qpay_transaction_id, "qpay_transaction_id", { min: 1 }))
        : null;
    const couponQrToken = couponPayment ? requireString(body.coupon_qr_token, "coupon_qr_token") : null;
    const couponPin = couponPayment ? requireString(body.coupon_pin, "coupon_pin") : null;
    const loyaltyPhone =
      typeof body.loyalty_phone === "string" && body.loyalty_phone.trim() ? body.loyalty_phone.trim() : null;
    const loyaltyQrToken =
      typeof body.loyalty_qr_token === "string" && body.loyalty_qr_token.trim() ? body.loyalty_qr_token.trim() : null;
    const loyaltyCoffeeQuantity =
      body.loyalty_coffee_quantity === undefined || body.loyalty_coffee_quantity === null || body.loyalty_coffee_quantity === ""
        ? 0
        : Math.trunc(parseNumber(body.loyalty_coffee_quantity, "loyalty_coffee_quantity", { min: 0 }));

    if (creditPayment && !partnerId) {
      throw new KassServerError("validation_error", "Зээлээр бүртгэх харилцагч сонгоно уу.", 400);
    }

    assertSessionOpen(sessionId);

    if (couponPayment && couponQrToken && couponPin) {
      await validateOdooLoyaltyCoupon(couponQrToken, couponPin);
    }
    if (!couponPayment && loyaltyQrToken) {
      await validateOdooLoyaltyMemberQr(loyaltyQrToken);
    }

    const stockConsumptions = await previewOdooRecipeStockConsumption(lines);
    await consumeOdooRecipeStock(lines);
    const odooOrderId = await createOdooSaleOrder(lines, paymentMethod, payments, partnerId);
    if (qpayTransactionId && typeof odooOrderId === "number") {
      await linkOdooQpayTransactionToSaleOrder(qpayTransactionId, odooOrderId);
    }
    if (couponPayment && couponQrToken && couponPin) {
      await redeemOdooLoyaltyCoupon({
        qr_token: couponQrToken,
        pin: couponPin,
        session_id: sessionId,
        order_ref: odooOrderId,
      });
    }
    if (!couponPayment && (loyaltyQrToken || loyaltyPhone)) {
      await recordOdooLoyaltyPurchase({
        member_qr_token: loyaltyQrToken,
        phone: loyaltyPhone,
        coffee_quantity: loyaltyCoffeeQuantity,
        lines,
      });
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
      stock_consumptions: stockConsumptions,
      created_at: new Date().toISOString(),
    });

    return NextResponse.json(order, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
