import { NextResponse } from "next/server";
import { getVapidPublicKey } from "@/lib/cozy/push";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({
    ok: true,
    public_key: getVapidPublicKey(),
    configured: Boolean(getVapidPublicKey()),
  });
}
