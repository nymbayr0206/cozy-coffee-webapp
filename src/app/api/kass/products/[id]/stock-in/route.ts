import { NextResponse } from "next/server";
import { jsonError, KassServerError } from "@/lib/kass/errors";
import { receiveOdooProductStock } from "@/lib/kass/odoo";
import { addStockReceipt } from "@/lib/kass/store";
import { parseNumber, parseStockReceiptPayment, readJsonBody } from "@/lib/kass/validation";

export const runtime = "nodejs";

interface ProductParams {
  params: Promise<{
    id: string;
  }>;
}

interface StockInBody {
  quantity?: unknown;
  unit_cost?: unknown;
  uom_id?: unknown;
  partner_id?: unknown;
  payment_method?: unknown;
  paid_amount?: unknown;
  credit_amount?: unknown;
  note?: unknown;
}

async function readProductId(context: ProductParams) {
  const { id } = await context.params;
  const productId = Number(id);

  if (!Number.isInteger(productId) || productId <= 0) {
    throw new KassServerError("validation_error", "product id буруу байна.", 400);
  }

  return productId;
}

export async function POST(request: Request, context: ProductParams) {
  try {
    const productId = await readProductId(context);
    const body = await readJsonBody<StockInBody>(request);
    const quantity = parseNumber(body.quantity, "quantity", { min: 0.000001 });
    if (body.unit_cost === undefined || body.unit_cost === null || body.unit_cost === "") {
      throw new KassServerError("validation_error", "unit_cost is required", 400);
    }
    const unitCost = parseNumber(body.unit_cost, "unit_cost", { min: 0.000001 });
    const uomId =
      body.uom_id === undefined || body.uom_id === null || body.uom_id === ""
        ? null
        : Math.trunc(parseNumber(body.uom_id, "uom_id", { min: 1 }));
    const partnerId =
      body.partner_id === undefined || body.partner_id === null || body.partner_id === ""
        ? null
        : Math.trunc(parseNumber(body.partner_id, "partner_id", { min: 1 }));
    const totalCost = Math.round(quantity * unitCost * 100) / 100;
    const payment = parseStockReceiptPayment(body, totalCost);
    const note = typeof body.note === "string" ? body.note : null;
    const result = await receiveOdooProductStock(productId, {
      quantity,
      unit_cost: unitCost,
      uom_id: uomId,
      partner_id: partnerId,
      note,
    });
    const stockReceipt = addStockReceipt({
      product_id: productId,
      product_name: result.product.name,
      quantity,
      unit_cost: unitCost,
      total_cost: totalCost,
      uom_id: result.uom_id ?? uomId,
      uom_name: result.uom_name ?? null,
      stock_quantity: result.stock_quantity_received ?? quantity,
      stock_uom_id: result.stock_uom_id ?? null,
      stock_uom_name: result.stock_uom_name ?? null,
      partner_id: result.partner?.id ?? partnerId,
      partner_name: result.partner?.name ?? null,
      ...payment,
      note: result.note ?? note,
      odoo_receipt_id: result.receipt?.id ?? null,
      odoo_receipt_name: result.receipt?.name ?? null,
      odoo_receipt_state: result.receipt?.state ?? null,
      location_id: result.location?.id ?? null,
      location_name: result.location?.name ?? null,
    });

    return NextResponse.json({ ...result, stock_receipt: stockReceipt });
  } catch (error) {
    return jsonError(error);
  }
}
