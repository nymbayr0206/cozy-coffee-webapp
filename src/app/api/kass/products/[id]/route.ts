import { NextResponse } from "next/server";
import { jsonError, KassServerError } from "@/lib/kass/errors";
import { archiveOdooProduct, updateOdooProduct } from "@/lib/kass/odoo";
import { parseNumber, readJsonBody, requireString } from "@/lib/kass/validation";

export const runtime = "nodejs";

interface ProductParams {
  params: Promise<{
    id: string;
  }>;
}

interface UpdateProductBody {
  name?: unknown;
  sale_price?: unknown;
  barcode?: unknown;
  default_code?: unknown;
  category?: unknown;
  description?: unknown;
  image_base64?: unknown;
  available_for_sale?: unknown;
  is_storable?: unknown;
  uom_id?: unknown;
}

async function readProductId(context: ProductParams) {
  const { id } = await context.params;
  const productId = Number(id);

  if (!Number.isInteger(productId) || productId <= 0) {
    throw new KassServerError("validation_error", "product id буруу байна.", 400);
  }

  return productId;
}

export async function PATCH(request: Request, context: ProductParams) {
  try {
    const productId = await readProductId(context);
    const body = await readJsonBody<UpdateProductBody>(request);
    const input: {
      name?: string;
      sale_price?: number;
      barcode?: string | null;
      default_code?: string | null;
      category?: string | null;
      description?: string | null;
      image_base64?: string | null;
      available_for_sale?: boolean;
      is_storable?: boolean;
      uom_id?: number | null;
    } = {};

    if (body.name !== undefined) input.name = requireString(body.name, "name");
    if (body.sale_price !== undefined) input.sale_price = parseNumber(body.sale_price, "sale_price", { min: 0 });
    if (body.barcode !== undefined) input.barcode = typeof body.barcode === "string" ? body.barcode : null;
    if (body.default_code !== undefined) input.default_code = typeof body.default_code === "string" ? body.default_code : null;
    if (body.category !== undefined) input.category = typeof body.category === "string" ? body.category : null;
    if (body.description !== undefined) input.description = typeof body.description === "string" ? body.description : null;
    if (body.image_base64 !== undefined) input.image_base64 = typeof body.image_base64 === "string" ? body.image_base64 : null;
    if (body.available_for_sale !== undefined) {
      if (typeof body.available_for_sale !== "boolean") {
        throw new KassServerError("validation_error", "available_for_sale boolean байх ёстой.", 400);
      }
      input.available_for_sale = body.available_for_sale;
    }
    if (body.is_storable !== undefined) {
      if (typeof body.is_storable !== "boolean") {
        throw new KassServerError("validation_error", "is_storable boolean байх ёстой.", 400);
      }
      input.is_storable = body.is_storable;
    }
    if (body.uom_id !== undefined) {
      input.uom_id =
        body.uom_id === null || body.uom_id === ""
          ? null
          : Math.trunc(parseNumber(body.uom_id, "uom_id", { min: 1 }));
    }

    const product = await updateOdooProduct(productId, input);
    return NextResponse.json({ product });
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(_request: Request, context: ProductParams) {
  try {
    const productId = await readProductId(context);
    const result = await archiveOdooProduct(productId);
    return NextResponse.json(result);
  } catch (error) {
    return jsonError(error);
  }
}
