"use client";

import { RefreshCcw } from "lucide-react";
import { useKassSession } from "@/components/kass/AppShell";
import { formatMoney, paymentMethodLabel } from "@/lib/kass/client-api";

export default function SalesPage() {
  const { sessionId, report, reportLoading, reportError, refreshReport } = useKassSession();
  const orders = Array.isArray(report?.orders) ? report.orders : [];

  return (
    <div className="page-stack">
      <section className="content-panel">
        <div className="panel-toolbar">
          <div>
            <p className="eyebrow">Борлуулалт</p>
            <h2>Одоогийн ээлжийн тайлан</h2>
          </div>
          <button className="secondary-button" type="button" onClick={refreshReport} disabled={!sessionId || reportLoading}>
            <RefreshCcw size={16} aria-hidden="true" />
            <span>{reportLoading ? "Уншиж байна" : "Шинэчлэх"}</span>
          </button>
        </div>

        {reportError ? <div className="inline-error">{reportError}</div> : null}

        <div className="summary-grid sales-summary">
          <div className="metric">
            <span>Нийт борлуулалт</span>
            <strong>{formatMoney(report?.total_sales)}</strong>
          </div>
          <div className="metric">
            <span>Бэлэн мөнгө</span>
            <strong>{formatMoney(report?.cash_total)}</strong>
          </div>
          <div className="metric">
            <span>Карт</span>
            <strong>{formatMoney(report?.card_total)}</strong>
          </div>
          <div className="metric">
            <span>QPay</span>
            <strong>{formatMoney(report?.qpay_total)}</strong>
          </div>
          <div className="metric">
            <span>Захиалга</span>
            <strong>{Number(report?.orders_count ?? 0)}</strong>
          </div>
        </div>

        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Баримт</th>
                <th>Захиалгын ID</th>
                <th>Төлбөр</th>
                <th>Нийт дүн</th>
                <th>Огноо</th>
              </tr>
            </thead>
            <tbody>
              {orders.length > 0 ? (
                orders.map((order, index) => (
                  <tr key={`${order.order_id ?? order.receipt_number ?? index}`}>
                    <td>{order.receipt_number ?? "Байхгүй"}</td>
                    <td>{order.order_id ?? "Байхгүй"}</td>
                    <td>{paymentMethodLabel(order.payment_method)}</td>
                    <td>{formatMoney(order.total)}</td>
                    <td>{order.created_at || order.date || "Байхгүй"}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5}>
                    {sessionId ? "Тайлан уншигдсан боловч захиалгын жагсаалт ирээгүй байна." : "Ээлж нээгдээгүй байна."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
