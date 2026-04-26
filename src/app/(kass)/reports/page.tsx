"use client";

import { BarChart3, CalendarDays, RefreshCcw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { formatMoney, getReadableError, getSalesReport, paymentMethodLabel } from "@/lib/kass/client-api";
import type { KassOrderSummary, SalesReportPeriod, SalesReportResponse } from "@/lib/kass/client-types";

const periodOptions: Array<{ key: SalesReportPeriod; label: string }> = [
  { key: "day", label: "Өдөр" },
  { key: "week", label: "7 хоног" },
  { key: "month", label: "Сар" },
  { key: "year", label: "Жил" },
];

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function addMonths(date: Date, months: number) {
  const next = new Date(date);
  next.setMonth(next.getMonth() + months);
  return next;
}

function addYears(date: Date, years: number) {
  const next = new Date(date);
  next.setFullYear(next.getFullYear() + years);
  return next;
}

function toDateInputValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseAnchorDate(value: string) {
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? startOfDay(new Date()) : date;
}

function getDateRange(period: SalesReportPeriod, anchorValue: string) {
  const anchor = parseAnchorDate(anchorValue);
  if (period === "day") {
    const start = startOfDay(anchor);
    return { start, end: addDays(start, 1) };
  }

  if (period === "week") {
    const day = anchor.getDay();
    const offset = day === 0 ? -6 : 1 - day;
    const start = startOfDay(addDays(anchor, offset));
    return { start, end: addDays(start, 7) };
  }

  if (period === "month") {
    const start = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
    return { start, end: addMonths(start, 1) };
  }

  const start = new Date(anchor.getFullYear(), 0, 1);
  return { start, end: addYears(start, 1) };
}

function formatRange(start: Date, end: Date) {
  const formatter = new Intl.DateTimeFormat("mn-MN", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
  return `${formatter.format(start)} - ${formatter.format(addDays(end, -1))}`;
}

function formatDateTime(value?: string | null) {
  if (!value) return "Байхгүй";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("mn-MN", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function makeBuckets(orders: KassOrderSummary[], period: SalesReportPeriod, start: Date, end: Date) {
  const bucketStarts: Date[] = [];

  if (period === "day") {
    for (let hour = 0; hour < 24; hour += 1) {
      bucketStarts.push(new Date(start.getFullYear(), start.getMonth(), start.getDate(), hour));
    }
  } else if (period === "week") {
    for (let index = 0; index < 7; index += 1) bucketStarts.push(addDays(start, index));
  } else if (period === "month") {
    for (let cursor = new Date(start); cursor < end; cursor = addDays(cursor, 1)) bucketStarts.push(new Date(cursor));
  } else {
    for (let month = 0; month < 12; month += 1) bucketStarts.push(new Date(start.getFullYear(), month, 1));
  }

  const buckets = bucketStarts.map((bucketStart, index) => {
    const bucketEnd =
      period === "day"
        ? new Date(bucketStart.getTime() + 60 * 60 * 1000)
        : period === "year"
          ? addMonths(bucketStart, 1)
          : addDays(bucketStart, 1);
    const bucketOrders = orders.filter((order) => {
      const orderDate = new Date(order.created_at ?? order.date ?? "");
      return orderDate >= bucketStart && orderDate < bucketEnd;
    });
    const total = bucketOrders.reduce((sum, order) => sum + Number(order.total ?? 0), 0);

    const label =
      period === "day"
        ? `${String(index).padStart(2, "0")}:00`
        : period === "year"
          ? new Intl.DateTimeFormat("mn-MN", { month: "short" }).format(bucketStart)
          : new Intl.DateTimeFormat("mn-MN", { month: "short", day: "numeric" }).format(bucketStart);

    return {
      label,
      total,
      count: bucketOrders.length,
    };
  });
  const maxTotal = Math.max(...buckets.map((bucket) => bucket.total), 1);

  return buckets.map((bucket) => ({
    ...bucket,
    percent: Math.max(2, Math.round((bucket.total / maxTotal) * 100)),
  }));
}

export default function ReportsPage() {
  const [period, setPeriod] = useState<SalesReportPeriod>("day");
  const [anchorDate, setAnchorDate] = useState(() => toDateInputValue(new Date()));
  const [report, setReport] = useState<SalesReportResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { start, end } = useMemo(() => getDateRange(period, anchorDate), [anchorDate, period]);
  const orders = report?.orders ?? [];
  const buckets = useMemo(() => makeBuckets(orders, period, start, end), [end, orders, period, start]);

  async function loadReport() {
    setLoading(true);
    setError(null);

    try {
      const nextReport = await getSalesReport(period, start.toISOString(), end.toISOString());
      setReport(nextReport);
    } catch (loadError) {
      setError(getReadableError(loadError));
      setReport(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadReport();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period, start.getTime(), end.getTime()]);

  return (
    <div className="page-stack reports-page" data-testid="reports-page">
      <section className="content-panel">
        <div className="panel-toolbar report-toolbar">
          <div>
            <p className="eyebrow">Тайлан</p>
            <h2>Борлуулалтын тайлан</h2>
            <p className="muted-text small">{formatRange(start, end)}</p>
          </div>
          <div className="toolbar-actions">
            <label className="date-filter">
              <CalendarDays size={16} aria-hidden="true" />
              <input type="date" value={anchorDate} onChange={(event) => setAnchorDate(event.target.value)} />
            </label>
            <button className="secondary-button" type="button" onClick={loadReport} disabled={loading}>
              <RefreshCcw size={16} aria-hidden="true" />
              <span>{loading ? "Уншиж байна" : "Шинэчлэх"}</span>
            </button>
          </div>
        </div>

        <div className="period-tabs" role="tablist" aria-label="Тайлангийн хугацаа">
          {periodOptions.map((option) => (
            <button
              key={option.key}
              className={period === option.key ? "period-tab active" : "period-tab"}
              type="button"
              onClick={() => setPeriod(option.key)}
            >
              {option.label}
            </button>
          ))}
        </div>

        {error ? <div className="inline-error">{error}</div> : null}

        <div className="report-kpi-grid">
          <div className="metric strong-metric">
            <span>Нийт борлуулалт</span>
            <strong>{formatMoney(report?.total_sales)}</strong>
          </div>
          <div className="metric">
            <span>Захиалга</span>
            <strong>{Number(report?.orders_count ?? 0)}</strong>
          </div>
          <div className="metric">
            <span>Дундаж чек</span>
            <strong>{formatMoney(report?.average_order)}</strong>
          </div>
          <div className="metric">
            <span>Бэлэн</span>
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
            <span>Бусад</span>
            <strong>{formatMoney(report?.other_total)}</strong>
          </div>
        </div>
      </section>

      <section className="dashboard-layout lower">
        <div className="content-panel">
          <div className="panel-toolbar">
            <div>
              <p className="eyebrow">Хуваарилалт</p>
              <h2>{periodOptions.find((option) => option.key === period)?.label} дотор</h2>
            </div>
            <BarChart3 size={22} aria-hidden="true" />
          </div>

          <div className="report-buckets">
            {buckets.map((bucket) => (
              <div className="bucket-row" key={bucket.label}>
                <span>{bucket.label}</span>
                <div className="bucket-track">
                  <div className="bucket-fill" style={{ width: `${bucket.percent}%` }} />
                </div>
                <strong>{formatMoney(bucket.total)}</strong>
                <small>{bucket.count}</small>
              </div>
            ))}
          </div>
        </div>

        <div className="content-panel">
          <div className="panel-toolbar">
            <div>
              <p className="eyebrow">Задаргаа</p>
              <h2>Төлбөрийн төрөл</h2>
            </div>
          </div>
          <div className="insight-list">
            <div>
              <span>Бэлэн мөнгө</span>
              <strong>{formatMoney(report?.cash_total)}</strong>
            </div>
            <div>
              <span>Карт</span>
              <strong>{formatMoney(report?.card_total)}</strong>
            </div>
            <div>
              <span>QPay</span>
              <strong>{formatMoney(report?.qpay_total)}</strong>
            </div>
            <div>
              <span>Бусад</span>
              <strong>{formatMoney(report?.other_total)}</strong>
            </div>
          </div>
        </div>
      </section>

      <section className="content-panel">
        <div className="panel-toolbar">
          <div>
            <p className="eyebrow">Захиалга</p>
            <h2>Борлуулалтын жагсаалт</h2>
          </div>
          <span className="soft-pill">{orders.length} мөр</span>
        </div>

        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Баримт</th>
                <th>Захиалгын ID</th>
                <th>Төлбөр</th>
                <th>Дүн</th>
                <th>Огноо</th>
                <th>Төлөв</th>
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
                    <td>{formatDateTime(order.created_at ?? order.date)}</td>
                    <td>{String(order.state ?? "Байхгүй")}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6}>{loading ? "Тайлан уншиж байна." : "Энэ хугацаанд борлуулалт алга байна."}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
