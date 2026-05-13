import { NextResponse } from "next/server";
import { jsonError, KassServerError } from "@/lib/kass/errors";
import { cancelOdooSaleOrder, restoreOdooRecipeStock } from "@/lib/kass/odoo";
import { getOrderByReference, returnOrder } from "@/lib/kass/store";

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
