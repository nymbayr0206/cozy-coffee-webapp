"use client";

import { Minus, Plus, ShoppingBasket, Trash2, XCircle } from "lucide-react";
import { formatMoney } from "@/lib/kass/client-api";
import type { CartItem } from "@/lib/kass/client-types";

interface CartPanelProps {
  items: CartItem[];
  sessionReady: boolean;
  onIncrement: (productId: number) => void;
  onDecrement: (productId: number) => void;
  onRemove: (productId: number) => void;
  onClear: () => void;
  onCheckout: () => void;
}

export function CartPanel({
  items,
  sessionReady,
  onIncrement,
  onDecrement,
  onRemove,
  onClear,
  onCheckout,
}: CartPanelProps) {
  const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <aside className="cart-panel">
      <div className="panel-toolbar">
        <div>
          <p className="eyebrow">Сагс</p>
          <h2>Захиалга</h2>
        </div>
        <span className="count-pill">{itemCount}</span>
      </div>

      <div className="cart-items">
        {items.length === 0 ? (
          <div className="cart-empty">
            <ShoppingBasket size={34} aria-hidden="true" />
            <strong>Сагс хоосон байна</strong>
            <p>Барааны карт дээр дарж захиалгад нэмнэ.</p>
          </div>
        ) : null}

        {items.map((item) => (
          <div className="cart-item" key={item.product_id}>
            <div className="cart-item-main">
              <strong>{item.name}</strong>
              <span>
                {formatMoney(item.price)} x {item.quantity}
              </span>
            </div>
            <div className="cart-line-total">{formatMoney(item.price * item.quantity)}</div>
            <div className="cart-item-actions">
              <button
                className="icon-button"
                type="button"
                onClick={() => onDecrement(item.product_id)}
                aria-label="Тоо бууруулах"
              >
                <Minus size={16} aria-hidden="true" />
              </button>
              <span className="quantity-box">{item.quantity}</span>
              <button
                className="icon-button"
                type="button"
                onClick={() => onIncrement(item.product_id)}
                aria-label="Тоо нэмэх"
              >
                <Plus size={16} aria-hidden="true" />
              </button>
              <button
                className="icon-button danger"
                type="button"
                onClick={() => onRemove(item.product_id)}
                aria-label="Устгах"
              >
                <Trash2 size={16} aria-hidden="true" />
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="cart-totals">
        <div>
          <span>Нийт ширхэг</span>
          <strong>{itemCount}</strong>
        </div>
        <div>
          <span>Дэд дүн</span>
          <strong>{formatMoney(subtotal)}</strong>
        </div>
        <div className="grand-total">
          <span>Нийт дүн</span>
          <strong>{formatMoney(subtotal)}</strong>
        </div>
      </div>

      <div className="cart-actions">
        <button className="secondary-button" type="button" onClick={onClear} disabled={items.length === 0}>
          <XCircle size={17} aria-hidden="true" />
          <span>Сагс цэвэрлэх</span>
        </button>
        <button className="primary-button" type="button" onClick={onCheckout} disabled={items.length === 0 || !sessionReady}>
          <ShoppingBasket size={18} aria-hidden="true" />
          <span>{sessionReady ? "Төлбөр төлөх" : "Ээлж нээгдээгүй"}</span>
        </button>
      </div>
    </aside>
  );
}
