import { NextResponse } from "next/server";
import { getStockReceipts } from "@/lib/kass/store";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const start = url.searchParams.get("start") ?? undefined;
  const end = url.searchParams.get("end") ?? undefined;
  const statusParam = url.searchParams.get("status");
  const status = statusParam === "active" || statusParam === "returned" ? statusParam : "all";
  const receipts = getStockReceipts({ start, end, status });

  const totals = receipts.reduce(
    (sum, receipt) => {
      if (receipt.status === "returned") {
        sum.returned_count += 1;
        return sum;
      }

      sum.active_count += 1;
      sum.total_quantity += Number(receipt.quantity ?? 0);
      sum.total_cost += Number(receipt.total_cost ?? 0);
      return sum;
    },
    {
      active_count: 0,
      returned_count: 0,
      total_quantity: 0,
      total_cost: 0,
    },
  );

  return NextResponse.json({
    receipts,
    ...totals,
  });
}
