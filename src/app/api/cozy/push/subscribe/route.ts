import { NextResponse } from "next/server";
import { jsonError, KassServerError } from "@/lib/kass/errors";
import { disableOdooPushSubscription, saveOdooPushSubscription } from "@/lib/kass/odoo";
import { parseNumber, readJsonBody } from "@/lib/kass/validation";

export const runtime = "nodejs";

interface PushSubscriptionBody {
  member_id?: unknown;
  subscription?: unknown;
  enabled?: unknown;
}

export async function POST(request: Request) {
  try {
    const body = await readJsonBody<PushSubscriptionBody>(request);
    const memberId = Math.trunc(parseNumber(body.member_id, "member_id", { min: 1 }));

    if (body.enabled === false) {
      const member = await disableOdooPushSubscription(memberId);
      return NextResponse.json({ ok: true, member });
    }

    if (!body.subscription || typeof body.subscription !== "object") {
      throw new KassServerError("validation_error", "subscription is required", 400);
    }

    const member = await saveOdooPushSubscription(memberId, body.subscription);
    return NextResponse.json({ ok: true, member });
  } catch (error) {
    return jsonError(error);
  }
}
