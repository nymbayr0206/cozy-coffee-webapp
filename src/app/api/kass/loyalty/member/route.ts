import { NextResponse } from "next/server";
import { jsonError } from "@/lib/kass/errors";
import { validateOdooLoyaltyMemberQr } from "@/lib/kass/odoo";
import { readJsonBody, requireString } from "@/lib/kass/validation";

export const runtime = "nodejs";

interface ValidateMemberBody {
  qr_token?: unknown;
}

export async function POST(request: Request) {
  try {
    const body = await readJsonBody<ValidateMemberBody>(request);
    const qrToken = requireString(body.qr_token, "qr_token");
    const member = await validateOdooLoyaltyMemberQr(qrToken);

    return NextResponse.json(member);
  } catch (error) {
    return jsonError(error);
  }
}
