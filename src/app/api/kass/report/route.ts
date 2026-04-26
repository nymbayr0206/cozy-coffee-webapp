import { NextResponse } from "next/server";
import { jsonError } from "@/lib/kass/errors";
import { getReport } from "@/lib/kass/store";
import { requireString } from "@/lib/kass/validation";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const sessionId = requireString(url.searchParams.get("session_id"), "session_id");
    const report = getReport(sessionId);

    return NextResponse.json(report);
  } catch (error) {
    return jsonError(error);
  }
}
