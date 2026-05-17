import { NextResponse } from "next/server";
import { jsonError, KassServerError } from "@/lib/kass/errors";
import { adjustOdooProductStock } from "@/lib/kass/odoo";
import { getStockReceipt, returnStockReceipt, updateStockReceipt } from "@/lib/kass/store";
import { parseNumber, parseStockReceiptPayment, readJsonBody } from "@/lib/kass/validation";

export const runtime = "nodejs";

interface StockReceiptParams {
  params: Promise<{
    id: string;
  }>;
}

interface StockReceiptPatchBody {
  quantity?: unknown;
  unit_cost?: unknown;
  partner_id?: unknown;
  partner_name?: unknown;
  payment_method?: unknown;
  paid_amount?: unknown;
  credit_amount?: unknown;
  note?: unknown;
}

async function readReceiptId(context: StockReceiptParams) {
  const { id } = await context.params;
  const receiptId = id.trim();

  if (!receiptId) {
    throw new KassServerError("validation_error", "Орлогын бүртгэлийн ID буруу байна.", 400);
  }

  return receiptId;
}

export async function PATCH(request: Request, context: StockReceiptParams) {
  try {
    const receiptId = await readReceiptId(context);
    const receipt = getStockReceipt(receiptId);
    if (receipt.status === "returned") {
      throw new KassServerError("stock_receipt_returned", "Буцаагдсан орлогын бүртгэлийг засах боломжгүй.", 409);
    }

    const body = await readJsonBody<StockReceiptPatchBody>(request);
    const quantity = body.quantity === undefined ? receipt.quantity : parseNumber(body.quantity, "quantity", { min: 0.000001 });
    const unitCost =
      body.unit_cost === undefined ? receipt.unit_cost : parseNumber(body.unit_cost, "unit_cost", { min: 0.000001 });
    const partnerId =
      body.partner_id === undefined || body.partner_id === null || body.partner_id === ""
        ? null
        : Math.trunc(parseNumber(body.partner_id, "partner_id", { min: 1 }));
    const partnerName = typeof body.partner_name === "string" && body.partner_name.trim() ? body.partner_name.trim() : null;
    const note = typeof body.note === "string" && body.note.trim() ? body.note.trim() : null;
    const previousStockQuantity = Number(receipt.stock_quantity ?? receipt.quantity);
    const stockQuantity =
      Number(receipt.stock_quantity) > 0 && Number(receipt.quantity) > 0
        ? (quantity / receipt.quantity) * Number(receipt.stock_quantity)
        : quantity;
    const quantityDelta = stockQuantity - previousStockQuantity;
    const totalCost = Math.round(quantity * unitCost * 100) / 100;
    const payment = parseStockReceiptPayment(body, totalCost, {
      payment_method: receipt.payment_method,
      paid_amount: receipt.paid_amount,
      credit_amount: receipt.credit_amount,
    });
    const result = await adjustOdooProductStock(receipt.product_id, quantityDelta, {
      unit_cost: unitCost,
    });
    const updated = updateStockReceipt(receiptId, {
      quantity,
      stock_quantity: stockQuantity,
      unit_cost: unitCost,
      total_cost: totalCost,
      partner_id: partnerId,
      partner_name: partnerName,
      ...payment,
      note,
      location_id: result.location?.id ?? receipt.location_id ?? null,
      location_name: result.location?.name ?? receipt.location_name ?? null,
    });

    return NextResponse.json({
      ok: true,
      receipt: updated,
      product: result.product,
      quantity_delta: quantityDelta,
    });
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(_request: Request, context: StockReceiptParams) {
  try {
    const receiptId = await readReceiptId(context);
    const receipt = getStockReceipt(receiptId);
    if (receipt.status === "returned") {
      throw new KassServerError("stock_receipt_returned", "Энэ орлого аль хэдийн буцаагдсан байна.", 409);
    }

    const result = await adjustOdooProductStock(receipt.product_id, -Number(receipt.stock_quantity ?? receipt.quantity));
    const returned = returnStockReceipt(receiptId);

    return NextResponse.json({
      ok: true,
      receipt: returned,
      product: result.product,
      quantity_delta: -receipt.quantity,
    });
  } catch (error) {
    return jsonError(error);
  }
}
