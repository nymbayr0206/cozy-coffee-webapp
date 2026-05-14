import { NextResponse } from "next/server";
import { jsonError, KassServerError } from "@/lib/kass/errors";
import { updateOdooNotificationSettings } from "@/lib/kass/odoo";
import { parseNumber, readJsonBody } from "@/lib/kass/validation";

export const runtime = "nodejs";

interface NotificationSettingsBody {
  member_id?: unknown;
  marketing_opt_in?: unknown;
}

export async function POST(request: Request) {
  try {
    const body = await readJsonBody<NotificationSettingsBody>(request);
    const memberId = Math.trunc(parseNumber(body.member_id, "member_id", { min: 1 }));

    if (typeof body.marketing_opt_in !== "boolean") {
      throw new KassServerError("validation_error", "marketing_opt_in must be a boolean", 400);
    }

    const wallet = await updateOdooNotificationSettings({
      member_id: memberId,
      marketing_opt_in: body.marketing_opt_in,
    });

    return NextResponse.json({ ok: true, ...wallet });
  } catch (error) {
    return jsonError(error);
  }
}
