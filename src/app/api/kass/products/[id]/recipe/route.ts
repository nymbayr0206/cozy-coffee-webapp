import { NextResponse } from "next/server";
import { jsonError, KassServerError } from "@/lib/kass/errors";
import { fetchOdooProductRecipe, upsertOdooProductRecipe } from "@/lib/kass/odoo";
import { parseNumber, readJsonBody } from "@/lib/kass/validation";

export const runtime = "nodejs";

interface ProductParams {
  params: Promise<{
    id: string;
  }>;
}

interface RecipeBody {
  lines?: unknown;
}

async function readProductId(context: ProductParams) {
  const { id } = await context.params;
  const productId = Number(id);

  if (!Number.isInteger(productId) || productId <= 0) {
    throw new KassServerError("validation_error", "product id буруу байна.", 400);
  }

  return productId;
}

function parseRecipeLines(value: unknown) {
  if (!Array.isArray(value)) {
    throw new KassServerError("validation_error", "lines array байх ёстой.", 400);
  }

  return value.map((line, index) => {
    const item = line as Record<string, unknown>;
    const componentProductId = Math.trunc(
      parseNumber(item.component_product_id, `lines[${index}].component_product_id`, { min: 1 }),
    );
    const quantity = parseNumber(item.quantity, `lines[${index}].quantity`, { min: 0.000001 });

    return {
      component_product_id: componentProductId,
      quantity,
    };
  });
}

export async function GET(_request: Request, context: ProductParams) {
  try {
    const productId = await readProductId(context);
    const recipe = await fetchOdooProductRecipe(productId);

    return NextResponse.json(recipe);
  } catch (error) {
    return jsonError(error);
  }
}

export async function PUT(request: Request, context: ProductParams) {
  try {
    const productId = await readProductId(context);
    const body = await readJsonBody<RecipeBody>(request);
    const lines = parseRecipeLines(body.lines ?? []);
    const recipe = await upsertOdooProductRecipe(productId, { lines });

    return NextResponse.json(recipe);
  } catch (error) {
    return jsonError(error);
  }
}
