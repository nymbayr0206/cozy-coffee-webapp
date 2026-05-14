import { NextResponse } from "next/server";
import { jsonError, KassServerError } from "@/lib/kass/errors";
import { loginOdooLoyaltyMember, registerOdooLoyaltyMember } from "@/lib/kass/odoo";
import { readJsonBody, requireString } from "@/lib/kass/validation";

export const runtime = "nodejs";

interface LoyaltyAuthBody {
  mode?: unknown;
  name?: unknown;
  phone?: unknown;
  pin?: unknown;
}

export async function POST(request: Request) {
  try {
    const body = await readJsonBody<LoyaltyAuthBody>(request);
    const mode = body.mode === "login" ? "login" : body.mode === "register" ? "register" : null;
    const phone = requireString(body.phone, "phone");
    const pin = requireString(body.pin, "pin");

    if (!mode) {
      throw new KassServerError("validation_error", "mode must be login or register", 400);
    }

    const wallet =
      mode === "register"
        ? await registerOdooLoyaltyMember({
            name: typeof body.name === "string" && body.name.trim() ? body.name.trim() : phone,
            phone,
            pin,
          })
        : await loginOdooLoyaltyMember({ phone, pin });

    return NextResponse.json({ ok: true, ...wallet });
  } catch (error) {
    return jsonError(error);
  }
}
