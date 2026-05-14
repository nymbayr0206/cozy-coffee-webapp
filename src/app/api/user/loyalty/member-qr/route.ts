import { NextResponse } from "next/server";
import QRCode from "qrcode";
import { jsonError } from "@/lib/kass/errors";
import { createOdooLoyaltyMemberQr } from "@/lib/kass/odoo";
import { parseNumber, readJsonBody } from "@/lib/kass/validation";

export const runtime = "nodejs";

interface MemberQrBody {
  member_id?: unknown;
}

export async function POST(request: Request) {
  try {
    const body = await readJsonBody<MemberQrBody>(request);
    const memberId = Math.trunc(parseNumber(body.member_id, "member_id", { min: 1 }));
    const result = await createOdooLoyaltyMemberQr(memberId);
    const qr_image = await QRCode.toDataURL(result.qr_token, {
      margin: 1,
      width: 260,
      color: {
        dark: "#111111",
        light: "#ffffff",
      },
    });

    return NextResponse.json({ ok: true, ...result, qr_image }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
