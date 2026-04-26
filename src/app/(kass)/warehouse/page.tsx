"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Boxes,
  Package,
  PackagePlus,
  RefreshCcw,
  Search,
  Warehouse,
  X,
} from "lucide-react";
import {
  formatMoney,
  formatUnitName,
  getPartners,
  getProducts,
  getReadableError,
  receiveKassProductStock,
} from "@/lib/kass/client-api";
import type { KassPartner, KassProduct } from "@/lib/kass/client-types";

const emptyStockForm = {
  quantity: "1",
  unit_cost: "",
  partner_id: "",
  note: "",
};

function imageSource(base64?: string | null) {
  if (!base64) return "";
  if (base64.startsWith("data:image")) return base64;
  return `data:image/png;base64,${base64}`;
}

function stockQuantityText(product: KassProduct) {
  return Number(product.qty_available ?? 0).toLocaleString("mn-MN");
}

function isLowStock(product: KassProduct) {
  return Number(product.qty_available ?? 0) <= 0;
}

export default function WarehousePage() {
  const [products, setProducts] = useState<KassProduct[]>([]);
  const [partners, setPartners] = useState<KassPartner[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [partnersLoading, setPartnersLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [partnerError, setPartnerError] = useState<string | null>(null);
  const [stockProduct, setStockProduct] = useState<KassProduct | null>(null);
  const [stockForm, setStockForm] = useState(emptyStockForm);
  const [stockSaving, setStockSaving] = useState(false);
  const [stockError, setStockError] = useState<string | null>(null);

  async function loadProducts() {
    setLoading(true);
    setError(null);

    try {
      const response = await getProducts("all");
      setProducts(response.products ?? []);
    } catch (loadError) {
      setError(getReadableError(loadError));
      setProducts([]);
    } finally {
      setLoading(false);
    }
  }

  async function loadPartners() {
    setPartnersLoading(true);
    setPartnerError(null);

    try {
      const response = await getPartners();
      setPartners(response.partners ?? []);
    } catch (loadError) {
      setPartnerError(getReadableError(loadError));
      setPartners([]);
    } finally {
      setPartnersLoading(false);
    }
  }

  async function refreshWarehouse() {
    await Promise.all([loadProducts(), loadPartners()]);
  }

  useEffect(() => {
    void refreshWarehouse();
  }, []);

  const stockProducts = useMemo(
    () => products.filter((product) => product.is_storable === true),
    [products],
  );

  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return stockProducts;

    return stockProducts.filter((product) =>
      `${product.name} ${product.barcode ?? ""} ${product.default_code ?? ""} ${product.category ?? ""}`
        .toLowerCase()
        .includes(normalizedQuery),
    );
  }, [query, stockProducts]);

  const summary = useMemo(
    () => ({
      totalItems: stockProducts.length,
      lowStock: stockProducts.filter(isLowStock).length,
      totalUnits: stockProducts.reduce((sum, product) => sum + Number(product.qty_available ?? 0), 0),
    }),
    [stockProducts],
  );

  const activeStockUnitName = stockProduct ? formatUnitName(stockProduct.uom_name) : "нэгж";

  function openStockModal(product: KassProduct) {
    setStockProduct(product);
    setStockForm({
      ...emptyStockForm,
      unit_cost: Number(product.cost_price ?? 0) > 0 ? String(product.cost_price) : "",
    });
    setStockError(null);
    setError(null);
  }

  async function handleStockSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!stockProduct) return;

    const quantity = Number(stockForm.quantity);
    const unitCost = Number(stockForm.unit_cost);
    const partnerId = stockForm.partner_id ? Number(stockForm.partner_id) : null;

    if (!Number.isFinite(quantity) || quantity <= 0) {
      setStockError("Орлого авах тоо хэмжээ 0-ээс их байх ёстой.");
      return;
    }

    if (!Number.isFinite(unitCost) || unitCost <= 0) {
      setStockError("Нэгж өртөг 0-ээс их байх ёстой.");
      return;
    }

    if (partnerId !== null && (!Number.isInteger(partnerId) || partnerId <= 0)) {
      setStockError("Харилцагчийн сонголт буруу байна.");
      return;
    }

    setStockSaving(true);
    setStockError(null);

    try {
      const result = await receiveKassProductStock(stockProduct.id, {
        quantity,
        unit_cost: unitCost,
        partner_id: partnerId,
        note: stockForm.note.trim() || null,
      });

      setProducts((current) =>
        current.map((product) => (product.id === result.product.id ? result.product : product)),
      );
      setStockProduct(null);
      setStockForm(emptyStockForm);
      await loadProducts();
    } catch (saveError) {
      setStockError(getReadableError(saveError));
    } finally {
      setStockSaving(false);
    }
  }

  return (
    <div className="page-stack" data-testid="warehouse-page">
      <section className="content-panel">
        <div className="panel-toolbar">
          <div>
            <p className="eyebrow">Агуулах</p>
            <div className="heading-line">
              <h2>Үлдэгдэл ба орлого</h2>
              {!loading ? <span className="soft-pill">{filtered.length} илэрц</span> : null}
            </div>
          </div>
          <div className="toolbar-actions">
            <button className="secondary-button" type="button" onClick={refreshWarehouse} disabled={loading || partnersLoading}>
              <RefreshCcw size={16} aria-hidden="true" />
              <span>{loading ? "Уншиж байна" : "Шинэчлэх"}</span>
            </button>
          </div>
        </div>

        <div className="report-kpi-grid warehouse-kpi-grid">
          <div className="metric strong-metric">
            <Warehouse size={22} aria-hidden="true" />
            <span>Агуулахын бараа</span>
            <strong>{summary.totalItems}</strong>
          </div>
          <div className="metric">
            <Boxes size={22} aria-hidden="true" />
            <span>Нийт үлдэгдэл</span>
            <strong>{summary.totalUnits.toLocaleString("mn-MN")}</strong>
          </div>
          <div className="metric">
            <AlertTriangle size={22} aria-hidden="true" />
            <span>Дууссан / 0</span>
            <strong>{summary.lowStock}</strong>
          </div>
        </div>

        <label className="search-box list-search">
          <Search size={18} aria-hidden="true" />
          <input
            type="search"
            placeholder="Нэр, баркод, дотоод код, ангиллаар хайх"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>

        {error ? (
          <div className="state-box error-state">
            <strong>Агуулахын мэдээлэл татахад алдаа гарлаа</strong>
            <p>{error}</p>
          </div>
        ) : null}

        <div className="warehouse-card-list">
          {loading ? (
            Array.from({ length: 5 }).map((_, index) => <div className="row-skeleton" key={index} />)
          ) : filtered.length > 0 ? (
            filtered.map((product) => {
              const src = imageSource(product.image_base64);
              const unitName = formatUnitName(product.uom_name);

              return (
                <article className="warehouse-card" key={product.id}>
                  {src ? (
                    <img className="product-thumb" src={src} alt={product.name} />
                  ) : (
                    <span className="product-thumb placeholder" aria-hidden="true">
                      <Package size={18} />
                    </span>
                  )}
                  <div className="warehouse-card-main">
                    <strong>{product.name}</strong>
                    <span>{product.category || "Ангилалгүй"}</span>
                    <div className="warehouse-card-meta">
                      <span>Үлдэгдэл: {stockQuantityText(product)} {unitName}</span>
                      <span>Нэгж өртөг: {formatMoney(product.cost_price ?? 0)}</span>
                    </div>
                  </div>
                  <button
                    className="primary-button compact-button"
                    type="button"
                    onClick={() => openStockModal(product)}
                    data-testid={`warehouse-mobile-stock-in-${product.id}`}
                  >
                    <PackagePlus size={16} aria-hidden="true" />
                    <span>Орлого</span>
                  </button>
                </article>
              );
            })
          ) : (
            <div className="state-box">Агуулахын бараа олдсонгүй.</div>
          )}
        </div>

        <div className="table-wrap warehouse-table-wrap">
          <table className="data-table product-table">
            <thead>
              <tr>
                <th>Зураг</th>
                <th>Бараа</th>
                <th>Ангилал</th>
                <th>Дотоод код</th>
                <th>Баркод</th>
                <th>Үлдэгдэл</th>
                <th>Нэгж</th>
                <th>Нэгж өртөг</th>
                <th>Үйлдэл</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 6 }).map((_, index) => (
                  <tr key={index}>
                    <td colSpan={9}>
                      <div className="row-skeleton" />
                    </td>
                  </tr>
                ))
              ) : filtered.length > 0 ? (
                filtered.map((product) => {
                  const src = imageSource(product.image_base64);

                  return (
                    <tr key={product.id}>
                      <td>
                        {src ? (
                          <img className="product-thumb" src={src} alt={product.name} />
                        ) : (
                          <span className="product-thumb placeholder" aria-hidden="true">
                            <Package size={18} />
                          </span>
                        )}
                      </td>
                      <td>
                        <strong>{product.name}</strong>
                        {isLowStock(product) ? <small className="table-subtext danger-text">Үлдэгдэл 0 байна</small> : null}
                      </td>
                      <td>{product.category || "Ангилалгүй"}</td>
                      <td>{product.default_code || "Кодгүй"}</td>
                      <td>{product.barcode || "Баркодгүй"}</td>
                      <td>
                        <strong>{stockQuantityText(product)}</strong>
                      </td>
                      <td>{formatUnitName(product.uom_name)}</td>
                      <td>{formatMoney(product.cost_price ?? 0)}</td>
                      <td>
                        <button
                          className="primary-button compact-button"
                          type="button"
                          onClick={() => openStockModal(product)}
                          data-testid={`warehouse-stock-in-${product.id}`}
                        >
                          <PackagePlus size={16} aria-hidden="true" />
                          <span>Орлого</span>
                        </button>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={9}>Агуулахын бараа олдсонгүй.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {stockProduct ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="stock-form-title">
          <form className="modal-card narrow-modal" onSubmit={handleStockSubmit} data-testid="warehouse-stock-in-modal">
            <button
              className="icon-button modal-close"
              type="button"
              aria-label="Хаах"
              onClick={() => setStockProduct(null)}
              disabled={stockSaving}
            >
              <X size={18} aria-hidden="true" />
            </button>
            <p className="eyebrow">Агуулахын орлого</p>
            <h2 id="stock-form-title">Орлого авах</h2>
            <div className="stock-product-card">
              <span>{stockProduct.name}</span>
              <strong>
                Одоогийн үлдэгдэл: {stockQuantityText(stockProduct)} {activeStockUnitName}
              </strong>
              <small>Одоогийн нэгж өртөг: {formatMoney(stockProduct.cost_price ?? 0)}</small>
            </div>

            <div className="form-grid two-columns">
              <label className="field">
                <span>Тоо хэмжээ</span>
                <div className="input-with-suffix">
                  <input
                    type="number"
                    min="0.000001"
                    step="any"
                    inputMode="decimal"
                    value={stockForm.quantity}
                    onChange={(event) => setStockForm((current) => ({ ...current, quantity: event.target.value }))}
                    data-testid="stock-quantity-input"
                  />
                  <b>{activeStockUnitName}</b>
                </div>
              </label>
              <label className="field">
                <span>Нэгж өртөг</span>
                <div className="input-with-suffix">
                  <input
                    type="number"
                    min="0.000001"
                    step="any"
                    inputMode="decimal"
                    value={stockForm.unit_cost}
                    onChange={(event) => setStockForm((current) => ({ ...current, unit_cost: event.target.value }))}
                    placeholder="Жишээ: 45000"
                    required
                    data-testid="stock-unit-cost-input"
                  />
                  <b>MNT / {activeStockUnitName}</b>
                </div>
              </label>
            </div>

            <div className="stock-cost-preview">
              <span>Нийт өртөг</span>
              <strong>
                {formatMoney(
                  Number.isFinite(Number(stockForm.quantity)) && Number.isFinite(Number(stockForm.unit_cost))
                    ? Number(stockForm.quantity) * Number(stockForm.unit_cost)
                    : 0,
                )}
              </strong>
            </div>

            <label className="field">
              <span>Харилцагч</span>
              <select
                value={stockForm.partner_id}
                onChange={(event) => setStockForm((current) => ({ ...current, partner_id: event.target.value }))}
                disabled={partnersLoading}
                data-testid="warehouse-partner-select"
              >
                <option value="">Сонгохгүй</option>
                {partners.map((partner) => (
                  <option key={partner.id} value={partner.id}>
                    {partner.name}
                  </option>
                ))}
              </select>
              {partnerError ? (
                <small className="field-help error">{partnerError}</small>
              ) : (
                <small className="field-help">
                  {partnersLoading ? "Харилцагч уншиж байна" : "Сонгохгүй байж болно."}
                </small>
              )}
            </label>

            <label className="field">
              <span>Тэмдэглэл</span>
              <textarea
                value={stockForm.note}
                onChange={(event) => setStockForm((current) => ({ ...current, note: event.target.value }))}
                placeholder="Жишээ: Өглөөний татан авалт"
              />
            </label>

            {stockError ? <div className="form-error">{stockError}</div> : null}

            <div className="modal-actions">
              <button className="secondary-button" type="button" onClick={() => setStockProduct(null)} disabled={stockSaving}>
                Болих
              </button>
              <button className="primary-button" type="submit" disabled={stockSaving}>
                <PackagePlus size={17} aria-hidden="true" />
                <span>{stockSaving ? "Орлого авч байна" : "Орлого авах"}</span>
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}
