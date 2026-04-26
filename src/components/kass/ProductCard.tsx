"use client";

import { Package, Plus } from "lucide-react";
import { formatMoney } from "@/lib/kass/client-api";
import type { KassProduct } from "@/lib/kass/client-types";

interface ProductCardProps {
  product: KassProduct;
  onAdd: (product: KassProduct) => void;
}

function imageSource(base64?: string | null) {
  if (!base64) return null;
  if (base64.startsWith("data:image")) return base64;
  return `data:image/png;base64,${base64}`;
}

export function ProductCard({ product, onAdd }: ProductCardProps) {
  const disabled = product.available_for_sale === false;
  const src = imageSource(product.image_base64);

  return (
    <button
      className={disabled ? "product-card disabled" : "product-card"}
      type="button"
      onClick={() => onAdd(product)}
      disabled={disabled}
      title={disabled ? "Борлуулах боломжгүй" : `${product.name} сагсанд нэмэх`}
    >
      <div className="product-image-wrap">
        {src ? (
          <img className="product-image" src={src} alt={product.name} />
        ) : (
          <div className="product-placeholder" aria-hidden="true">
            <Package size={28} />
          </div>
        )}
      </div>
      <div className="product-card-body">
        <div>
          <h3>{product.name}</h3>
          <p>{product.category || "Ангилалгүй"}</p>
        </div>
        <strong>{formatMoney(product.sale_price)}</strong>
        <div className="product-meta">
          <span>{product.barcode || "Баркод байхгүй"}</span>
          <Plus size={17} aria-hidden="true" />
        </div>
      </div>
    </button>
  );
}
