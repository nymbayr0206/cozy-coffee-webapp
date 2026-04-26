import { NextResponse } from "next/server";
import { jsonError } from "@/lib/kass/errors";
import { closeSession } from "@/lib/kass/store";
import { parseNumber, readJsonBody, requireString } from "@/lib/kass/validation";

export const runtime = "nodejs";

interface CloseSessionBody {
  session_id?: unknown;
  closing_cash?: unknown;
}

export async function POST(request: Request) {
  try {
    const body = await readJsonBody<CloseSessionBody>(request);
    const sessionId = requireString(body.session_id, "session_id");
    const closingCash = parseNumber(body.closing_cash, "closing_cash", { min: 0 });
    const report = closeSession(sessionId, closingCash);

    return NextResponse.json(report);
  } catch (error) {
    return jsonError(error);
  }
}
