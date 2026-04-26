import { NextResponse } from "next/server";
import { jsonError } from "@/lib/kass/errors";
import { fetchOdooProductUoms } from "@/lib/kass/odoo";

export const runtime = "nodejs";

export async function GET() {
  try {
    const uoms = await fetchOdooProductUoms();
    return NextResponse.json(uoms);
  } catch (error) {
    return jsonError(error);
  }
}
