import { NextResponse } from "next/server";
import { jsonError } from "@/lib/kass/errors";
import { createOdooProduct, fetchOdooProducts } from "@/lib/kass/odoo";
import { parseNumber, readJsonBody, requireString } from "@/lib/kass/validation";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const scopeParam = searchParams.get("scope");
    const scope =
      scopeParam === "all" ||
      scopeParam === "hidden" ||
      scopeParam === "production" ||
      scopeParam === "stock" ||
      scopeParam === "pos"
        ? scopeParam
        : "pos";
    const products = await fetchOdooProducts({ scope });
    return NextResponse.json(products);
  } catch (error) {
    return jsonError(error);
  }
}

interface CreateProductBody {
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

export async function POST(request: Request) {
  try {
    const body = await readJsonBody<CreateProductBody>(request);
    const name = requireString(body.name, "name");
    const salePrice = parseNumber(body.sale_price, "sale_price", { min: 0 });
    const barcode = typeof body.barcode === "string" ? body.barcode : null;
    const defaultCode = typeof body.default_code === "string" ? body.default_code : null;
    const category = typeof body.category === "string" ? body.category : null;
    const description = typeof body.description === "string" ? body.description : null;
    const imageBase64 = typeof body.image_base64 === "string" ? body.image_base64 : null;
    const availableForSale =
      typeof body.available_for_sale === "boolean" ? body.available_for_sale : true;
    const isStorable = typeof body.is_storable === "boolean" ? body.is_storable : false;
    const uomId =
      body.uom_id === undefined || body.uom_id === null || body.uom_id === ""
        ? null
        : Math.trunc(parseNumber(body.uom_id, "uom_id", { min: 1 }));
    const product = await createOdooProduct({
      name,
      sale_price: salePrice,
      barcode,
      default_code: defaultCode,
      category,
      description,
      image_base64: imageBase64,
      available_for_sale: availableForSale,
      is_storable: isStorable,
      uom_id: uomId,
    });

    return NextResponse.json({ product }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
