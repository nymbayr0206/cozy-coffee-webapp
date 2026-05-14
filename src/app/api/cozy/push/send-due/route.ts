import { NextResponse } from "next/server";
import { assertPushCronAuthorized, configureWebPush, webpush } from "@/lib/cozy/push";
import { jsonError } from "@/lib/kass/errors";
import { fetchOdooPendingPushMessages, markOdooPushResult } from "@/lib/kass/odoo";
import { parseNumber } from "@/lib/kass/validation";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    assertPushCronAuthorized(request);
    configureWebPush();

    const { searchParams } = new URL(request.url);
    const limitParam = searchParams.get("limit");
    const limit = limitParam ? Math.trunc(parseNumber(limitParam, "limit", { min: 1 })) : 50;
    const pending = await fetchOdooPendingPushMessages(limit);
    let sent = 0;
    let failed = 0;

    for (const item of pending.messages ?? []) {
      try {
        await webpush.sendNotification(
          item.subscription,
          JSON.stringify({
            title: item.notification.title,
            body: item.notification.body,
            icon: item.notification.icon || "/icon.png",
            badge: item.notification.badge || "/favicon-32.png",
            image: item.notification.image || undefined,
            url: item.notification.url || "/user",
            tag: item.notification.tag || `cozy-notification-${item.message_id}`,
          }),
        );
        await markOdooPushResult({ message_id: item.message_id, ok: true });
        sent += 1;
      } catch (error) {
        failed += 1;
        await markOdooPushResult({
          message_id: item.message_id,
          ok: false,
          error: error instanceof Error ? error.message : "Push delivery failed.",
        }).catch(() => undefined);
      }
    }

    return NextResponse.json({ ok: true, scanned: pending.messages?.length ?? 0, sent, failed });
  } catch (error) {
    return jsonError(error);
  }
}
