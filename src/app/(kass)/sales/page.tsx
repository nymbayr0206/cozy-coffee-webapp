"use client";

import { Clock3, Eye, RefreshCcw, Undo2 } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Fragment, Suspense, useEffect, useState } from "react";
import { useKassSession } from "@/components/kass/AppShell";
import {
  formatMoney,
  getKassSessions,
  getReadableError,
  getSessionReport,
  paymentMethodLabel,
  returnKassOrder,
  updateKassOrderPayment,
} from "@/lib/kass/client-api";
import type { KassOrderSummary, KassSessionEvent, KassReport, PaymentMethod } from "@/lib/kass/client-types";

const editablePaymentMethods: PaymentMethod[] = ["cash", "card", "qpay", "bank", "credit"];

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

function formatOptionalMoney(value: unknown, fallback = "Хаагаагүй") {
  if (value === undefined || value === null || value === "") return fallback;

  const amount = Number(value);
  return Number.isFinite(amount) ? formatMoney(amount) : fallback;
}

function sessionStatusLabel(session: KassReport) {
  return session.closed_at ? "Хаагдсан" : "Нээлттэй";
}

function eventLabel(event: KassSessionEvent) {
  if (event.type === "session_opened") return "Ээлж нээгдсэн";
  if (event.type === "session_closed") return "Ээлж хаагдсан";
  if (event.type === "order_created") return "Захиалга";
  if (event.type === "order_returned") return "Буцаалт";
  return event.type;
}

function eventAmount(event: KassSessionEvent) {
  if (event.type === "session_opened") return event.opening_cash ?? 0;
  if (event.type === "session_closed") return event.closing_cash ?? 0;
  return event.amount ?? 0;
}

function eventAmountLabel(event: KassSessionEvent) {
  if (event.type === "session_opened") return "Нээлтийн касс";
  if (event.type === "session_closed") return "Хаалтын касс";
  if (event.type === "order_returned") return "Буцаалт";
  return "Дүн";
}

function SalesPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { sessionId, report, reportLoading, reportError, refreshReport } = useKassSession();
  const selectedSessionId = searchParams.get("session_id");
  const viewingSpecificSession = Boolean(selectedSessionId);
  const [selectedReport, setSelectedReport] = useState<KassReport | null>(null);
  const [selectedReportLoading, setSelectedReportLoading] = useState(false);
  const [selectedReportError, setSelectedReportError] = useState<string | null>(null);
  const [sessions, setSessions] = useState<KassReport[]>([]);
  const [events, setEvents] = useState<KassSessionEvent[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [returningOrderKey, setReturningOrderKey] = useState<string | null>(null);
  const [updatingPaymentKey, setUpdatingPaymentKey] = useState<string | null>(null);
  const displayReport = viewingSpecificSession ? selectedReport : report;
  const displayLoading = viewingSpecificSession ? selectedReportLoading : reportLoading;
  const displayError = viewingSpecificSession ? selectedReportError : reportError;
  const orders = Array.isArray(displayReport?.orders) ? displayReport.orders : [];
  const activeSession = sessions.find((session) => !session.closed_at);
  const headingSession = viewingSpecificSession ? selectedReport : activeSession;

  async function loadSessionHistory() {
    setHistoryLoading(true);
    setHistoryError(null);

    try {
      const response = await getKassSessions({ limit: 30 });
      setSessions(response.sessions ?? []);
      setEvents(response.events ?? []);
    } catch (error) {
      setHistoryError(getReadableError(error));
      setSessions([]);
      setEvents([]);
    } finally {
      setHistoryLoading(false);
    }
  }

  async function refreshAll() {
    await Promise.all([viewingSpecificSession ? loadSelectedReport() : refreshReport(), loadSessionHistory()]);
  }

  async function loadSelectedReport() {
    if (!selectedSessionId) return;

    setSelectedReportLoading(true);
    setSelectedReportError(null);

    try {
      const response = await getSessionReport(selectedSessionId);
      setSelectedReport(response);
    } catch (error) {
      setSelectedReportError(getReadableError(error));
      setSelectedReport(null);
    } finally {
      setSelectedReportLoading(false);
    }
  }

  async function handleReturnOrder(order: KassOrderSummary) {
    const reference = order.receipt_number ?? order.order_id;
    if (!reference) return;

    const ok = window.confirm(`${order.receipt_number ?? order.order_id} борлуулалтыг буцаах уу?`);
    if (!ok) return;

    const key = String(reference);
    setReturningOrderKey(key);
    setSelectedReportError(null);
    setHistoryError(null);

    try {
      await returnKassOrder(reference);
      await refreshAll();
    } catch (error) {
      const message = getReadableError(error);
      if (viewingSpecificSession) {
        setSelectedReportError(message);
      } else {
        setHistoryError(message);
      }
    } finally {
      setReturningOrderKey(null);
    }
  }

  async function handleUpdateOrderPayment(order: KassOrderSummary, paymentMethod: PaymentMethod) {
    const reference = order.receipt_number ?? order.order_id;
    if (!reference) return;
    if (order.payment_method === paymentMethod) return;

    const ok = window.confirm(
      `${order.receipt_number ?? order.order_id} борлуулалтын төлбөрийг ${paymentMethodLabel(paymentMethod)} болгох уу?`,
    );
    if (!ok) return;

    const key = String(reference);
    setUpdatingPaymentKey(key);
    setSelectedReportError(null);
    setHistoryError(null);

    try {
      await updateKassOrderPayment(reference, { payment_method: paymentMethod });
      await refreshAll();
    } catch (error) {
      const message = getReadableError(error);
      if (viewingSpecificSession) {
        setSelectedReportError(message);
      } else {
        setHistoryError(message);
      }
    } finally {
      setUpdatingPaymentKey(null);
    }
  }

  function handleViewSessionSales(session: KassReport) {
    if (!session.session_id) return;
    router.push(`/sales?session_id=${encodeURIComponent(session.session_id)}`);
  }

  function renderOrderRows(orderList: KassOrderSummary[], emptyMessage: string) {
    if (orderList.length === 0) {
      return (
        <tr>
          <td colSpan={6}>{emptyMessage}</td>
        </tr>
      );
    }

    return orderList.map((order, index) => {
      const reference = order.receipt_number ?? order.order_id;
      const isReturned = order.status === "returned";
      const returning = returningOrderKey === String(reference);
      const updatingPayment = updatingPaymentKey === String(reference);
      const selectedPaymentMethod = editablePaymentMethods.includes(order.payment_method as PaymentMethod)
        ? order.payment_method
        : "";

      return (
        <tr className={isReturned ? "row-returned" : undefined} key={`${order.order_id ?? order.receipt_number ?? index}`}>
          <td>
            {order.receipt_number ?? "Байхгүй"}
            {isReturned ? <span className="table-subtext">Буцаагдсан: {formatDateTime(order.returned_at)}</span> : null}
          </td>
          <td>{order.order_id ?? "Байхгүй"}</td>
          <td>
            {isReturned ? (
              <span className="status-pill muted">Буцаагдсан</span>
            ) : (
              <div className="payment-edit-cell">
                <select
                  aria-label={`${order.receipt_number ?? order.order_id ?? "Борлуулалт"} төлбөрийн төрөл`}
                  value={selectedPaymentMethod}
                  onChange={(event) => handleUpdateOrderPayment(order, event.target.value as PaymentMethod)}
                  disabled={updatingPayment || returning || !reference}
                >
                  {selectedPaymentMethod ? null : <option value="">{paymentMethodLabel(order.payment_method)}</option>}
                  {editablePaymentMethods.map((method) => (
                    <option key={method} value={method}>
                      {paymentMethodLabel(method)}
                    </option>
                  ))}
                </select>
                {updatingPayment ? <span className="table-subtext">Засаж байна</span> : null}
              </div>
            )}
          </td>
          <td>{formatMoney(order.total)}</td>
          <td>{formatDateTime(order.created_at ?? order.date)}</td>
          <td>
            <div className="table-actions">
              <button
                className="secondary-button"
                type="button"
                onClick={() => handleReturnOrder(order)}
                disabled={isReturned || returning || updatingPayment || !reference}
              >
                <Undo2 size={16} aria-hidden="true" />
                <span>{returning ? "Буцааж байна" : "Буцаах"}</span>
              </button>
            </div>
          </td>
        </tr>
      );
    });
  }

  useEffect(() => {
    loadSessionHistory();
  }, []);

  useEffect(() => {
    if (!selectedSessionId) {
      setSelectedReport(null);
      setSelectedReportError(null);
      return;
    }

    loadSelectedReport();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSessionId]);

  return (
    <div className="page-stack" data-testid="sales-page">
      <section className="content-panel">
        <div className="panel-toolbar">
          <div>
            <p className="eyebrow">Борлуулалт</p>
            <h2>{viewingSpecificSession ? "Ээлжийн тайлан" : "Одоогийн ээлжийн тайлан"}</h2>
            {headingSession ? (
              <p className="muted-text small">
                Нээсэн: {headingSession.cashier_name ?? "Кассир"} · {formatDateTime(headingSession.opened_at)}
                {headingSession.closed_at ? ` · Хаасан: ${formatDateTime(headingSession.closed_at)}` : ""}
              </p>
            ) : (
              <p className="muted-text small">
                {viewingSpecificSession ? "Ээлжийн тайлан уншиж байна." : "Одоогоор нээлттэй ээлж алга."}
              </p>
            )}
          </div>
          <button
            className="secondary-button"
            type="button"
            onClick={refreshAll}
            disabled={displayLoading || historyLoading}
          >
            <RefreshCcw size={16} aria-hidden="true" />
            <span>{displayLoading || historyLoading ? "Уншиж байна" : "Шинэчлэх"}</span>
          </button>
        </div>

        {displayError ? <div className="inline-error">{displayError}</div> : null}
        {historyError ? <div className="inline-error">{historyError}</div> : null}

        <div className="summary-grid sales-summary">
          <div className="metric">
            <span>Нийт борлуулалт</span>
            <strong>{formatMoney(displayReport?.total_sales)}</strong>
          </div>
          <div className="metric">
            <span>Бэлэн мөнгө</span>
            <strong>{formatMoney(displayReport?.cash_total)}</strong>
          </div>
          <div className="metric">
            <span>Карт</span>
            <strong>{formatMoney(displayReport?.card_total)}</strong>
          </div>
          <div className="metric">
            <span>QPay</span>
            <strong>{formatMoney(displayReport?.qpay_total)}</strong>
          </div>
          <div className="metric">
            <span>Дансаар</span>
            <strong>{formatMoney(displayReport?.bank_total)}</strong>
          </div>
          <div className="metric">
            <span>Зээлээр</span>
            <strong>{formatMoney(displayReport?.credit_total)}</strong>
          </div>
          <div className="metric">
            <span>Захиалга</span>
            <strong>{Number(displayReport?.orders_count ?? 0)}</strong>
          </div>
          <div className="metric">
            <span>Буцаалт</span>
            <strong>{Number(displayReport?.returned_orders_count ?? 0)}</strong>
          </div>
        </div>

        <div className="section-heading-row cash-report-heading">
          <div>
            <p className="eyebrow">Кассын тайлан</p>
            <h2>Нээлт, хаалтын мөнгө</h2>
          </div>
        </div>

        <div className="summary-grid sales-summary cash-report-grid">
          <div className="metric">
            <span>Нээлтийн касс</span>
            <strong>{formatMoney(displayReport?.opening_cash)}</strong>
          </div>
          <div className="metric">
            <span>Бэлэн борлуулалт</span>
            <strong>{formatMoney(displayReport?.cash_total)}</strong>
          </div>
          <div className="metric">
            <span>Хүлээгдэж буй касс</span>
            <strong>{formatMoney(displayReport?.expected_cash)}</strong>
          </div>
          <div className="metric">
            <span>Хаалтын касс</span>
            <strong>{formatOptionalMoney(displayReport?.closing_cash)}</strong>
          </div>
          <div className="metric">
            <span>Кассын зөрүү</span>
            <strong>{formatOptionalMoney(displayReport?.cash_difference)}</strong>
          </div>
          <div className="metric">
            <span>Төлөв</span>
            <strong>{displayReport?.closed_at ? "Хаагдсан" : "Нээлттэй"}</strong>
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
                <th>Үйлдэл</th>
              </tr>
            </thead>
            <tbody>
              {renderOrderRows(
                orders,
                displayLoading
                  ? "Ээлжийн тайлан уншиж байна."
                  : viewingSpecificSession
                    ? "Энэ ээлж дээр борлуулалт бүртгэгдээгүй байна."
                    : sessionId
                      ? "Энэ ээлж дээр борлуулалт бүртгэгдээгүй байна."
                      : "Ээлж нээгдээгүй байна.",
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="dashboard-layout lower">
        <div className="content-panel">
          <div className="panel-toolbar">
            <div>
              <p className="eyebrow">Ээлжийн бүртгэл</p>
              <h2>Нээгдсэн, хаагдсан ээлжүүд</h2>
            </div>
            <span className="soft-pill">{sessions.length} мөр</span>
          </div>

          <div className="table-wrap">
            <table className="data-table session-history-table">
              <thead>
                <tr>
                  <th>Төлөв</th>
                  <th>Нээсэн хүн</th>
                  <th>Нээгдсэн</th>
                  <th>Хаагдсан</th>
                  <th>Нээлтийн касс</th>
                  <th>Хүлээгдэж буй касс</th>
                  <th>Хаалтын касс</th>
                  <th>Зөрүү</th>
                  <th>Нийт борлуулалт</th>
                  <th>Үйлдэл</th>
                </tr>
              </thead>
              <tbody>
                {sessions.length > 0 ? (
                  sessions.map((session) => {
                    const isSelectedSession = selectedSessionId === session.session_id;
                    const selectedSessionOrders = isSelectedSession && Array.isArray(selectedReport?.orders) ? selectedReport.orders : [];

                    return (
                      <Fragment key={session.session_id}>
                        <tr className={isSelectedSession ? "row-selected" : undefined}>
                          <td>
                            <span className={session.closed_at ? "status-pill muted" : "status-pill success"}>
                              {sessionStatusLabel(session)}
                            </span>
                          </td>
                          <td>{session.cashier_name ?? "Кассир"}</td>
                          <td>{formatDateTime(session.opened_at)}</td>
                          <td>{formatDateTime(session.closed_at)}</td>
                          <td>{formatMoney(session.opening_cash)}</td>
                          <td>{formatMoney(session.expected_cash)}</td>
                          <td>{formatOptionalMoney(session.closing_cash)}</td>
                          <td>{formatOptionalMoney(session.cash_difference)}</td>
                          <td>{formatMoney(session.total_sales)}</td>
                          <td>
                            <button
                              className="secondary-button"
                              type="button"
                              onClick={() => handleViewSessionSales(session)}
                              disabled={!session.session_id || (isSelectedSession && selectedReportLoading)}
                            >
                              <Eye size={16} aria-hidden="true" />
                              <span>{isSelectedSession ? "Харагдаж байна" : "Борлуулалт харах"}</span>
                            </button>
                          </td>
                        </tr>
                        {isSelectedSession ? (
                          <tr className="session-orders-row">
                            <td colSpan={10}>
                              <div className="session-orders-panel">
                                <div className="session-orders-heading">
                                  <strong>Энэ ээлжийн борлуулалт</strong>
                                  <span>{selectedReportLoading ? "Уншиж байна" : `${selectedSessionOrders.length} мөр`}</span>
                                </div>
                                <div className="table-wrap nested-table-wrap">
                                  <table className="data-table session-orders-table">
                                    <thead>
                                      <tr>
                                        <th>Баримт</th>
                                        <th>Захиалгын ID</th>
                                        <th>Төлбөр</th>
                                        <th>Нийт дүн</th>
                                        <th>Огноо</th>
                                        <th>Үйлдэл</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {renderOrderRows(
                                        selectedSessionOrders,
                                        selectedReportLoading
                                          ? "Энэ ээлжийн борлуулалт уншиж байна."
                                          : "Энэ ээлж дээр борлуулалт бүртгэгдээгүй байна.",
                                      )}
                                    </tbody>
                                  </table>
                                </div>
                              </div>
                            </td>
                          </tr>
                        ) : null}
                      </Fragment>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={10}>{historyLoading ? "Ээлжийн бүртгэл уншиж байна." : "Ээлжийн бүртгэл алга."}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="content-panel">
          <div className="panel-toolbar">
            <div>
              <p className="eyebrow">Үйл явдал</p>
              <h2>Нээх, хаах бүртгэл</h2>
            </div>
            <Clock3 size={22} aria-hidden="true" />
          </div>

          <div className="event-list">
            {events.length > 0 ? (
              events.slice(0, 12).map((event) => (
                <div className="event-row" key={event.event_id}>
                  <div>
                    <strong>{eventLabel(event)}</strong>
                    <span>{event.cashier_name ?? event.receipt_number ?? event.session_id.slice(-8)}</span>
                  </div>
                  <div>
                    <strong>{formatMoney(eventAmount(event))}</strong>
                    <span>{eventAmountLabel(event)}</span>
                    <span>{formatDateTime(event.created_at)}</span>
                  </div>
                </div>
              ))
            ) : (
              <div className="compact-empty">Үйл явдлын бүртгэл алга.</div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

export default function SalesPage() {
  return (
    <Suspense fallback={<div className="page-stack" data-testid="sales-page-loading">Ээлжийн тайлан уншиж байна.</div>}>
      <SalesPageContent />
    </Suspense>
  );
}
