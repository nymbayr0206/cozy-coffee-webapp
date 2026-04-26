"use client";

import { ReceiptText } from "lucide-react";
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

export function ReceiptModal({ receipt, onNewSale }: ReceiptModalProps) {
  if (!receipt) return null;

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="receipt-title">
      <div className="modal-card receipt-modal">
        <div className="modal-icon">
          <ReceiptText size={24} aria-hidden="true" />
        </div>
        <div>
          <p className="eyebrow">Баримт</p>
          <h2 id="receipt-title">Борлуулалт амжилттай</h2>
        </div>

        <div className="receipt-meta">
          <div>
            <span>Баримтын дугаар</span>
            <strong>{resolveReceiptNumber(receipt)}</strong>
          </div>
          <div>
            <span>Захиалгын ID</span>
            <strong>{resolveOrderId(receipt)}</strong>
          </div>
          <div>
            <span>Төлбөр</span>
            <strong>{paymentMethodLabel(receipt.paymentMethod)}</strong>
          </div>
          <div>
            <span>Огноо/цаг</span>
            <strong>{new Date(receipt.paidAt).toLocaleString("mn-MN")}</strong>
          </div>
        </div>

        <div className="receipt-lines">
          {receipt.lines.map((line) => (
            <div key={line.product_id}>
              <span>
                {line.name} x {line.quantity}
              </span>
              <strong>{formatMoney(line.price * line.quantity)}</strong>
            </div>
          ))}
        </div>

        <div className="receipt-total">
          <span>Нийт</span>
          <strong>{formatMoney(receipt.total)}</strong>
        </div>

        <button className="primary-button full-width" type="button" onClick={onNewSale}>
          <span>Шинэ борлуулалт</span>
        </button>
      </div>
    </div>
  );
}
