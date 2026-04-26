import { NextResponse } from "next/server";
import { jsonError, KassServerError } from "@/lib/kass/errors";
import { archiveOdooPartner, updateOdooPartner } from "@/lib/kass/odoo";
import { readJsonBody, requireString } from "@/lib/kass/validation";

export const runtime = "nodejs";

interface PartnerParams {
  params: Promise<{
    id: string;
  }>;
}

interface UpdatePartnerBody {
  name?: unknown;
  phone?: unknown;
  email?: unknown;
  company_register?: unknown;
  bank_account?: unknown;
  is_supplier?: unknown;
  is_customer?: unknown;
}

async function readPartnerId(context: PartnerParams) {
  const { id } = await context.params;
  const partnerId = Number(id);

  if (!Number.isInteger(partnerId) || partnerId <= 0) {
    throw new KassServerError("validation_error", "partner id буруу байна.", 400);
  }

  return partnerId;
}

function parseOptionalText(value: unknown) {
  return typeof value === "string" ? value : null;
}

function parseOptionalBoolean(value: unknown, field: string) {
  if (value === undefined) return undefined;
  if (typeof value !== "boolean") {
    throw new KassServerError("validation_error", `${field} boolean байх ёстой.`, 400);
  }

  return value;
}

export async function PATCH(request: Request, context: PartnerParams) {
  try {
    const partnerId = await readPartnerId(context);
    const body = await readJsonBody<UpdatePartnerBody>(request);
    const input: {
      name?: string;
      phone?: string | null;
      email?: string | null;
      company_register?: string | null;
      bank_account?: string | null;
      is_supplier?: boolean;
      is_customer?: boolean;
    } = {};

    if (body.name !== undefined) input.name = requireString(body.name, "name");
    if (body.phone !== undefined) input.phone = parseOptionalText(body.phone);
    if (body.email !== undefined) input.email = parseOptionalText(body.email);
    if (body.company_register !== undefined) input.company_register = parseOptionalText(body.company_register);
    if (body.bank_account !== undefined) input.bank_account = parseOptionalText(body.bank_account);

    const isSupplier = parseOptionalBoolean(body.is_supplier, "is_supplier");
    const isCustomer = parseOptionalBoolean(body.is_customer, "is_customer");
    if (isSupplier !== undefined) input.is_supplier = isSupplier;
    if (isCustomer !== undefined) input.is_customer = isCustomer;

    const partner = await updateOdooPartner(partnerId, input);
    return NextResponse.json({ partner });
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(_request: Request, context: PartnerParams) {
  try {
    const partnerId = await readPartnerId(context);
    const result = await archiveOdooPartner(partnerId);
    return NextResponse.json(result);
  } catch (error) {
    return jsonError(error);
  }
}
