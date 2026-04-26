"use client";

import { useMemo, useState } from "react";
import { CartPanel } from "@/components/kass/CartPanel";
import { PaymentModal } from "@/components/kass/PaymentModal";
import { ProductGrid } from "@/components/kass/ProductGrid";
import { ReceiptModal } from "@/components/kass/ReceiptModal";
import { useKassSession } from "@/components/kass/AppShell";
import { formatMoney } from "@/lib/kass/client-api";
import type { CartItem, KassProduct, ReceiptData } from "@/lib/kass/client-types";

export default function PosPage() {
  const { sessionId, refreshReport, openSessionPrompt } = useKassSession();
  const [cart, setCart] = useState<CartItem[]>([]);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [receipt, setReceipt] = useState<ReceiptData | null>(null);

  const total = useMemo(() => cart.reduce((sum, item) => sum + item.price * item.quantity, 0), [cart]);
  const itemCount = useMemo(() => cart.reduce((sum, item) => sum + item.quantity, 0), [cart]);

  function addProduct(product: KassProduct) {
    if (product.available_for_sale === false) return;

    setCart((current) => {
      const existing = current.find((item) => item.product_id === product.id);
      if (existing) {
        return current.map((item) =>
          item.product_id === product.id ? { ...item, quantity: item.quantity + 1 } : item,
        );
      }

      return [
        ...current,
        {
          product_id: product.id,
          name: product.name,
          category: product.category,
          barcode: product.barcode,
          price: Number(product.sale_price ?? 0),
          quantity: 1,
          image_base64: product.image_base64,
        },
      ];
    });
  }

  function updateQuantity(productId: number, direction: "up" | "down") {
    setCart((current) =>
      current
        .map((item) => {
          if (item.product_id !== productId) return item;
          const nextQuantity = direction === "up" ? item.quantity + 1 : item.quantity - 1;
          return { ...item, quantity: nextQuantity };
        })
        .filter((item) => item.quantity > 0),
    );
  }

  function handlePaymentSuccess(nextReceipt: ReceiptData) {
    setPaymentOpen(false);
    setReceipt(nextReceipt);
    setCart([]);
    refreshReport();
  }

  return (
    <div className="pos-layout">
      <ProductGrid onAddProduct={addProduct} />
      <CartPanel
        items={cart}
        sessionReady={Boolean(sessionId)}
        onIncrement={(productId) => updateQuantity(productId, "up")}
        onDecrement={(productId) => updateQuantity(productId, "down")}
        onRemove={(productId) => setCart((current) => current.filter((item) => item.product_id !== productId))}
        onClear={() => setCart([])}
        onCheckout={() => {
          if (total > 0) setPaymentOpen(true);
        }}
      />
      <PaymentModal
        open={paymentOpen}
        sessionId={sessionId}
        lines={cart}
        onClose={() => setPaymentOpen(false)}
        onPaymentSuccess={handlePaymentSuccess}
      />
      <ReceiptModal receipt={receipt} onNewSale={() => setReceipt(null)} />

      {cart.length > 0 ? (
        <div className="mobile-cart-dock" role="region" aria-label="Гар утасны сагсны товч">
          <div>
            <span>{itemCount} ширхэг</span>
            <strong>{formatMoney(total)}</strong>
          </div>
          <button
            className="primary-button"
            type="button"
            onClick={() => {
              if (!sessionId) {
                openSessionPrompt();
                return;
              }
              if (total > 0) setPaymentOpen(true);
            }}
          >
            {sessionId ? "Төлөх" : "Ээлж нээх"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
