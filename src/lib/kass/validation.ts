import { KassServerError } from "./errors";
import type { PaymentMethod, PaymentPart, StockReceiptPaymentMethod } from "./client-types";

const paymentMethods = new Set<PaymentMethod>(["cash", "card", "qpay", "bank", "credit", "coupon"]);
const stockReceiptPaymentMethods = new Set<StockReceiptPaymentMethod>(["cash", "credit", "mixed"]);

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
    throw new KassServerError("invalid_payment_method", "payment_method must be cash, card, qpay, bank, credit, or coupon", 400);
  }

  return value as PaymentMethod;
}

export function parsePaymentParts(value: unknown, total: number) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new KassServerError("validation_error", "payments must contain at least one item", 400);
  }

  const byMethod = new Map<PaymentMethod, number>();

  value.forEach((payment, index) => {
    const item = payment as Record<string, unknown>;
    const method = parsePaymentMethod(item.method);
    const amount = parseNumber(item.amount, `payments[${index}].amount`, { min: 0.01 });
    byMethod.set(method, Number((byMethod.get(method) ?? 0) + amount));
  });

  const payments: PaymentPart[] = Array.from(byMethod.entries())
    .map(([method, amount]) => ({
      method,
      amount: Math.round(amount * 100) / 100,
    }))
    .filter((payment) => payment.amount > 0);
  const paymentTotal = payments.reduce((sum, payment) => sum + payment.amount, 0);

  if (Math.abs(paymentTotal - total) > 0.01) {
    throw new KassServerError("validation_error", "payments total must match order total", 400);
  }

  return payments;
}

export function parseStockReceiptPayment(
  value: {
    payment_method?: unknown;
    paid_amount?: unknown;
    credit_amount?: unknown;
  },
  total: number,
  fallback?: {
    payment_method?: StockReceiptPaymentMethod;
    paid_amount?: number;
    credit_amount?: number;
  },
) {
  const requestedMethod =
    value.payment_method === undefined || value.payment_method === null || value.payment_method === ""
      ? fallback?.payment_method ?? "credit"
      : value.payment_method;

  if (typeof requestedMethod !== "string" || !stockReceiptPaymentMethods.has(requestedMethod as StockReceiptPaymentMethod)) {
    throw new KassServerError("invalid_payment_method", "stock payment_method must be cash, credit, or mixed", 400);
  }

  const paymentMethod = requestedMethod as StockReceiptPaymentMethod;
  const fallbackPaid = fallback?.paid_amount;
  const fallbackCredit = fallback?.credit_amount;
  const paidAmount =
    value.paid_amount === undefined
      ? paymentMethod === "cash"
        ? total
        : paymentMethod === "credit"
          ? 0
          : Number(fallbackPaid ?? 0)
      : parseNumber(value.paid_amount, "paid_amount", { min: 0 });
  const creditAmount =
    value.credit_amount === undefined
      ? paymentMethod === "cash"
        ? 0
        : paymentMethod === "credit"
          ? total
          : Number(fallbackCredit ?? Math.max(0, total - paidAmount))
      : parseNumber(value.credit_amount, "credit_amount", { min: 0 });
  const roundedPaid = Math.round(paidAmount * 100) / 100;
  const roundedCredit = Math.round(creditAmount * 100) / 100;

  if (Math.abs(roundedPaid + roundedCredit - total) > 0.01) {
    throw new KassServerError("validation_error", "paid_amount and credit_amount total must match stock receipt total", 400);
  }

  const normalizedMethod: StockReceiptPaymentMethod =
    roundedPaid > 0 && roundedCredit > 0 ? "mixed" : roundedPaid > 0 ? "cash" : "credit";

  return {
    payment_method: normalizedMethod,
    paid_amount: roundedPaid,
    credit_amount: roundedCredit,
  };
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
