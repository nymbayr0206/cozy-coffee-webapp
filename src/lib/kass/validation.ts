import { KassServerError } from "./errors";
import type { PaymentMethod } from "./client-types";

const paymentMethods = new Set<PaymentMethod>(["cash", "card", "qpay"]);

export async function readJsonBody<T>(request: Request): Promise<T> {
  try {
    return (await request.json()) as T;
  } catch {
    throw new KassServerError("validation_error", "Request body must be valid JSON", 400);
  }
}

export function requireString(value: unknown, field: string) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new KassServerError("validation_error", `${field} is required`, 400);
  }

  return value.trim();
}

export function parseNumber(value: unknown, field: string, options?: { min?: number }) {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;

  if (!Number.isFinite(parsed)) {
    throw new KassServerError("validation_error", `${field} must be a number`, 400);
  }

  if (options?.min !== undefined && parsed < options.min) {
    throw new KassServerError("validation_error", `${field} must be at least ${options.min}`, 400);
  }

  return parsed;
}

export function parsePaymentMethod(value: unknown) {
  if (typeof value !== "string" || !paymentMethods.has(value as PaymentMethod)) {
    throw new KassServerError("invalid_payment_method", "payment_method must be cash, card, or qpay", 400);
  }

  return value as PaymentMethod;
}

export function parseOrderLines(value: unknown) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new KassServerError("validation_error", "lines must contain at least one item", 400);
  }

  return value.map((line, index) => {
    const item = line as Record<string, unknown>;
    const productId = parseNumber(item.product_id, `lines[${index}].product_id`, { min: 1 });
    const quantity = parseNumber(item.quantity, `lines[${index}].quantity`, { min: 0.000001 });
    const price = parseNumber(item.price, `lines[${index}].price`, { min: 0 });

    return {
      product_id: Math.trunc(productId),
      quantity,
      price,
    };
  });
}
