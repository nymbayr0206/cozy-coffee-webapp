import { NextResponse } from "next/server";
import { jsonError, KassServerError } from "@/lib/kass/errors";
import { fetchOdooProductRecipe } from "@/lib/kass/odoo";
import { getAllOrders } from "@/lib/kass/store";
import type { KassProductRecipe, KassRecipeLine, KassStockConsumption } from "@/lib/kass/client-types";

export const runtime = "nodejs";

interface ProductParams {
  params: Promise<{
    id: string;
  }>;
}

interface UsageDetail extends KassStockConsumption {
  order_id?: string | number;
  receipt_number?: string;
  created_at: string;
}

async function readProductId(context: ProductParams) {
  const { id } = await context.params;
  const productId = Number(id);

  if (!Number.isInteger(productId) || productId <= 0) {
    throw new KassServerError("validation_error", "product id buruu baina.", 400);
  }

  return productId;
}

function lineToConsumption(
  line: KassRecipeLine,
  componentProductId: number,
  source: KassProductRecipe,
  soldQuantity: number,
): KassStockConsumption | null {
  if (line.component_product_id !== componentProductId) return null;

  return {
    component_product_id: componentProductId,
    component_name: line.component_name,
    source_product_id: source.product_id,
    source_product_name: source.product_name,
    source_quantity: soldQuantity,
    quantity: Number(line.quantity ?? 0) * soldQuantity,
    uom_id: line.uom_id ?? null,
    uom_name: line.uom_name ?? null,
  };
}

function pushDetail(details: UsageDetail[], detail: KassStockConsumption, order: ReturnType<typeof getAllOrders>[number]) {
  if (!Number.isFinite(Number(detail.quantity)) || Number(detail.quantity) <= 0) return;

  details.push({
    ...detail,
    order_id: order.order_id,
    receipt_number: order.receipt_number,
    created_at: order.created_at,
  });
}

export async function GET(request: Request, context: ProductParams) {
  try {
    const productId = await readProductId(context);
    const url = new URL(request.url);
    const start = url.searchParams.get("start") ?? undefined;
    const end = url.searchParams.get("end") ?? undefined;
    const orders = getAllOrders({ start, end, status: "active" });
    const recipeCache = new Map<number, Promise<KassProductRecipe>>();
    const details: UsageDetail[] = [];

    const getRecipe = async (sourceProductId: number) => {
      if (!recipeCache.has(sourceProductId)) {
        recipeCache.set(sourceProductId, fetchOdooProductRecipe(sourceProductId).then((response) => response.recipe));
      }

      return recipeCache.get(sourceProductId)!;
    };

    const componentRecipe = await getRecipe(productId);

    for (const order of orders) {
      if (Array.isArray(order.stock_consumptions) && order.stock_consumptions.length > 0) {
        order.stock_consumptions
          .filter((detail) => detail.component_product_id === productId)
          .forEach((detail) => pushDetail(details, detail, order));
        continue;
      }

      for (const orderLine of order.lines ?? []) {
        const soldQuantity = Number(orderLine.quantity);
        if (!Number.isFinite(soldQuantity) || soldQuantity <= 0) continue;

        const sourceRecipe = await getRecipe(orderLine.product_id);
        const recipeDetails = sourceRecipe.lines
          .map((line) => lineToConsumption(line, productId, sourceRecipe, soldQuantity))
          .filter((detail): detail is KassStockConsumption => Boolean(detail));

        if (recipeDetails.length > 0) {
          recipeDetails.forEach((detail) => pushDetail(details, detail, order));
        } else if (orderLine.product_id === productId) {
          pushDetail(
            details,
            {
              component_product_id: productId,
              component_name: sourceRecipe.product_name,
              source_product_id: sourceRecipe.product_id,
              source_product_name: sourceRecipe.product_name,
              source_quantity: soldQuantity,
              quantity: soldQuantity,
              uom_id: sourceRecipe.uom_id ?? null,
              uom_name: sourceRecipe.uom_name ?? null,
            },
            order,
          );
        }
      }
    }

    const byProduct = new Map<
      number,
      {
        product_id: number;
        product_name: string;
        quantity: number;
        orderRefs: Set<string>;
        last_used_at?: string | null;
        uom_id?: number | null;
        uom_name?: string | null;
      }
    >();

    details.forEach((detail) => {
      const current =
        byProduct.get(detail.source_product_id) ??
        {
          product_id: detail.source_product_id,
          product_name: detail.source_product_name,
          quantity: 0,
          orderRefs: new Set<string>(),
          last_used_at: null,
          uom_id: detail.uom_id ?? null,
          uom_name: detail.uom_name ?? null,
        };
      current.quantity += Number(detail.quantity ?? 0);
      current.orderRefs.add(String(detail.receipt_number ?? detail.order_id ?? detail.created_at));
      if (!current.last_used_at || new Date(detail.created_at).getTime() > new Date(current.last_used_at).getTime()) {
        current.last_used_at = detail.created_at;
      }
      if (!current.uom_name && detail.uom_name) current.uom_name = detail.uom_name;
      if (!current.uom_id && detail.uom_id) current.uom_id = detail.uom_id;
      byProduct.set(detail.source_product_id, current);
    });

    return NextResponse.json({
      component: {
        product_id: productId,
        product_name: componentRecipe.product_name,
        uom_id: componentRecipe.uom_id ?? null,
        uom_name: componentRecipe.uom_name ?? null,
      },
      total_quantity: details.reduce((sum, detail) => sum + Number(detail.quantity ?? 0), 0),
      orders_count: new Set(details.map((detail) => String(detail.receipt_number ?? detail.order_id ?? detail.created_at))).size,
      products: Array.from(byProduct.values())
        .map((row) => ({
          product_id: row.product_id,
          product_name: row.product_name,
          quantity: row.quantity,
          orders_count: row.orderRefs.size,
          last_used_at: row.last_used_at,
          uom_id: row.uom_id,
          uom_name: row.uom_name,
        }))
        .sort((a, b) => b.quantity - a.quantity || a.product_name.localeCompare(b.product_name, "mn")),
      orders: details
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .slice(0, 100)
        .map((detail) => ({
          order_id: detail.order_id,
          receipt_number: detail.receipt_number,
          created_at: detail.created_at,
          source_product_id: detail.source_product_id,
          source_product_name: detail.source_product_name,
          sold_quantity: detail.source_quantity,
          quantity: detail.quantity,
          uom_id: detail.uom_id,
          uom_name: detail.uom_name,
        })),
    });
  } catch (error) {
    return jsonError(error);
  }
}
