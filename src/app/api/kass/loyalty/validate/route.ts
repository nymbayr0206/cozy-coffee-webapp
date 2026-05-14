import { NextResponse } from "next/server";
import { jsonError } from "@/lib/kass/errors";
import { validateOdooLoyaltyCoupon } from "@/lib/kass/odoo";
import { readJsonBody, requireString } from "@/lib/kass/validation";

export const runtime = "nodejs";

interface ValidateCouponBody {
  qr_token?: unknown;
  pin?: unknown;
}

export async function POST(request: Request) {
  try {
    const body = await readJsonBody<ValidateCouponBody>(request);
    const qrToken = requireString(body.qr_token, "qr_token");
    const pin = requireString(body.pin, "pin");
    const coupon = await validateOdooLoyaltyCoupon(qrToken, pin);

    return NextResponse.json(coupon);
  } catch (error) {
    return jsonError(error);
  }
}
