import { NextResponse } from "next/server";
import { jsonError, KassServerError } from "@/lib/kass/errors";
import { markOdooNotificationsRead } from "@/lib/kass/odoo";
import { parseNumber, readJsonBody } from "@/lib/kass/validation";

export const runtime = "nodejs";

interface NotificationReadBody {
  member_id?: unknown;
  message_ids?: unknown;
  all?: unknown;
}

export async function POST(request: Request) {
  try {
    const body = await readJsonBody<NotificationReadBody>(request);
    const memberId = Math.trunc(parseNumber(body.member_id, "member_id", { min: 1 }));
    const all = body.all === true;
    const messageIds =
      body.message_ids === undefined || body.message_ids === null
        ? []
        : Array.isArray(body.message_ids)
          ? body.message_ids.map((item, index) => Math.trunc(parseNumber(item, `message_ids[${index}]`, { min: 1 })))
          : (() => {
              throw new KassServerError("validation_error", "message_ids must be an array", 400);
            })();

    if (!all && messageIds.length === 0) {
      throw new KassServerError("validation_error", "message_ids or all is required", 400);
    }

    const inbox = await markOdooNotificationsRead({
      member_id: memberId,
      message_ids: messageIds,
      all,
    });

    return NextResponse.json({ ok: true, ...inbox });
  } catch (error) {
    return jsonError(error);
  }
}
