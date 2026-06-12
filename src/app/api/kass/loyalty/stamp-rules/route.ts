import { NextResponse } from "next/server";
import { jsonError } from "@/lib/kass/errors";
import { getOdooLoyaltyStampRules } from "@/lib/kass/odoo";

export const runtime = "nodejs";

export async function GET() {
  try {
    const rules = await getOdooLoyaltyStampRules();
    return NextResponse.json(rules);
  } catch (error) {
    return jsonError(error);
  }
}
