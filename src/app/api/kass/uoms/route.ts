import { NextResponse } from "next/server";
import { jsonError } from "@/lib/kass/errors";
import { createOdooProductUom, deleteOdooProductUom, fetchOdooProductUoms } from "@/lib/kass/odoo";
import { parseNumber, readJsonBody, requireString } from "@/lib/kass/validation";

export const runtime = "nodejs";

export async function GET() {
  try {
    const uoms = await fetchOdooProductUoms();
    return NextResponse.json(uoms);
  } catch (error) {
    return jsonError(error);
  }
}

interface UomBody {
  name?: unknown;
  category_id?: unknown;
  uom_type?: unknown;
  factor_inv?: unknown;
}

export async function POST(request: Request) {
  try {
    const body = await readJsonBody<UomBody>(request);
    const name = requireString(body.name, "name");
    const categoryId = Math.trunc(parseNumber(body.category_id, "category_id", { min: 1 }));
    const uomType =
      body.uom_type === "bigger" || body.uom_type === "smaller" || body.uom_type === "reference"
        ? body.uom_type
        : "reference";
    const factorInv =
      body.factor_inv === undefined || body.factor_inv === null || body.factor_inv === ""
        ? null
        : parseNumber(body.factor_inv, "factor_inv", { min: 0.000001 });
    const uom = await createOdooProductUom({
      name,
      category_id: categoryId,
      uom_type: uomType,
      factor_inv: factorInv,
    });

    return NextResponse.json({ uom }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const uomId = Math.trunc(parseNumber(searchParams.get("id"), "id", { min: 1 }));
    const result = await deleteOdooProductUom(uomId);

    return NextResponse.json(result);
  } catch (error) {
    return jsonError(error);
  }
}
