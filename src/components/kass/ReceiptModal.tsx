"use client";

import { Printer, ReceiptText, RotateCcw } from "lucide-react";
import { formatMoney, paymentMethodLabel } from "@/lib/kass/client-api";
import type { ReceiptData } from "@/lib/kass/client-types";

interface ReceiptModalProps {
  receipt: ReceiptData | null;
  onNewSale: () => void;
}

function resolveOrderId(receipt: ReceiptData) {
  return receipt.order.order_id ?? receipt.order.order?.order_id ?? receipt.order.order?.id ?? "Байхгүй";
}

function resolveReceiptNumber(receipt: ReceiptData) {
  return receipt.order.receipt_number ?? receipt.order.order?.receipt_number ?? "Байхгүй";
}

function formatQuantity(quantity: number) {
  return Number.isInteger(quantity)
    ? quantity.toLocaleString("mn-MN")
    : quantity.toLocaleString("mn-MN", { maximumFractionDigits: 3 });
}

export function ReceiptModal({ receipt, onNewSale }: ReceiptModalProps) {
  if (!receipt) return null;

  function handlePrint() {
    window.print();
  }

  const receiptNumber = resolveReceiptNumber(receipt);
  const orderId = resolveOrderId(receipt);
  const paidAt = new Date(receipt.paidAt).toLocaleString("mn-MN");

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="receipt-title">
      <div className="modal-card receipt-modal">
        <div className="receipt-screen-header no-print">
          <div className="modal-icon">
            <ReceiptText size={24} aria-hidden="true" />
          </div>
          <div>
            <p className="eyebrow">Баримт</p>
            <h2 id="receipt-title">Борлуулалт амжилттай</h2>
          </div>
        </div>

        <div className="receipt-print-area">
          <div className="receipt-brand">
            <img src="/cozy-coffee-logo.jpg" alt="Cozy Coffee" />
            <strong>Cozy Coffee Kass</strong>
            <span>Төлбөрийн баримт</span>
          </div>

          <div className="receipt-meta">
            <div>
              <span>Баримтын дугаар</span>
              <strong>{receiptNumber}</strong>
            </div>
            <div>
              <span>Захиалгын ID</span>
              <strong>{orderId}</strong>
            </div>
            <div>
              <span>Төлбөр</span>
              <strong>{paymentMethodLabel(receipt.paymentMethod)}</strong>
            </div>
            <div>
              <span>Огноо/цаг</span>
              <strong>{paidAt}</strong>
            </div>
          </div>

          <div className="receipt-lines">
            <header className="receipt-line-heading">
              <span>Бүтээгдэхүүн</span>
              <span>Тоо</span>
              <span>Нэгж үнэ</span>
              <span>Нийт</span>
            </header>
            {receipt.lines.map((line) => (
              <article className="receipt-line-row" key={line.product_id}>
                <span className="receipt-line-name">{line.name}</span>
                <span className="receipt-line-quantity">{formatQuantity(line.quantity)} ш</span>
                <span className="receipt-line-price">{formatMoney(line.price)}</span>
                <strong className="receipt-line-total">{formatMoney(line.price * line.quantity)}</strong>
              </article>
            ))}
          </div>

          <div className="receipt-total">
            <span>Нийт</span>
            <strong>{formatMoney(receipt.total)}</strong>
          </div>

          <div className="receipt-wifi">
            <span>WiFi</span>
            <strong>cozy coffee</strong>
            <span>Нууц үг</span>
            <strong>taaldaaa</strong>
          </div>

          <p className="receipt-thanks">Баярлалаа. Дахин үйлчлүүлээрэй.</p>
        </div>

        <div className="receipt-actions no-print">
          <button className="secondary-button" type="button" onClick={handlePrint}>
            <Printer size={17} aria-hidden="true" />
            <span>Баримт хэвлэх</span>
          </button>
          <button className="primary-button" type="button" onClick={onNewSale}>
            <RotateCcw size={17} aria-hidden="true" />
            <span>Шинэ борлуулалт</span>
          </button>
        </div>
      </div>
    </div>
  );
}
