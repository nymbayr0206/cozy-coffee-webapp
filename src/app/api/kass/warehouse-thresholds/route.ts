import { NextResponse } from "next/server";
import { jsonError, KassServerError } from "@/lib/kass/errors";
import { readJsonBody } from "@/lib/kass/validation";
import { readWarehouseThresholds, writeWarehouseThresholds, type WarehouseThresholds } from "@/lib/kass/warehouse-thresholds";

export const runtime = "nodejs";

interface ThresholdsBody {
  thresholds?: unknown;
}

function parseThresholds(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new KassServerError("validation_error", "thresholds must be an object", 400);
  }

  const thresholds: WarehouseThresholds = {};
  Object.entries(value as Record<string, unknown>).forEach(([productId, thresholdValue]) => {
    const threshold = Number(thresholdValue);

    if (!/^\d+$/.test(productId)) {
      throw new KassServerError("validation_error", "threshold product id must be numeric", 400);
    }

    if (!Number.isFinite(threshold) || threshold < 0) {
      throw new KassServerError("validation_error", "threshold value must be at least 0", 400);
    }

    thresholds[productId] = Math.round(threshold * 1000) / 1000;
  });

  return thresholds;
}

export async function GET() {
  try {
    return NextResponse.json({ thresholds: readWarehouseThresholds() });
  } catch (error) {
    return jsonError(error);
  }
}

export async function PUT(request: Request) {
  try {
    const body = await readJsonBody<ThresholdsBody>(request);
    const thresholds = parseThresholds(body.thresholds);

    return NextResponse.json({ thresholds: writeWarehouseThresholds(thresholds) });
  } catch (error) {
    return jsonError(error);
  }
}
