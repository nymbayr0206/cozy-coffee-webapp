import { NextResponse } from "next/server";
import { jsonError, KassServerError } from "@/lib/kass/errors";
import { addFinanceSettlement, getFinanceSettlements } from "@/lib/kass/store";
import { parseNumber, readJsonBody, requireString } from "@/lib/kass/validation";
import type { FinanceSettlementType } from "@/lib/kass/client-types";

export const runtime = "nodejs";

interface SettlementBody {
  type?: unknown;
  partner_id?: unknown;
  partner_name?: unknown;
  amount?: unknown;
  note?: unknown;
}

const settlementTypes = new Set<FinanceSettlementType>(["payable", "receivable"]);

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const type = url.searchParams.get("type");

    if (type && !settlementTypes.has(type as FinanceSettlementType)) {
      throw new KassServerError("validation_error", "settlement type must be payable or receivable", 400);
    }

    return NextResponse.json({
      settlements: getFinanceSettlements({ type: type as FinanceSettlementType | undefined }),
    });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = await readJsonBody<SettlementBody>(request);
    const typeValue = requireString(body.type, "type");

    if (!settlementTypes.has(typeValue as FinanceSettlementType)) {
      throw new KassServerError("validation_error", "settlement type must be payable or receivable", 400);
    }

    const amount = parseNumber(body.amount, "amount", { min: 0.01 });
    const partnerId =
      body.partner_id === undefined || body.partner_id === null || body.partner_id === ""
        ? null
        : Math.trunc(parseNumber(body.partner_id, "partner_id", { min: 1 }));
    const partnerName = requireString(body.partner_name, "partner_name");
    const note = typeof body.note === "string" && body.note.trim() ? body.note.trim() : null;
    const settlement = addFinanceSettlement({
      type: typeValue as FinanceSettlementType,
      partner_id: partnerId,
      partner_name: partnerName,
      amount,
      note,
    });

    return NextResponse.json({ settlement }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
