import { NextResponse } from "next/server";
import { jsonError } from "@/lib/kass/errors";
import { recordOdooLoyaltyPurchase } from "@/lib/kass/odoo";
import { requireString } from "@/lib/kass/validation";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const phone = requireString(searchParams.get("phone"), "phone");
    const wallet = await recordOdooLoyaltyPurchase({
      phone,
      coffee_quantity: 0,
    });

    return NextResponse.json({
      ok: true,
      customer: {
        member_id: wallet.member.id,
        partner_id: wallet.member.partner_id,
        name: wallet.member.name,
        phone: wallet.member.phone,
        stamp_count: wallet.member.stamp_count,
        stamp_cards: wallet.stamp_cards ?? [],
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}
