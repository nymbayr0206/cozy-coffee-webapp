import { NextResponse } from "next/server";
import { jsonError, KassServerError } from "@/lib/kass/errors";
import { cancelOdooSaleOrder, restoreOdooRecipeStock, updateOdooSaleOrderPayment } from "@/lib/kass/odoo";
import { getOrderByReference, returnOrder, updateOrderPayment } from "@/lib/kass/store";
import { parsePaymentMethod, readJsonBody } from "@/lib/kass/validation";
import type { PaymentPart } from "@/lib/kass/client-types";

export const runtime = "nodejs";

interface OrderParams {
  params: Promise<{
    id: string;
  }>;
}

async function readOrderReference(context: OrderParams) {
  const { id } = await context.params;
  const reference = decodeURIComponent(id).trim();

  if (!reference) {
    throw new KassServerError("validation_error", "Борлуулалтын ID буруу байна.", 400);
  }

  return reference;
}

interface UpdateOrderPaymentBody {
  payment_method?: unknown;
}

export async function PATCH(request: Request, context: OrderParams) {
  try {
    const reference = await readOrderReference(context);
    const body = await readJsonBody<UpdateOrderPaymentBody>(request);
    const paymentMethod = parsePaymentMethod(body.payment_method);
    const order = getOrderByReference(reference);

    if (paymentMethod === "coupon") {
      throw new KassServerError("invalid_payment_method", "Купон төлбөрийг зөвхөн купон баталгаажуулах үед бүртгэнэ.", 400);
    }

    if (order.status === "returned") {
      throw new KassServerError("order_returned", "Буцаагдсан борлуулалтын төлбөрийг засах боломжгүй.", 409);
    }

    const paymentParts: PaymentPart[] = [{ method: paymentMethod, amount: Number(order.total ?? 0) }];
    const odooOrderId = Number(order.order_id);
    if (Number.isInteger(odooOrderId) && odooOrderId > 0) {
      await updateOdooSaleOrderPayment(odooOrderId, paymentMethod, paymentParts);
    }

    const updated = updateOrderPayment(reference, paymentMethod, paymentParts);

    return NextResponse.json({
      ok: true,
      order: updated,
    });
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(_request: Request, context: OrderParams) {
  try {
    const reference = await readOrderReference(context);
    const order = getOrderByReference(reference);

    if (order.status === "returned") {
      throw new KassServerError("order_returned", "Энэ борлуулалт аль хэдийн буцаагдсан байна.", 409);
    }

    const odooOrderId = Number(order.order_id);
    if (Number.isInteger(odooOrderId) && odooOrderId > 0) {
      await cancelOdooSaleOrder(odooOrderId);
    }

    await restoreOdooRecipeStock(order.lines);
    const returned = returnOrder(reference);

    return NextResponse.json({
      ok: true,
      order: returned,
    });
  } catch (error) {
    return jsonError(error);
  }
}
