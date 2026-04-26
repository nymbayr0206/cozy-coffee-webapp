import { NextResponse } from "next/server";
import { jsonError, KassServerError } from "@/lib/kass/errors";
import { receiveOdooProductStock } from "@/lib/kass/odoo";
import { parseNumber, readJsonBody } from "@/lib/kass/validation";

export const runtime = "nodejs";

interface ProductParams {
  params: Promise<{
    id: string;
  }>;
}

interface StockInBody {
  quantity?: unknown;
  unit_cost?: unknown;
  partner_id?: unknown;
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
    const partnerId =
      body.partner_id === undefined || body.partner_id === null || body.partner_id === ""
        ? null
        : Math.trunc(parseNumber(body.partner_id, "partner_id", { min: 1 }));
    const note = typeof body.note === "string" ? body.note : null;
    const result = await receiveOdooProductStock(productId, {
      quantity,
      unit_cost: unitCost,
      partner_id: partnerId,
      note,
    });

    return NextResponse.json(result);
  } catch (error) {
    return jsonError(error);
  }
}
