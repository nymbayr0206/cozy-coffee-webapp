import { NextResponse } from "next/server";
import { checkOdooHealth } from "@/lib/kass/odoo";

export const runtime = "nodejs";

export async function GET() {
  const health = await checkOdooHealth();
  return NextResponse.json(health, { status: 200 });
}
