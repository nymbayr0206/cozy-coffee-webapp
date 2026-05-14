import { NextResponse } from "next/server";
import { jsonError } from "@/lib/kass/errors";
import { fetchOdooLoyaltyWallet } from "@/lib/kass/odoo";
import { parseNumber } from "@/lib/kass/validation";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const memberId = Math.trunc(parseNumber(searchParams.get("member_id"), "member_id", { min: 1 }));
    const wallet = await fetchOdooLoyaltyWallet(memberId);

    return NextResponse.json({ ok: true, ...wallet });
  } catch (error) {
    return jsonError(error);
  }
}
