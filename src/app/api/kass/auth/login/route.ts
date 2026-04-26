import { NextResponse } from "next/server";
import { jsonError } from "@/lib/kass/errors";
import { loginOdooUser } from "@/lib/kass/odoo";
import { readJsonBody, requireString } from "@/lib/kass/validation";

export const runtime = "nodejs";

interface LoginBody {
  username?: unknown;
  password?: unknown;
}

export async function POST(request: Request) {
  try {
    const body = await readJsonBody<LoginBody>(request);
    const username = requireString(body.username, "username");
    const password = requireString(body.password, "password");
    const user = await loginOdooUser(username, password);

    return NextResponse.json({
      ok: true,
      user,
    });
  } catch (error) {
    return jsonError(error);
  }
}
