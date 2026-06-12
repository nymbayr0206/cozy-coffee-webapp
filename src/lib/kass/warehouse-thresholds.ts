import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";

export type WarehouseThresholds = Record<string, number>;

function resolveThresholdsPath() {
  const configuredPath = process.env.KASS_WAREHOUSE_THRESHOLDS_PATH || "./data/local/warehouse-thresholds.json";
  return path.isAbsolute(configuredPath) ? configuredPath : path.join(process.cwd(), configuredPath);
}

function normalizeThresholds(input: unknown) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};

  const thresholds: WarehouseThresholds = {};
  Object.entries(input as Record<string, unknown>).forEach(([productId, value]) => {
    const threshold = Number(value);
    if (/^\d+$/.test(productId) && Number.isFinite(threshold) && threshold >= 0) {
      thresholds[productId] = Math.round(threshold * 1000) / 1000;
    }
  });

  return thresholds;
}

export function readWarehouseThresholds() {
  const thresholdsPath = resolveThresholdsPath();

  if (!existsSync(thresholdsPath)) return {};

  try {
    return normalizeThresholds(JSON.parse(readFileSync(thresholdsPath, "utf8")));
  } catch {
    return {};
  }
}

export function writeWarehouseThresholds(thresholds: WarehouseThresholds) {
  const thresholdsPath = resolveThresholdsPath();
  mkdirSync(path.dirname(thresholdsPath), { recursive: true });

  const normalized = normalizeThresholds(thresholds);
  writeFileSync(thresholdsPath, JSON.stringify(normalized, null, 2));

  return normalized;
}
