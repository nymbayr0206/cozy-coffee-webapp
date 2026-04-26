import { NextResponse } from "next/server";
import { jsonError } from "@/lib/kass/errors";
import { createOdooProductCategory, fetchOdooProductCategories, fetchOdooWarehouseCategories } from "@/lib/kass/odoo";
import { readJsonBody, requireString } from "@/lib/kass/validation";

export const runtime = "nodejs";

interface CreateCategoryBody {
  name?: unknown;
  scope?: unknown;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const scope = searchParams.get("scope");
    const categories = scope === "warehouse" ? await fetchOdooWarehouseCategories() : await fetchOdooProductCategories();
    return NextResponse.json(categories);
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = await readJsonBody<CreateCategoryBody>(request);
    const name = requireString(body.name, "name");
    const scope = body.scope === "warehouse" ? "warehouse" : "pos";
    const category = await createOdooProductCategory({ name, scope });
    return NextResponse.json({ category }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
