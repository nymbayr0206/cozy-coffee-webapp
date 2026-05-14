import { NextResponse } from "next/server";
import { jsonError } from "@/lib/kass/errors";
import { recordOdooLoyaltyPurchase } from "@/lib/kass/odoo";
import { parseNumber, readJsonBody } from "@/lib/kass/validation";

export const runtime = "nodejs";

interface LoyaltyPurchaseBody {
  member_id?: unknown;
  coffee_quantity?: unknown;
}

export async function POST(request: Request) {
  try {
    const body = await readJsonBody<LoyaltyPurchaseBody>(request);
    const memberId = Math.trunc(parseNumber(body.member_id, "member_id", { min: 1 }));
    const coffeeQuantity = Math.trunc(parseNumber(body.coffee_quantity, "coffee_quantity", { min: 1 }));
    const wallet = await recordOdooLoyaltyPurchase({
      member_id: memberId,
      coffee_quantity: coffeeQuantity,
    });

    return NextResponse.json({ ok: true, ...wallet });
  } catch (error) {
    return jsonError(error);
  }
}
