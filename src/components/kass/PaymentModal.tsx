"use client";

import {
  CreditCard,
  HandCoins,
  Landmark,
  Loader2,
  QrCode,
  ReceiptText,
  RefreshCw,
  Split,
  Ticket,
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
  getPartners,
  getReadableError,
  paymentMethodLabel,
  validateLoyaltyCoupon,
} from "@/lib/kass/client-api";
import type {
  CartItem,
  KassPartner,
  OrderPaymentMethod,
  PaymentPart,
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
  method: PaymentMethod | "split";
  label: string;
  icon: LucideIcon;
}> = [
  { method: "qpay", label: "QPay", icon: QrCode },
  { method: "coupon", label: "Купон", icon: Ticket },
  { method: "card", label: "Карт", icon: CreditCard },
  { method: "bank", label: "Дансаар", icon: Landmark },
  { method: "credit", label: "Зээлээр", icon: HandCoins },
  { method: "cash", label: "Бэлэн мөнгө", icon: Wallet },
  { method: "split", label: "Хуваах", icon: Split },
];

type SelectedPaymentMethod = PaymentMethod | "split" | null;

export function PaymentModal({ open, sessionId, lines, onClose, onPaymentSuccess }: PaymentModalProps) {
  const [method, setMethod] = useState<SelectedPaymentMethod>(null);
  const [cashReceived, setCashReceived] = useState("");
  const [splitCashAmount, setSplitCashAmount] = useState("");
  const [splitCardAmount, setSplitCardAmount] = useState("");
  const [splitBankAmount, setSplitBankAmount] = useState("");
  const [splitCreditAmount, setSplitCreditAmount] = useState("");
  const [splitQpayAmount, setSplitQpayAmount] = useState("");
  const [splitCardConfirmed, setSplitCardConfirmed] = useState(false);
  const [splitBankConfirmed, setSplitBankConfirmed] = useState(false);
  const [mockSuccess, setMockSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [qpayInvoice, setQpayInvoice] = useState<QpayInvoiceResponse | null>(null);
  const [qpayLoading, setQpayLoading] = useState(false);
  const [qpayChecking, setQpayChecking] = useState(false);
  const [qpayPaid, setQpayPaid] = useState(false);
  const [qpayNotice, setQpayNotice] = useState<string | null>(null);
  const [couponQrToken, setCouponQrToken] = useState("");
  const [couponPin, setCouponPin] = useState("");
  const [couponChecking, setCouponChecking] = useState(false);
  const [couponValidated, setCouponValidated] = useState<{
    code: string;
    partner_name: string;
    reward_product_name: string;
  } | null>(null);
  const [partners, setPartners] = useState<KassPartner[]>([]);
  const [partnersLoading, setPartnersLoading] = useState(false);
  const [selectedCreditPartnerId, setSelectedCreditPartnerId] = useState("");
  const qpayRequestKeyRef = useRef<string | null>(null);
  const qpayAutoFinalizingRef = useRef(false);

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
  const qpayRequestKeyBase = useMemo(
    () => `${sessionId ?? "no-session"}:${orderLines.map((line) => `${line.product_id}:${line.quantity}:${line.price}`).join("|")}`,
    [orderLines, sessionId],
  );
  const received = Number(cashReceived || 0);
  const change = Math.max(0, received - total);
  const cashReady = method !== "cash" || received >= total;
  const splitCash = Number(splitCashAmount || 0);
  const splitCard = Number(splitCardAmount || 0);
  const splitBank = Number(splitBankAmount || 0);
  const splitCredit = Number(splitCreditAmount || 0);
  const splitQpay = Number(splitQpayAmount || 0);
  const splitTotal = splitCash + splitCard + splitBank + splitCredit + splitQpay;
  const splitRemaining = total - splitTotal;
  const splitMatchesTotal = Math.abs(splitRemaining) <= 0.01;
  const splitAmountsValid = [splitCash, splitCard, splitBank, splitCredit, splitQpay].every(
    (amount) => Number.isFinite(amount) && amount >= 0,
  );
  const splitPayments = useMemo(
    () =>
      [
        { method: "cash", amount: splitCash },
        { method: "card", amount: splitCard },
        { method: "bank", amount: splitBank },
        { method: "credit", amount: splitCredit },
        { method: "qpay", amount: splitQpay },
      ].filter((payment): payment is PaymentPart => payment.amount > 0 && Number.isFinite(payment.amount)),
    [splitBank, splitCard, splitCash, splitCredit, splitQpay],
  );
  const selectedCreditPartner = useMemo(
    () => partners.find((partner) => String(partner.id) === selectedCreditPartnerId) ?? null,
    [partners, selectedCreditPartnerId],
  );
  const splitReady =
    method !== "split" ||
    (splitAmountsValid &&
      splitMatchesTotal &&
      splitPayments.length > 0 &&
      (splitCredit <= 0 || Boolean(selectedCreditPartnerId)) &&
      (splitCard <= 0 || splitCardConfirmed) &&
      (splitBank <= 0 || splitBankConfirmed) &&
      (splitQpay <= 0 || (qpayInvoice?.amount === splitQpay && qpayPaid)));

  const generateQpayInvoice = useCallback(
    async (force = false, amount = total) => {
      if (!sessionId) {
        setError("Ээлж нээгдээгүй байна.");
        return;
      }

      if (orderLines.length === 0 || total <= 0) {
        setError("QPay QR үүсгэхийн өмнө сагсанд бүтээгдэхүүн нэмнэ үү.");
        return;
      }

      if (!Number.isFinite(amount) || amount <= 0) {
        setError("QPay төлбөрийн дүн 0-ээс их байх ёстой.");
        return;
      }

      const qpayRequestKey = `${qpayRequestKeyBase}:${amount}`;
      if (!force && qpayRequestKeyRef.current === qpayRequestKey) return;

      qpayRequestKeyRef.current = qpayRequestKey;
      qpayAutoFinalizingRef.current = false;
      setQpayLoading(true);
      setQpayNotice(null);
      setError(null);
      setQpayPaid(false);

      try {
        const invoice = await createQpayInvoice({
          session_id: sessionId,
          lines: orderLines,
          amount,
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
    [orderLines, qpayRequestKeyBase, sessionId, total],
  );

  const loadPartners = useCallback(async () => {
    setPartnersLoading(true);

    try {
      const response = await getPartners();
      setPartners(response.partners ?? []);
    } catch (partnerError) {
      setError(getReadableError(partnerError));
      setPartners([]);
    } finally {
      setPartnersLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    setMethod(null);
    setCashReceived("");
    setSplitCashAmount("");
    setSplitCardAmount("");
    setSplitBankAmount("");
    setSplitCreditAmount("");
    setSplitQpayAmount("");
    setSplitCardConfirmed(false);
    setSplitBankConfirmed(false);
    setMockSuccess(false);
    setSubmitting(false);
    setError(null);
    setQpayInvoice(null);
    setQpayLoading(false);
    setQpayChecking(false);
    setQpayPaid(false);
    setQpayNotice(null);
    setCouponQrToken("");
    setCouponPin("");
    setCouponChecking(false);
    setCouponValidated(null);
    setSelectedCreditPartnerId("");
    qpayRequestKeyRef.current = null;
    qpayAutoFinalizingRef.current = false;
    void loadPartners();
  }, [loadPartners, open]);

  useEffect(() => {
    if (!open || method !== "qpay") return;
    if (qpayInvoice?.amount === total) return;
    void generateQpayInvoice(false, total);
  }, [generateQpayInvoice, method, open, qpayInvoice?.amount, total]);

  useEffect(() => {
    if (!open || method !== "split") return;
    setQpayInvoice(null);
    setQpayPaid(false);
    setQpayNotice(null);
    qpayRequestKeyRef.current = null;
    qpayAutoFinalizingRef.current = false;
  }, [method, open, splitQpayAmount]);

  useEffect(() => {
    if (
      !open ||
      method !== "qpay" ||
      !qpayInvoice ||
      qpayInvoice.amount !== total ||
      qpayPaid ||
      qpayLoading ||
      submitting
    ) {
      return;
    }

    let cancelled = false;
    let checking = false;

    async function pollQpayPayment() {
      if (!qpayInvoice || checking || qpayAutoFinalizingRef.current) return;

      checking = true;
      setQpayChecking(true);
      setError(null);

      try {
        const status = await checkQpayPayment({ transaction_id: qpayInvoice.transaction_id });
        if (cancelled) return;

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

        if (status.paid) {
          qpayAutoFinalizingRef.current = true;
          await submitOrder("qpay", [{ method: "qpay", amount: total }], { qpayPaid: true, autoPrint: true });
          return;
        }

        setQpayNotice("QPay төлбөр хүлээгдэж байна. Төлөгдвөл баримт автоматаар гарна.");
      } catch (checkError) {
        if (!cancelled) setError(getReadableError(checkError));
      } finally {
        checking = false;
        if (!cancelled) setQpayChecking(false);
      }
    }

    const firstCheck = window.setTimeout(() => void pollQpayPayment(), 1500);
    const interval = window.setInterval(() => void pollQpayPayment(), 4000);

    return () => {
      cancelled = true;
      window.clearTimeout(firstCheck);
      window.clearInterval(interval);
    };
  }, [method, open, qpayInvoice, qpayLoading, qpayPaid, submitting, total]);

  useEffect(() => {
    if (
      !open ||
      method !== "qpay" ||
      !qpayInvoice ||
      qpayInvoice.amount !== total ||
      !qpayPaid ||
      submitting ||
      qpayAutoFinalizingRef.current
    ) {
      return;
    }

    qpayAutoFinalizingRef.current = true;
    void submitOrder("qpay", [{ method: "qpay", amount: total }], { qpayPaid: true, autoPrint: true });
  }, [method, open, qpayInvoice, qpayPaid, submitting, total]);

  if (!open) return null;

  async function submitOrder(
    nextMethod: OrderPaymentMethod,
    payments: PaymentPart[],
    options?: { couponQrToken?: string; couponPin?: string; qpayPaid?: boolean; autoPrint?: boolean },
  ) {
    if (!sessionId) {
      setError("Ээлж нээгдээгүй байна.");
      return;
    }

    const qpayPayment = payments.find((payment) => payment.method === "qpay");
    const creditPayment = payments.find((payment) => payment.method === "credit");
    if (creditPayment && !selectedCreditPartner) {
      setError("Зээлээр бүртгэх харилцагч сонгоно уу.");
      return;
    }
    const creditPartnerId = creditPayment ? selectedCreditPartner?.id ?? null : null;
    const creditPartnerName = creditPayment ? selectedCreditPartner?.name ?? null : null;

    const isQpayPaid = options?.qpayPaid ?? qpayPaid;
    if (qpayPayment && (!qpayInvoice || !isQpayPaid || qpayInvoice.amount !== qpayPayment.amount)) {
      setError("QPay төлбөр төлөгдсөн эсэхийг эхлээд шалгана уу.");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const order = await createKassOrder({
        session_id: sessionId,
        payment_method: nextMethod,
        payments,
        partner_id: creditPartnerId,
        partner_name: creditPartnerName,
        lines: orderLines,
        qpay_transaction_id: qpayPayment ? qpayInvoice?.transaction_id ?? null : null,
        coupon_qr_token: options?.couponQrToken ?? null,
        coupon_pin: options?.couponPin ?? null,
      });

      onPaymentSuccess({
        order,
        lines,
        total,
        paymentMethod: nextMethod,
        payments,
        paidAt: new Date().toISOString(),
        autoPrint: options?.autoPrint ?? false,
      });
    } catch (orderError) {
      if (options?.autoPrint) {
        qpayAutoFinalizingRef.current = false;
      }
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
      if (status.paid && method === "qpay") {
        await submitOrder("qpay", [{ method: "qpay", amount: total }], { qpayPaid: true, autoPrint: true });
      }
      setQpayNotice(status.paid ? "QPay төлбөр амжилттай баталгаажлаа." : "Төлбөр хараахан орж ирээгүй байна.");
    } catch (checkError) {
      setError(getReadableError(checkError));
    } finally {
      setQpayChecking(false);
    }
  }

  async function handleCouponCheck() {
    setCouponChecking(true);
    setCouponValidated(null);
    setError(null);

    try {
      const coupon = await validateLoyaltyCoupon({
        qr_token: couponQrToken.trim(),
        pin: couponPin,
      });
      setCouponValidated({
        code: coupon.code,
        partner_name: coupon.partner_name,
        reward_product_name: coupon.reward_product_name,
      });
    } catch (couponError) {
      setError(getReadableError(couponError));
    } finally {
      setCouponChecking(false);
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
                  setSplitCardConfirmed(false);
                  setSplitBankConfirmed(false);
                  setError(null);
                  setQpayNotice(null);
                  setCouponValidated(null);
                }}
              >
                <Icon size={18} aria-hidden="true" />
                <span>{option.label}</span>
              </button>
            );
          })}
        </div>

        <div className="payment-body">
          {method === null ? (
            <div className="payment-method-panel">
              <div className="terminal-placeholder">
                <ReceiptText size={58} aria-hidden="true" />
                <span>Төлбөрийн төрлөө сонгоно уу</span>
              </div>
              <div>
                <h3>Төлбөрийн сонголт</h3>
                <p className="muted-text">Нийт дүн: {formatMoney(total)}</p>
              </div>
            </div>
          ) : null}

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
                    disabled
                  >
                    {qpayChecking ? <Loader2 className="spin-icon" size={17} aria-hidden="true" /> : <QrCode size={17} aria-hidden="true" />}
                    <span>{qpayChecking || submitting ? "Автоматаар шалгаж байна" : "Төлбөр хүлээж байна"}</span>
                  </button>
                </div>
              </div>
            </div>
          ) : null}

          {method === "coupon" ? (
            <div className="payment-method-panel">
              <div className="terminal-placeholder">
                <Ticket size={58} aria-hidden="true" />
                <span>Купоны QR уншуулна уу</span>
              </div>
              <div>
                <h3>Cozy coupon</h3>
                <p className="muted-text">Купоноор төлөх дүн: {formatMoney(total)}</p>
                <label className="field">
                  <span>QR token</span>
                  <input
                    value={couponQrToken}
                    onChange={(event) => {
                      setCouponQrToken(event.target.value);
                      setCouponValidated(null);
                    }}
                    placeholder="COZY:..."
                    autoComplete="off"
                  />
                </label>
                <label className="field">
                  <span>Гүйлгээний нууц үг</span>
                  <input
                    value={couponPin}
                    onChange={(event) => {
                      setCouponPin(event.target.value);
                      setCouponValidated(null);
                    }}
                    placeholder="PIN"
                    type="password"
                    autoComplete="off"
                  />
                </label>
                {couponValidated ? (
                  <div className="success-box">
                    {couponValidated.code} купон баталгаажлаа. Хэрэглэгч: {couponValidated.partner_name}
                  </div>
                ) : null}
                <div className="payment-action-row">
                  <button
                    className="secondary-button"
                    type="button"
                    onClick={() => void handleCouponCheck()}
                    disabled={!couponQrToken.trim() || !couponPin || couponChecking || submitting}
                  >
                    {couponChecking ? <Loader2 className="spin-icon" size={17} aria-hidden="true" /> : <QrCode size={17} aria-hidden="true" />}
                    <span>{couponChecking ? "Шалгаж байна" : "Купон шалгах"}</span>
                  </button>
                  <button
                    className="primary-button"
                    type="button"
                    onClick={() =>
                      void submitOrder("coupon", [{ method: "coupon", amount: total }], {
                        couponQrToken: couponQrToken.trim(),
                        couponPin,
                      })
                    }
                    disabled={!couponValidated || submitting}
                  >
                    <ReceiptText size={17} aria-hidden="true" />
                    <span>{submitting ? "Илгээж байна" : "Купоноор төлөх"}</span>
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
                    onClick={() => void submitOrder("card", [{ method: "card", amount: total }])}
                    disabled={!mockSuccess || submitting}
                  >
                    <ReceiptText size={17} aria-hidden="true" />
                    <span>{submitting ? "Илгээж байна" : "Захиалга үүсгэх"}</span>
                  </button>
                </div>
              </div>
            </div>
          ) : null}

          {method === "bank" ? (
            <div className="payment-method-panel">
              <div className="terminal-placeholder">
                <Landmark size={58} aria-hidden="true" />
                <span>Дансны шилжүүлэг шалгана уу</span>
              </div>
              <div>
                <h3>Дансаар төлбөр</h3>
                <p className="muted-text">Нийт дүн: {formatMoney(total)}</p>
                {mockSuccess ? <div className="success-box">Дансаар төлбөр амжилттай.</div> : null}
                <div className="payment-action-row">
                  <button
                    className="secondary-button"
                    type="button"
                    onClick={() => setMockSuccess(true)}
                    disabled={mockSuccess || submitting}
                  >
                    <Landmark size={17} aria-hidden="true" />
                    <span>Шилжүүлэг орсон</span>
                  </button>
                  <button
                    className="primary-button"
                    type="button"
                    onClick={() => void submitOrder("bank", [{ method: "bank", amount: total }])}
                    disabled={!mockSuccess || submitting}
                  >
                    <ReceiptText size={17} aria-hidden="true" />
                    <span>{submitting ? "Илгээж байна" : "Захиалга үүсгэх"}</span>
                  </button>
                </div>
              </div>
            </div>
          ) : null}

          {method === "credit" ? (
            <div className="payment-method-panel">
              <div className="terminal-placeholder">
                <HandCoins size={58} aria-hidden="true" />
                <span>Харилцагч дээр зээлээр бүртгэнэ</span>
              </div>
              <div>
                <h3>Зээлээр</h3>
                <p className="muted-text">Нийт дүн: {formatMoney(total)}</p>
                <div className="inline-warning">Энэ дүн кассын бэлэн үлдэгдэлд нэмэгдэхгүй.</div>
                <label className="field credit-customer-field">
                  <span>Харилцагч</span>
                  <select
                    value={selectedCreditPartnerId}
                    onChange={(event) => setSelectedCreditPartnerId(event.target.value)}
                    disabled={partnersLoading}
                  >
                    <option value="">{partnersLoading ? "Харилцагч уншиж байна" : "Харилцагч сонгох"}</option>
                    {partners.map((partner) => (
                      <option key={partner.id} value={partner.id}>
                        {partner.name}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  className="primary-button full-width"
                  type="button"
                  onClick={() => void submitOrder("credit", [{ method: "credit", amount: total }])}
                  disabled={!selectedCreditPartnerId || submitting}
                >
                  <ReceiptText size={17} aria-hidden="true" />
                  <span>{submitting ? "Илгээж байна" : "Зээлээр бүртгэх"}</span>
                </button>
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
                  onClick={() => void submitOrder("cash", [{ method: "cash", amount: total }])}
                  disabled={!cashReady || submitting}
                >
                  <ReceiptText size={17} aria-hidden="true" />
                  <span>{submitting ? "Илгээж байна" : `${paymentMethodLabel("cash")} батлах`}</span>
                </button>
              </div>
            </div>
          ) : null}

          {method === "split" ? (
            <div className="split-payment-panel">
              <div className="split-payment-grid">
                <label className="split-payment-row">
                  <span className="split-payment-label">
                    <Wallet size={18} aria-hidden="true" />
                    Бэлэн мөнгө
                  </span>
                  <input
                    type="number"
                    min="0"
                    inputMode="numeric"
                    value={splitCashAmount}
                    onChange={(event) => setSplitCashAmount(event.target.value)}
                    placeholder="0"
                  />
                  <button
                    className="secondary-button"
                    type="button"
                    onClick={() => setSplitCashAmount(String(Math.max(0, splitRemaining + splitCash)))}
                  >
                    Үлдэгдэл
                  </button>
                </label>

                <label className="split-payment-row">
                  <span className="split-payment-label">
                    <CreditCard size={18} aria-hidden="true" />
                    Карт
                  </span>
                  <input
                    type="number"
                    min="0"
                    inputMode="numeric"
                    value={splitCardAmount}
                    onChange={(event) => {
                      setSplitCardAmount(event.target.value);
                      setSplitCardConfirmed(false);
                    }}
                    placeholder="0"
                  />
                  <button
                    className="secondary-button"
                    type="button"
                    onClick={() => {
                      setSplitCardAmount(String(Math.max(0, splitRemaining + splitCard)));
                      setSplitCardConfirmed(false);
                    }}
                  >
                    Үлдэгдэл
                  </button>
                </label>

                <label className="split-payment-row">
                  <span className="split-payment-label">
                    <Landmark size={18} aria-hidden="true" />
                    Дансаар
                  </span>
                  <input
                    type="number"
                    min="0"
                    inputMode="numeric"
                    value={splitBankAmount}
                    onChange={(event) => {
                      setSplitBankAmount(event.target.value);
                      setSplitBankConfirmed(false);
                    }}
                    placeholder="0"
                  />
                  <button
                    className="secondary-button"
                    type="button"
                    onClick={() => {
                      setSplitBankAmount(String(Math.max(0, splitRemaining + splitBank)));
                      setSplitBankConfirmed(false);
                    }}
                  >
                    Үлдэгдэл
                  </button>
                </label>

                <label className="split-payment-row">
                  <span className="split-payment-label">
                    <HandCoins size={18} aria-hidden="true" />
                    Зээлээр
                  </span>
                  <input
                    type="number"
                    min="0"
                    inputMode="numeric"
                    value={splitCreditAmount}
                    onChange={(event) => setSplitCreditAmount(event.target.value)}
                    placeholder="0"
                  />
                  <button
                    className="secondary-button"
                    type="button"
                    onClick={() => setSplitCreditAmount(String(Math.max(0, splitRemaining + splitCredit)))}
                  >
                    Үлдэгдэл
                  </button>
                </label>

                <label className="split-payment-row">
                  <span className="split-payment-label">
                    <QrCode size={18} aria-hidden="true" />
                    QPay
                  </span>
                  <input
                    type="number"
                    min="0"
                    inputMode="numeric"
                    value={splitQpayAmount}
                    onChange={(event) => setSplitQpayAmount(event.target.value)}
                    placeholder="0"
                  />
                  <button
                    className="secondary-button"
                    type="button"
                    onClick={() => setSplitQpayAmount(String(Math.max(0, splitRemaining + splitQpay)))}
                  >
                    Үлдэгдэл
                  </button>
                </label>
              </div>

              <div className={splitMatchesTotal ? "split-summary success" : "split-summary"}>
                <span>Хуваасан дүн</span>
                <strong>{formatMoney(splitTotal)}</strong>
                <span>{splitRemaining >= 0 ? "Үлдэгдэл" : "Илүү"}</span>
                <strong>{formatMoney(Math.abs(splitRemaining))}</strong>
              </div>

              {splitCredit > 0 ? (
                <label className="field credit-customer-field">
                  <span>Зээлээр авах харилцагч</span>
                  <select
                    value={selectedCreditPartnerId}
                    onChange={(event) => setSelectedCreditPartnerId(event.target.value)}
                    disabled={partnersLoading}
                  >
                    <option value="">{partnersLoading ? "Харилцагч уншиж байна" : "Харилцагч сонгох"}</option>
                    {partners.map((partner) => (
                      <option key={partner.id} value={partner.id}>
                        {partner.name}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}

              {splitCard > 0 ? (
                <div className="split-confirm-row">
                  <div>
                    <strong>Картын хэсэг</strong>
                    <span>{formatMoney(splitCard)}</span>
                  </div>
                  <button
                    className={splitCardConfirmed ? "secondary-button success-button" : "secondary-button"}
                    type="button"
                    onClick={() => setSplitCardConfirmed(true)}
                    disabled={splitCardConfirmed || submitting}
                  >
                    <CreditCard size={17} aria-hidden="true" />
                    <span>{splitCardConfirmed ? "Баталгаажсан" : "Карт батлах"}</span>
                  </button>
                </div>
              ) : null}

              {splitBank > 0 ? (
                <div className="split-confirm-row">
                  <div>
                    <strong>Дансны хэсэг</strong>
                    <span>{formatMoney(splitBank)}</span>
                  </div>
                  <button
                    className={splitBankConfirmed ? "secondary-button success-button" : "secondary-button"}
                    type="button"
                    onClick={() => setSplitBankConfirmed(true)}
                    disabled={splitBankConfirmed || submitting}
                  >
                    <Landmark size={17} aria-hidden="true" />
                    <span>{splitBankConfirmed ? "Баталгаажсан" : "Данс батлах"}</span>
                  </button>
                </div>
              ) : null}

              {splitQpay > 0 ? (
                <div className="split-qpay-box">
                  <div className="qr-placeholder compact">
                    {qpayLoading ? (
                      <Loader2 className="spin-icon" size={36} aria-hidden="true" />
                    ) : qpayInvoice?.qr_image && qpayInvoice.amount === splitQpay ? (
                      <img
                        className="qpay-qr-image"
                        src={`data:image/png;base64,${qpayInvoice.qr_image}`}
                        alt="QPay QR код"
                      />
                    ) : (
                      <QrCode size={56} aria-hidden="true" />
                    )}
                  </div>
                  <div>
                    <h3>QPay хэсэг</h3>
                    <p className="muted-text">Төлөх дүн: {formatMoney(splitQpay)}</p>
                    <div className="qpay-status-grid">
                      <span>Нэхэмжлэл</span>
                      <strong>{qpayInvoice?.amount === splitQpay ? qpayInvoice.qpay_invoice_id ?? "Үүсээгүй" : "Үүсээгүй"}</strong>
                      <span>Төлөв</span>
                      <strong>{qpayInvoice?.amount === splitQpay ? qpayStateLabel ?? "Хүлээгдэж байна" : "Хүлээгдэж байна"}</strong>
                    </div>
                    {qpayPaid && qpayInvoice?.amount === splitQpay ? (
                      <div className="success-box">QPay хэсэг амжилттай баталгаажлаа.</div>
                    ) : null}
                    <div className="payment-action-row">
                      <button
                        className="secondary-button"
                        type="button"
                        onClick={() => void generateQpayInvoice(true, splitQpay)}
                        disabled={qpayLoading || qpayChecking || submitting}
                      >
                        {qpayLoading ? <Loader2 className="spin-icon" size={17} aria-hidden="true" /> : <RefreshCw size={17} aria-hidden="true" />}
                        <span>{qpayInvoice?.amount === splitQpay ? "QR дахин үүсгэх" : "QR үүсгэх"}</span>
                      </button>
                      <button
                        className="secondary-button"
                        type="button"
                        onClick={() => void handleQpayCheck()}
                        disabled={!qpayInvoice || qpayInvoice.amount !== splitQpay || qpayLoading || qpayChecking || submitting}
                      >
                        {qpayChecking ? <Loader2 className="spin-icon" size={17} aria-hidden="true" /> : <QrCode size={17} aria-hidden="true" />}
                        <span>{qpayChecking ? "Шалгаж байна" : "Төлбөр шалгах"}</span>
                      </button>
                    </div>
                  </div>
                </div>
              ) : null}

              {!splitMatchesTotal ? (
                <div className="inline-warning">Төлбөрийн нийлбэр нийт дүнтэй тэнцэх ёстой.</div>
              ) : null}

              <button
                className="primary-button full-width"
                type="button"
                onClick={() =>
                  void submitOrder(splitPayments.length === 1 ? splitPayments[0].method : "mixed", splitPayments, {
                    autoPrint: true,
                  })
                }
                disabled={!splitReady || submitting}
              >
                <ReceiptText size={17} aria-hidden="true" />
                <span>{submitting ? "Илгээж байна" : "Хуваасан төлбөр батлах"}</span>
              </button>
            </div>
          ) : null}
        </div>

        {error ? <div className="form-error">{error}</div> : null}
      </div>
    </div>
  );
}
