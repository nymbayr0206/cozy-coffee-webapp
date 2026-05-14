import { NextResponse } from "next/server";
import { jsonError } from "@/lib/kass/errors";
import { fetchOdooNotificationInbox } from "@/lib/kass/odoo";
import { parseNumber } from "@/lib/kass/validation";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const memberId = Math.trunc(parseNumber(searchParams.get("member_id"), "member_id", { min: 1 }));
    const limitParam = searchParams.get("limit");
    const limit = limitParam ? Math.trunc(parseNumber(limitParam, "limit", { min: 1 })) : 30;
    const inbox = await fetchOdooNotificationInbox(memberId, limit);

    return NextResponse.json({ ok: true, ...inbox });
  } catch (error) {
    return jsonError(error);
  }
}
