"use client";

import {
  Banknote,
  Clock3,
  CreditCard,
  QrCode,
  ReceiptText,
  RefreshCcw,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { useKassSession } from "@/components/kass/AppShell";
import { formatMoney, paymentMethodLabel } from "@/lib/kass/client-api";

function formatDateTime(value?: string) {
  if (!value) return "Одоогоор байхгүй";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("mn-MN", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export default function DashboardPage() {
  const {
    cashierName,
    sessionId,
    report,
    reportLoading,
    reportError,
    refreshReport,
  } = useKassSession();
  const totalSales = Number(report?.total_sales ?? 0);
  const cashTotal = Number(report?.cash_total ?? 0);
  const cardTotal = Number(report?.card_total ?? 0);
  const qpayTotal = Number(report?.qpay_total ?? 0);
  const ordersCount = Number(report?.orders_count ?? 0);
  const openingCash = Number(report?.opening_cash ?? 0);
  const expectedCash = Number(report?.expected_cash ?? openingCash + cashTotal);
  const paymentsTotal = cashTotal + cardTotal + qpayTotal;
  const cashRatio = paymentsTotal > 0 ? Math.round((cashTotal / paymentsTotal) * 100) : 0;
  const cardRatio = paymentsTotal > 0 ? Math.round((cardTotal / paymentsTotal) * 100) : 0;
  const qpayRatio = paymentsTotal > 0 ? Math.max(0, 100 - cashRatio - cardRatio) : 0;
  const recentOrders = (report?.orders ?? []).slice(0, 5);

  const paymentCards = [
    { label: "Бэлэн", value: cashTotal, ratio: cashRatio, icon: Banknote, tone: "green" },
    { label: "Карт", value: cardTotal, ratio: cardRatio, icon: CreditCard, tone: "blue" },
    { label: "QPay", value: qpayTotal, ratio: qpayRatio, icon: QrCode, tone: "amber" },
  ];

  return (
    <div className="page-stack dashboard-page" data-testid="dashboard-page">
      <section className="dashboard-hero">
        <div className="dashboard-hero-main">
          <div className="dashboard-hero-copy">
            <p className="eyebrow">Одоогийн ээлж</p>
            <h2>{sessionId ? "Ээлжийн хяналт" : "Ээлж нээгдээгүй"}</h2>
            <p className="muted-text">
              {sessionId
                ? `${cashierName ?? "Кассир"} хэрэглэгчийн борлуулалт болон кассын үлдэгдлийг хянаж байна.`
                : "Касс дээр ээлж нээгдэх үед борлуулалтын тайлан энд шинэчлэгдэнэ."}
            </p>
          </div>

          <div className="hero-total">
            <span>Нийт борлуулалт</span>
            <strong>{formatMoney(totalSales)}</strong>
          </div>
        </div>

        <div className="dashboard-hero-actions">
          <span className={sessionId ? "status-pill success" : "status-pill muted"}>
            {sessionId ? "Нээлттэй" : "Ээлжгүй"}
          </span>
          <button className="secondary-button" type="button" onClick={refreshReport} disabled={!sessionId || reportLoading}>
            <RefreshCcw size={16} aria-hidden="true" />
            <span>{reportLoading ? "Шинэчилж байна" : "Шинэчлэх"}</span>
          </button>
        </div>

        <div className="dashboard-kpi-grid">
          <div className="kpi-tile strong">
            <span>Захиалга</span>
            <strong>{ordersCount}</strong>
          </div>
          <div className="kpi-tile">
            <span>Нээлтийн касс</span>
            <strong>{formatMoney(openingCash)}</strong>
          </div>
          <div className="kpi-tile">
            <span>Хүлээгдэж буй касс</span>
            <strong>{formatMoney(expectedCash)}</strong>
          </div>
          <div className="kpi-tile">
            <span>Session</span>
            <strong>{sessionId ? sessionId.slice(-8) : "Байхгүй"}</strong>
          </div>
        </div>

        {reportError ? <div className="inline-error">{reportError}</div> : null}
      </section>

      <section className="dashboard-layout">
        <div className="content-panel dashboard-main-panel">
          <div className="panel-toolbar">
            <div>
              <p className="eyebrow">Төлбөрийн задаргаа</p>
              <h2>Сувгаар нь</h2>
            </div>
            <span className="soft-pill">{formatMoney(paymentsTotal)}</span>
          </div>

          <div className="payment-mix-bar" aria-label="Төлбөрийн хувь">
            <span className="mix-cash" style={{ width: `${cashRatio}%` }} />
            <span className="mix-card" style={{ width: `${cardRatio}%` }} />
            <span className="mix-qpay" style={{ width: `${qpayRatio}%` }} />
          </div>

          <div className="dashboard-payment-grid">
            {paymentCards.map((card) => {
              const Icon = card.icon;
              return (
                <div className={`payment-stat ${card.tone}`} key={card.label}>
                  <div className="dashboard-icon">
                    <Icon size={19} aria-hidden="true" />
                  </div>
                  <div>
                    <span>{card.label}</span>
                    <strong>{formatMoney(card.value)}</strong>
                    <small>{card.ratio}%</small>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="content-panel cash-check-panel">
          <div className="panel-toolbar">
            <div>
              <p className="eyebrow">Кассын хяналт</p>
              <h2>Мөнгөний байрлал</h2>
            </div>
            <Wallet size={22} aria-hidden="true" />
          </div>

          <div className="cash-check-list">
            <div>
              <span>Нээлтийн бэлэн</span>
              <strong>{formatMoney(openingCash)}</strong>
            </div>
            <div>
              <span>Бэлэн борлуулалт</span>
              <strong>{formatMoney(cashTotal)}</strong>
            </div>
            <div className="total">
              <span>Хүлээгдэж буй касс</span>
              <strong>{formatMoney(expectedCash)}</strong>
            </div>
          </div>
        </div>
      </section>

      <section className="dashboard-layout lower">
        <div className="content-panel">
          <div className="panel-toolbar">
            <div>
              <p className="eyebrow">Сүүлийн борлуулалт</p>
              <h2>Захиалгууд</h2>
            </div>
            <ReceiptText size={22} aria-hidden="true" />
          </div>

          {recentOrders.length > 0 ? (
            <div className="recent-orders-list">
              {recentOrders.map((order, index) => (
                <div className="recent-order" key={`${order.receipt_number ?? order.order_id ?? index}`}>
                  <div>
                    <strong>{order.receipt_number ?? `#${order.order_id ?? index + 1}`}</strong>
                    <span>{paymentMethodLabel(order.payment_method)}</span>
                  </div>
                  <div>
                    <strong>{formatMoney(order.total)}</strong>
                    <span>{formatDateTime(order.created_at ?? order.date)}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="compact-empty">
              <Clock3 size={22} aria-hidden="true" />
              <span>Энэ ээлж дээр борлуулалт бүртгэгдээгүй байна.</span>
            </div>
          )}
        </div>

        <div className="content-panel insight-panel">
          <div className="panel-toolbar">
            <div>
              <p className="eyebrow">Анхаарах зүйл</p>
              <h2>Шуурхай дүгнэлт</h2>
            </div>
            <TrendingUp size={22} aria-hidden="true" />
          </div>

          <div className="insight-list">
            <div>
              <span>Дундаж чек</span>
              <strong>{formatMoney(ordersCount > 0 ? totalSales / ordersCount : 0)}</strong>
            </div>
            <div>
              <span>Дижитал төлбөр</span>
              <strong>{formatMoney(cardTotal + qpayTotal)}</strong>
            </div>
            <div>
              <span>Ээлжийн төлөв</span>
              <strong>{sessionId ? "Ажиллаж байна" : "Эхлээгүй"}</strong>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
