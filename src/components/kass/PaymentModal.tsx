"use client";

import {
  CreditCard,
  Loader2,
  QrCode,
  ReceiptText,
  RefreshCw,
  Wallet,
  X,
  type LucideIcon,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  checkQpayPayment,
  createKassOrder,
  createQpayInvoice,
  formatMoney,
  getReadableError,
  paymentMethodLabel,
} from "@/lib/kass/client-api";
import type {
  CartItem,
  PaymentMethod,
  QpayInvoiceResponse,
  ReceiptData,
} from "@/lib/kass/client-types";

interface PaymentModalProps {
  open: boolean;
  sessionId: string | null;
  lines: CartItem[];
  onClose: () => void;
  onPaymentSuccess: (receipt: ReceiptData) => void;
}

const paymentOptions: Array<{
  method: PaymentMethod;
  label: string;
  icon: LucideIcon;
}> = [
  { method: "qpay", label: "QPay", icon: QrCode },
  { method: "card", label: "Карт", icon: CreditCard },
  { method: "cash", label: "Бэлэн мөнгө", icon: Wallet },
];

export function PaymentModal({ open, sessionId, lines, onClose, onPaymentSuccess }: PaymentModalProps) {
  const [method, setMethod] = useState<PaymentMethod>("qpay");
  const [cashReceived, setCashReceived] = useState("");
  const [mockSuccess, setMockSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [qpayInvoice, setQpayInvoice] = useState<QpayInvoiceResponse | null>(null);
  const [qpayLoading, setQpayLoading] = useState(false);
  const [qpayChecking, setQpayChecking] = useState(false);
  const [qpayPaid, setQpayPaid] = useState(false);
  const [qpayNotice, setQpayNotice] = useState<string | null>(null);
  const qpayRequestKeyRef = useRef<string | null>(null);

  const orderLines = useMemo(
    () =>
      lines.map((item) => ({
        product_id: item.product_id,
        quantity: item.quantity,
        price: item.price,
      })),
    [lines],
  );
  const total = useMemo(() => lines.reduce((sum, item) => sum + item.price * item.quantity, 0), [lines]);
  const qpayRequestKey = useMemo(
    () => `${sessionId ?? "no-session"}:${orderLines.map((line) => `${line.product_id}:${line.quantity}:${line.price}`).join("|")}`,
    [orderLines, sessionId],
  );
  const received = Number(cashReceived || 0);
  const change = Math.max(0, received - total);
  const cashReady = method !== "cash" || received >= total;

  const generateQpayInvoice = useCallback(
    async (force = false) => {
      if (!sessionId) {
        setError("Ээлж нээгдээгүй байна.");
        return;
      }

      if (orderLines.length === 0 || total <= 0) {
      setError("QPay QR үүсгэхийн өмнө сагсанд бүтээгдэхүүн нэмнэ үү.");
        return;
      }

      if (!force && qpayRequestKeyRef.current === qpayRequestKey) return;

      qpayRequestKeyRef.current = qpayRequestKey;
      setQpayLoading(true);
      setQpayNotice(null);
      setError(null);
      setQpayPaid(false);

      try {
        const invoice = await createQpayInvoice({
          session_id: sessionId,
          lines: orderLines,
        });

        setQpayInvoice(invoice);
        setQpayPaid(invoice.paid === true || invoice.state === "paid");
        setQpayNotice(invoice.paid ? "QPay төлбөр төлөгдсөн байна." : "QR кодыг уншуулж төлбөрөө төлнө үү.");
      } catch (invoiceError) {
        qpayRequestKeyRef.current = null;
        setQpayInvoice(null);
        setError(getReadableError(invoiceError));
      } finally {
        setQpayLoading(false);
      }
    },
    [orderLines, qpayRequestKey, sessionId, total],
  );

  useEffect(() => {
    if (!open) return;
    setMethod("qpay");
    setCashReceived("");
    setMockSuccess(false);
    setSubmitting(false);
    setError(null);
    setQpayInvoice(null);
    setQpayLoading(false);
    setQpayChecking(false);
    setQpayPaid(false);
    setQpayNotice(null);
    qpayRequestKeyRef.current = null;
  }, [open]);

  useEffect(() => {
    if (!open || method !== "qpay" || qpayInvoice) return;
    void generateQpayInvoice();
  }, [generateQpayInvoice, method, open, qpayInvoice]);

  if (!open) return null;

  async function submitOrder(nextMethod: PaymentMethod) {
    if (!sessionId) {
      setError("Ээлж нээгдээгүй байна.");
      return;
    }

    if (nextMethod === "qpay" && (!qpayInvoice || !qpayPaid)) {
      setError("QPay төлбөр төлөгдсөн эсэхийг эхлээд шалгана уу.");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const order = await createKassOrder({
        session_id: sessionId,
        payment_method: nextMethod,
        lines: orderLines,
        qpay_transaction_id: nextMethod === "qpay" ? qpayInvoice?.transaction_id ?? null : null,
      });

      onPaymentSuccess({
        order,
        lines,
        total,
        paymentMethod: nextMethod,
        paidAt: new Date().toISOString(),
      });
    } catch (orderError) {
      setError(getReadableError(orderError));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleQpayCheck() {
    if (!qpayInvoice) {
      await generateQpayInvoice(true);
      return;
    }

    setQpayChecking(true);
    setQpayNotice(null);
    setError(null);

    try {
      const status = await checkQpayPayment({ transaction_id: qpayInvoice.transaction_id });
      setQpayInvoice((current) =>
        current
          ? {
              ...current,
              state: status.state,
              paid: status.paid,
              error_message: status.error_message,
            }
          : current,
      );
      setQpayPaid(status.paid);
      setQpayNotice(status.paid ? "QPay төлбөр амжилттай баталгаажлаа." : "Төлбөр хараахан орж ирээгүй байна.");
    } catch (checkError) {
      setError(getReadableError(checkError));
    } finally {
      setQpayChecking(false);
    }
  }

  const qpayStateLabel = qpayInvoice?.state
    ? qpayInvoice.state === "paid"
      ? "Төлөгдсөн"
      : qpayInvoice.state === "pending"
        ? "Хүлээгдэж байна"
        : qpayInvoice.state
    : null;

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="payment-title">
      <div className="modal-card payment-modal">
        <button className="icon-button modal-close" type="button" onClick={onClose} aria-label="Хаах">
          <X size={18} aria-hidden="true" />
        </button>

        <div className="payment-header">
          <div>
            <p className="eyebrow">Тооцоо</p>
            <h2 id="payment-title">Төлбөр төлөх</h2>
          </div>
          <strong>{formatMoney(total)}</strong>
        </div>

        <div className="payment-tabs" role="tablist" aria-label="Төлбөрийн төрөл">
          {paymentOptions.map((option) => {
            const Icon = option.icon;
            const active = method === option.method;

            return (
              <button
                key={option.method}
                className={active ? "payment-tab active" : "payment-tab"}
                type="button"
                onClick={() => {
                  setMethod(option.method);
                  setMockSuccess(false);
                  setError(null);
                  setQpayNotice(null);
                }}
              >
                <Icon size={18} aria-hidden="true" />
                <span>{option.label}</span>
              </button>
            );
          })}
        </div>

        <div className="payment-body">
          {method === "qpay" ? (
            <div className="payment-method-panel">
              <div className="qr-placeholder">
                {qpayLoading ? (
                  <Loader2 className="spin-icon" size={44} aria-hidden="true" />
                ) : qpayInvoice?.qr_image ? (
                  <img
                    className="qpay-qr-image"
                    src={`data:image/png;base64,${qpayInvoice.qr_image}`}
                    alt="QPay QR код"
                  />
                ) : (
                  <QrCode size={84} aria-hidden="true" />
                )}
              </div>
              <div className="qpay-payment-content">
                <h3>QPay төлбөр</h3>
                <p className="muted-text">Нийт дүн: {formatMoney(total)}</p>

                <div className="qpay-status-grid">
                  <span>Нэхэмжлэл</span>
                  <strong>{qpayInvoice?.qpay_invoice_id ?? "Үүсээгүй"}</strong>
                  <span>Төлөв</span>
                  <strong>{qpayStateLabel ?? "Хүлээгдэж байна"}</strong>
                </div>

                {qpayInvoice?.qpay_short_url ? (
                  <a className="qpay-link" href={qpayInvoice.qpay_short_url} target="_blank" rel="noreferrer">
                    QPay холбоос нээх
                  </a>
                ) : null}

                {qpayPaid ? <div className="success-box">QPay төлбөр амжилттай баталгаажлаа.</div> : null}
                {qpayNotice && !qpayPaid ? <div className="inline-warning">{qpayNotice}</div> : null}

                <div className="payment-action-row">
                  <button
                    className="secondary-button"
                    type="button"
                    onClick={() => void generateQpayInvoice(true)}
                    disabled={qpayLoading || qpayChecking || submitting}
                  >
                    {qpayLoading ? <Loader2 className="spin-icon" size={17} aria-hidden="true" /> : <RefreshCw size={17} aria-hidden="true" />}
                    <span>{qpayInvoice ? "QR дахин үүсгэх" : "QR үүсгэх"}</span>
                  </button>
                  <button
                    className="secondary-button"
                    type="button"
                    onClick={() => void handleQpayCheck()}
                    disabled={!qpayInvoice || qpayLoading || qpayChecking || submitting}
                  >
                    {qpayChecking ? <Loader2 className="spin-icon" size={17} aria-hidden="true" /> : <QrCode size={17} aria-hidden="true" />}
                    <span>{qpayChecking ? "Шалгаж байна" : "Төлбөр шалгах"}</span>
                  </button>
                  <button
                    className="primary-button"
                    type="button"
                    onClick={() => void submitOrder("qpay")}
                    disabled={!qpayPaid || submitting}
                  >
                    <ReceiptText size={17} aria-hidden="true" />
                    <span>{submitting ? "Илгээж байна" : "Захиалга үүсгэх"}</span>
                  </button>
                </div>
              </div>
            </div>
          ) : null}

          {method === "card" ? (
            <div className="payment-method-panel">
              <div className="terminal-placeholder">
                <CreditCard size={58} aria-hidden="true" />
                <span>Карт уншуулна уу</span>
              </div>
              <div>
                <h3>Картын төлбөр</h3>
                <p className="muted-text">Нийт дүн: {formatMoney(total)}</p>
                {mockSuccess ? <div className="success-box">Картын төлбөр амжилттай.</div> : null}
                <div className="payment-action-row">
                  <button
                    className="secondary-button"
                    type="button"
                    onClick={() => setMockSuccess(true)}
                    disabled={mockSuccess || submitting}
                  >
                    <CreditCard size={17} aria-hidden="true" />
                    <span>Амжилттай болгох</span>
                  </button>
                  <button
                    className="primary-button"
                    type="button"
                    onClick={() => void submitOrder("card")}
                    disabled={!mockSuccess || submitting}
                  >
                    <ReceiptText size={17} aria-hidden="true" />
                    <span>{submitting ? "Илгээж байна" : "Захиалга үүсгэх"}</span>
                  </button>
                </div>
              </div>
            </div>
          ) : null}

          {method === "cash" ? (
            <div className="payment-method-panel">
              <div className="cash-stack">
                <Wallet size={54} aria-hidden="true" />
              </div>
              <div>
                <h3>Бэлэн мөнгө</h3>
                <p className="muted-text">Төлөх дүн: {formatMoney(total)}</p>
                <label className="field">
                  <span>Хүлээн авсан мөнгө</span>
                  <input
                    type="number"
                    min="0"
                    inputMode="numeric"
                    value={cashReceived}
                    onChange={(event) => setCashReceived(event.target.value)}
                    placeholder="0"
                  />
                </label>
                <div className="change-box">
                  <span>Хариулт</span>
                  <strong>{formatMoney(change)}</strong>
                </div>
                <button
                  className="primary-button full-width"
                  type="button"
                  onClick={() => void submitOrder("cash")}
                  disabled={!cashReady || submitting}
                >
                  <ReceiptText size={17} aria-hidden="true" />
                  <span>{submitting ? "Илгээж байна" : `${paymentMethodLabel("cash")} батлах`}</span>
                </button>
              </div>
            </div>
          ) : null}
        </div>

        {error ? <div className="form-error">{error}</div> : null}
      </div>
    </div>
  );
}
