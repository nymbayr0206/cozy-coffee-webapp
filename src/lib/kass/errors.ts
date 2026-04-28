import { NextResponse } from "next/server";

export type KassErrorCode =
  | "odoo_config_missing"
  | "odoo_auth_failed"
  | "odoo_connection_failed"
  | "product_not_found"
  | "partner_not_found"
  | "product_create_failed"
  | "product_update_failed"
  | "product_delete_failed"
  | "category_create_failed"
  | "category_update_failed"
  | "category_delete_failed"
  | "stock_location_not_found"
  | "stock_receive_failed"
  | "qpay_invoice_failed"
  | "qpay_check_failed"
  | "session_already_open"
  | "session_not_found"
  | "session_closed"
  | "partner_create_failed"
  | "partner_update_failed"
  | "partner_delete_failed"
  | "invalid_payment_method"
  | "order_create_failed"
  | "validation_error";

export class KassServerError extends Error {
  code: KassErrorCode;
  status: number;

  constructor(code: KassErrorCode, message: string, status = 400) {
    super(message);
    this.name = "KassServerError";
    this.code = code;
    this.status = status;
  }
}

export function jsonError(error: unknown) {
  if (error instanceof KassServerError) {
    return NextResponse.json(
      {
        error: {
          code: error.code,
          message: error.message,
        },
      },
      { status: error.status },
    );
  }

  const message = error instanceof Error ? error.message : "Unexpected server error";
  return NextResponse.json(
    {
      error: {
        code: "validation_error",
        message,
      },
    },
    { status: 500 },
  );
}

export function assertMethod(method: string, allowed: string[]) {
  if (!allowed.includes(method)) {
    throw new KassServerError("validation_error", `Method ${method} is not allowed`, 405);
  }
}
