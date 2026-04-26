import { NextResponse } from "next/server";
import { jsonError, KassServerError } from "@/lib/kass/errors";
import { getActiveSession, getSessionEvents, getSessionHistory } from "@/lib/kass/store";

export const runtime = "nodejs";

const allowedStatuses = new Set(["open", "closed"]);

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const status = url.searchParams.get("status");
    const sessionId = url.searchParams.get("session_id")?.trim();
    const limitValue = url.searchParams.get("limit");
    const limit = limitValue ? Number(limitValue) : undefined;

    if (status && !allowedStatuses.has(status)) {
      throw new KassServerError("validation_error", "status нь open эсвэл closed байх ёстой.", 400);
    }

    if (limit !== undefined && (!Number.isInteger(limit) || limit <= 0)) {
      throw new KassServerError("validation_error", "limit нь 0-ээс их бүхэл тоо байх ёстой.", 400);
    }

    return NextResponse.json({
      sessions: getSessionHistory({
        status: status as "open" | "closed" | undefined,
        limit,
      }),
      events: getSessionEvents(sessionId),
      active_session: getActiveSession(),
    });
  } catch (error) {
    return jsonError(error);
  }
}
