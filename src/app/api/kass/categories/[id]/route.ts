import { NextResponse } from "next/server";
import { jsonError, KassServerError } from "@/lib/kass/errors";
import { deleteOdooProductCategory, updateOdooProductCategory } from "@/lib/kass/odoo";
import { readJsonBody, requireString } from "@/lib/kass/validation";

export const runtime = "nodejs";

interface CategoryParams {
  params: Promise<{
    id: string;
  }>;
}

async function readCategoryId(context: CategoryParams) {
  const { id } = await context.params;
  const categoryId = Number(id);

  if (!Number.isInteger(categoryId) || categoryId <= 0) {
    throw new KassServerError("validation_error", "category id буруу байна.", 400);
  }

  return categoryId;
}

interface UpdateCategoryBody {
  name?: unknown;
  scope?: unknown;
}

export async function PATCH(request: Request, context: CategoryParams) {
  try {
    const categoryId = await readCategoryId(context);
    const body = await readJsonBody<UpdateCategoryBody>(request);
    const name = requireString(body.name, "name");
    const scope = body.scope === "warehouse" ? "warehouse" : "pos";
    const category = await updateOdooProductCategory(categoryId, { name, scope });

    return NextResponse.json({ category });
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(request: Request, context: CategoryParams) {
  try {
    const categoryId = await readCategoryId(context);
    const { searchParams } = new URL(request.url);
    const scope = searchParams.get("scope") === "pos" ? "pos" : "warehouse";
    const result = await deleteOdooProductCategory(categoryId, scope);

    return NextResponse.json(result);
  } catch (error) {
    return jsonError(error);
  }
}
