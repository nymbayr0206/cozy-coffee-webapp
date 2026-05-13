"use client";

import { BarChart3, CalendarDays, ClipboardList, Package, PieChart, RefreshCcw, Trophy } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { formatMoney, getReadableError, getSalesReport, getStockReceipts, paymentMethodLabel } from "@/lib/kass/client-api";
import type { KassOrderSummary, KassStockReceipt, SalesReportPeriod, SalesReportResponse } from "@/lib/kass/client-types";

const periodOptions: Array<{ key: SalesReportPeriod; label: string }> = [
  { key: "day", label: "Өдөр" },
  { key: "week", label: "7 хоног" },
  { key: "month", label: "Сар" },
  { key: "year", label: "Жил" },
];

const monthLabels = [
  "1-р сар",
  "2-р сар",
  "3-р сар",
  "4-р сар",
  "5-р сар",
  "6-р сар",
  "7-р сар",
  "8-р сар",
  "9-р сар",
  "10-р сар",
  "11-р сар",
  "12-р сар",
];

const chartColors = ["#7a4d6f", "#0f766e", "#2563eb", "#b45309", "#be123c", "#475569"];

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
  return `${formatMonthDay(start, true)} - ${formatMonthDay(addDays(end, -1), true)}`;
}

function formatMonthDay(date: Date, includeYear = false) {
  const month = monthLabels[date.getMonth()] ?? "";
  const day = date.getDate();
  return includeYear ? `${date.getFullYear()} оны ${month} ${day}` : `${month} ${day}`;
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

function formatQuantity(quantity: number) {
  return Number.isInteger(quantity)
    ? quantity.toLocaleString("mn-MN")
    : quantity.toLocaleString("mn-MN", { maximumFractionDigits: 3 });
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
          ? monthLabels[bucketStart.getMonth()]
          : formatMonthDay(bucketStart);

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

function makePercent(value: number, max: number) {
  if (max <= 0) return 0;
  return Math.max(4, Math.round((value / max) * 100));
}

export default function ReportsPage() {
  const [period, setPeriod] = useState<SalesReportPeriod>("day");
  const [anchorDate, setAnchorDate] = useState(() => toDateInputValue(new Date()));
  const [report, setReport] = useState<SalesReportResponse | null>(null);
  const [stockReceipts, setStockReceipts] = useState<KassStockReceipt[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { start, end } = useMemo(() => getDateRange(period, anchorDate), [anchorDate, period]);
  const orders = report?.orders ?? [];
  const productRows = report?.products ?? [];
  const topProduct = productRows[0] ?? null;
  const buckets = useMemo(() => makeBuckets(orders, period, start, end), [end, orders, period, start]);
  const categoryRows = useMemo(() => {
    const byCategory = new Map<string, { name: string; total: number; quantity: number; productCount: number }>();

    productRows.forEach((product) => {
      const categoryName = product.category || "Ангилалгүй";
      const current = byCategory.get(categoryName) ?? {
        name: categoryName,
        total: 0,
        quantity: 0,
        productCount: 0,
      };
      current.total += Number(product.total ?? 0);
      current.quantity += Number(product.quantity ?? 0);
      current.productCount += 1;
      byCategory.set(categoryName, current);
    });

    return Array.from(byCategory.values()).sort((a, b) => b.total - a.total || b.quantity - a.quantity);
  }, [productRows]);
  const topProducts = useMemo(() => productRows.slice(0, 6), [productRows]);
  const maxCategoryTotal = Math.max(...categoryRows.map((category) => category.total), 0);
  const maxProductTotal = Math.max(...topProducts.map((product) => product.total), 0);
  const paymentBreakdown = useMemo(
    () =>
      [
        { label: "Бэлэн", value: Number(report?.cash_total ?? 0), color: chartColors[1] },
        { label: "Карт", value: Number(report?.card_total ?? 0), color: chartColors[2] },
        { label: "QPay", value: Number(report?.qpay_total ?? 0), color: chartColors[0] },
        { label: "Дансаар", value: Number(report?.bank_total ?? 0), color: chartColors[5] },
        { label: "Зээлээр", value: Number(report?.credit_total ?? 0), color: chartColors[3] },
        { label: "Бусад", value: Number(report?.other_total ?? 0), color: chartColors[4] },
      ].filter((item) => item.value > 0),
    [report],
  );
  const paymentTotal = paymentBreakdown.reduce((sum, item) => sum + item.value, 0);
  const paymentGradient =
    paymentTotal > 0
      ? paymentBreakdown
          .reduce(
            (state, item) => {
              const startPercent = state.current;
              const endPercent = startPercent + (item.value / paymentTotal) * 100;
              return {
                current: endPercent,
                parts: [...state.parts, `${item.color} ${startPercent.toFixed(2)}% ${endPercent.toFixed(2)}%`],
              };
            },
            { current: 0, parts: [] as string[] },
          )
          .parts.join(", ")
      : "#edf1f5 0% 100%";
  const stockReceiptSummary = useMemo(
    () =>
      stockReceipts.reduce(
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
      ),
    [stockReceipts],
  );

  async function loadReport() {
    setLoading(true);
    setError(null);

    try {
      const [nextReport, nextStockReceipts] = await Promise.all([
        getSalesReport(period, start.toISOString(), end.toISOString()),
        getStockReceipts({ start: start.toISOString(), end: end.toISOString(), status: "all" }),
      ]);
      setReport(nextReport);
      setStockReceipts(nextStockReceipts.receipts ?? []);
    } catch (loadError) {
      setError(getReadableError(loadError));
      setReport(null);
      setStockReceipts([]);
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
            <span>Дундаж цагийн борлуулалт</span>
            <strong>{formatMoney(report?.average_hourly_sales)}</strong>
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
            <span>Дансаар</span>
            <strong>{formatMoney(report?.bank_total)}</strong>
          </div>
          <div className="metric">
            <span>Зээлээр</span>
            <strong>{formatMoney(report?.credit_total)}</strong>
          </div>
          <div className="metric">
            <span>Бусад</span>
            <strong>{formatMoney(report?.other_total)}</strong>
          </div>
        </div>
      </section>

      <section className="report-dashboard-grid">
        <div className="content-panel report-chart-panel report-category-panel">
          <div className="panel-toolbar">
            <div>
              <p className="eyebrow">Ангилал</p>
              <h2>Борлуулалт ангиллаар</h2>
              <p className="muted-text small">{categoryRows.length} ангилал · {productRows.length} бараа</p>
            </div>
            <BarChart3 size={22} aria-hidden="true" />
          </div>

          {categoryRows.length > 0 ? (
            <div className="report-chart-list">
              {categoryRows.slice(0, 8).map((category, index) => (
                <div className="report-chart-row" key={category.name}>
                  <div className="report-chart-row-head">
                    <strong>{category.name}</strong>
                    <span>{formatMoney(category.total)}</span>
                  </div>
                  <div className="report-chart-track">
                    <div
                      className="report-chart-fill"
                      style={{
                        width: `${makePercent(category.total, maxCategoryTotal)}%`,
                        background: chartColors[index % chartColors.length],
                      }}
                    />
                  </div>
                  <div className="report-chart-meta">
                    <span>{formatQuantity(category.quantity)} ш</span>
                    <span>{category.productCount} бараа</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="compact-empty">
              <Package size={22} aria-hidden="true" />
              <span>{loading ? "Ангиллын график уншиж байна." : "Ангиллаар харуулах борлуулалт алга байна."}</span>
            </div>
          )}
        </div>

        <div className="content-panel report-chart-panel">
          <div className="panel-toolbar">
            <div>
              <p className="eyebrow">Бараа</p>
              <h2>Шилдэг бүтээгдэхүүн</h2>
            </div>
            <Trophy size={22} aria-hidden="true" />
          </div>

          {topProducts.length > 0 ? (
            <div className="top-product-list">
              {topProducts.map((product, index) => (
                <div className="top-product-row" key={product.product_id}>
                  <span>{index + 1}</span>
                  <div>
                    <strong>{product.name}</strong>
                    <small>{product.category || "Ангилалгүй"} · {formatQuantity(product.quantity)} ш</small>
                    <div className="report-chart-track">
                      <div
                        className="report-chart-fill"
                        style={{
                          width: `${makePercent(product.total, maxProductTotal)}%`,
                          background: chartColors[index % chartColors.length],
                        }}
                      />
                    </div>
                  </div>
                  <strong>{formatMoney(product.total)}</strong>
                </div>
              ))}
            </div>
          ) : (
            <div className="compact-empty">
              <Package size={22} aria-hidden="true" />
              <span>{loading ? "Барааны график уншиж байна." : "Барааны борлуулалт алга байна."}</span>
            </div>
          )}
        </div>

        <div className="content-panel report-chart-panel">
          <div className="panel-toolbar">
            <div>
              <p className="eyebrow">Төлбөр</p>
              <h2>Төлбөрийн mix</h2>
            </div>
            <PieChart size={22} aria-hidden="true" />
          </div>

          <div className="payment-donut-wrap">
            <div className="payment-donut" style={{ background: `conic-gradient(${paymentGradient})` }}>
              <div>
                <span>Нийт</span>
                <strong>{formatMoney(paymentTotal)}</strong>
              </div>
            </div>
            <div className="payment-donut-legend">
              {paymentBreakdown.length > 0 ? (
                paymentBreakdown.map((item) => (
                  <div key={item.label}>
                    <span style={{ background: item.color }} />
                    <strong>{item.label}</strong>
                    <small>{formatMoney(item.value)}</small>
                  </div>
                ))
              ) : (
                <div>
                  <span />
                  <strong>Борлуулалт</strong>
                  <small>Алга байна</small>
                </div>
              )}
            </div>
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
              <span>Дансаар</span>
              <strong>{formatMoney(report?.bank_total)}</strong>
            </div>
            <div>
              <span>Зээлээр</span>
              <strong>{formatMoney(report?.credit_total)}</strong>
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
            <p className="eyebrow">Агуулах</p>
            <h2>Орлогын тайлан</h2>
            <p className="muted-text small">
              Идэвхтэй {stockReceiptSummary.active_count} орлого · Буцаагдсан {stockReceiptSummary.returned_count} · Нийт өртөг {formatMoney(stockReceiptSummary.total_cost)}
            </p>
          </div>
          <span className="soft-pill">{stockReceipts.length} мөр</span>
        </div>

        {stockReceipts.length > 0 ? (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Огноо</th>
                  <th>Бараа</th>
                  <th>Тоо</th>
                  <th>Нэгж өртөг</th>
                  <th>Нийт</th>
                  <th>Харилцагч</th>
                  <th>Төлөв</th>
                </tr>
              </thead>
              <tbody>
                {stockReceipts.map((receipt) => {
                  const isReturned = receipt.status === "returned";

                  return (
                    <tr key={receipt.receipt_id}>
                      <td>{formatDateTime(receipt.created_at)}</td>
                      <td>
                        <strong>{receipt.product_name}</strong>
                        {receipt.note ? <small className="table-subtext">{receipt.note}</small> : null}
                      </td>
                      <td>{formatQuantity(receipt.quantity)}</td>
                      <td>{formatMoney(receipt.unit_cost)}</td>
                      <td>{formatMoney(isReturned ? 0 : receipt.total_cost)}</td>
                      <td>{receipt.partner_name || "Сонгоогүй"}</td>
                      <td>
                        <span className={isReturned ? "soft-pill muted-pill" : "soft-pill"}>
                          {isReturned ? "Буцаагдсан" : "Идэвхтэй"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="compact-empty">
            <ClipboardList size={22} aria-hidden="true" />
            <span>{loading ? "Орлогын тайлан уншиж байна." : "Энэ хугацаанд агуулахын орлого бүртгэгдээгүй байна."}</span>
          </div>
        )}
      </section>

      <section className="content-panel">
        <div className="panel-toolbar">
          <div>
            <p className="eyebrow">Бараа</p>
            <h2>Бүтээгдэхүүний задаргаа</h2>
            {topProduct ? (
              <p className="muted-text small">
                Хамгийн их зарагдсан: {topProduct.name} · {formatQuantity(topProduct.quantity)} ш
              </p>
            ) : null}
          </div>
          <span className="soft-pill">{productRows.length} бараа</span>
        </div>

        {productRows.length > 0 ? (
          <div className="table-wrap">
            <table className="data-table product-sales-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Бараа бүтээгдэхүүн</th>
                  <th>Зарагдсан тоо</th>
                  <th>Нийт дүн</th>
                  <th>Дундаж үнэ</th>
                  <th>Захиалга</th>
                </tr>
              </thead>
              <tbody>
                {productRows.map((product, index) => (
                  <tr key={product.product_id}>
                    <td>{index + 1}</td>
                    <td>
                      <strong>{product.name}</strong>
                    </td>
                    <td>{formatQuantity(product.quantity)} ш</td>
                    <td>{formatMoney(product.total)}</td>
                    <td>{formatMoney(product.average_price)}</td>
                    <td>{product.orders_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="compact-empty">
            <Package size={22} aria-hidden="true" />
            <span>{loading ? "Барааны тайлан уншиж байна." : "Энэ хугацаанд барааны борлуулалт алга байна."}</span>
          </div>
        )}
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
