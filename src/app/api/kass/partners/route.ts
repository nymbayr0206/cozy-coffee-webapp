import { NextResponse } from "next/server";
import { jsonError } from "@/lib/kass/errors";
import { fetchOdooPartners } from "@/lib/kass/odoo";

export const runtime = "nodejs";

export async function GET() {
  try {
    const partners = await fetchOdooPartners();
    return NextResponse.json(partners);
  } catch (error) {
    return jsonError(error);
  }
}
