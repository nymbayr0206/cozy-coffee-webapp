import { NextResponse } from "next/server";
import { jsonError } from "@/lib/kass/errors";
import { createOdooPartner, fetchOdooPartners } from "@/lib/kass/odoo";
import { readJsonBody, requireString } from "@/lib/kass/validation";

export const runtime = "nodejs";

interface CreatePartnerBody {
  name?: unknown;
  phone?: unknown;
  email?: unknown;
  is_supplier?: unknown;
  is_customer?: unknown;
}

export async function GET() {
  try {
    const partners = await fetchOdooPartners();
    return NextResponse.json(partners);
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = await readJsonBody<CreatePartnerBody>(request);
    const name = requireString(body.name, "name");
    const partner = await createOdooPartner({
      name,
      phone: typeof body.phone === "string" ? body.phone : null,
      email: typeof body.email === "string" ? body.email : null,
      is_supplier: typeof body.is_supplier === "boolean" ? body.is_supplier : true,
      is_customer: typeof body.is_customer === "boolean" ? body.is_customer : false,
    });

    return NextResponse.json({ partner }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
