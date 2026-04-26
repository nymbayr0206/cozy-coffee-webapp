import { NextResponse } from "next/server";
import { jsonError } from "@/lib/kass/errors";
import { fetchOdooProductCategories } from "@/lib/kass/odoo";

export const runtime = "nodejs";

export async function GET() {
  try {
    const categories = await fetchOdooProductCategories();
    return NextResponse.json(categories);
  } catch (error) {
    return jsonError(error);
  }
}
