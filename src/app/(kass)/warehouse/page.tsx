"use client";

import { FormEvent, useEffect, useMemo, useState, type ChangeEvent } from "react";
import {
  AlertTriangle,
  Boxes,
  Edit3,
  ImageIcon,
  Package,
  PackagePlus,
  Plus,
  RefreshCcw,
  Save,
  Search,
  Tags,
  Trash2,
  Upload,
  Warehouse,
  X,
} from "lucide-react";
import {
  createKassProduct,
  createProductCategory,
  deleteKassProduct,
  formatMoney,
  formatUnitName,
  getPartners,
  getProducts,
  getReadableError,
  getProductUoms,
  getWarehouseCategories,
  receiveKassProductStock,
  updateKassProduct,
} from "@/lib/kass/client-api";
import type { KassCategory, KassPartner, KassProduct, KassUom, ProductFormRequest } from "@/lib/kass/client-types";

const emptyStockForm = {
  quantity: "1",
  unit_cost: "",
  partner_id: "",
  note: "",
};

const emptyWarehouseProductForm = {
  name: "",
  sale_price: "",
  barcode: "",
  category: "",
  uom_id: "",
  image_base64: null as string | null,
  image_preview: "",
};

const emptyCategoryForm = {
  name: "",
};

function imageSource(base64?: string | null) {
  if (!base64) return "";
  if (base64.startsWith("data:image")) return base64;
  return `data:image/png;base64,${base64}`;
}

function readImageFile(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(String(reader.result ?? "")));
    reader.addEventListener("error", () => reject(new Error("Зургийг уншиж чадсангүй.")));
    reader.readAsDataURL(file);
  });
}

function stockQuantityText(product: KassProduct) {
  return Number(product.qty_available ?? 0).toLocaleString("mn-MN");
}

function productToWarehouseForm(product: KassProduct) {
  return {
    name: product.name,
    sale_price: Number(product.sale_price ?? 0) > 0 ? String(product.sale_price) : "",
    barcode: product.barcode ?? "",
    category: product.category ?? "",
    uom_id: product.uom_id ? String(product.uom_id) : "",
    image_base64: product.image_base64 ?? null,
    image_preview: imageSource(product.image_base64),
  };
}

function isLowStock(product: KassProduct) {
  return Number(product.qty_available ?? 0) <= 0;
}

export default function WarehousePage() {
  const [products, setProducts] = useState<KassProduct[]>([]);
  const [categories, setCategories] = useState<KassCategory[]>([]);
  const [uoms, setUoms] = useState<KassUom[]>([]);
  const [partners, setPartners] = useState<KassPartner[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [categoriesLoading, setCategoriesLoading] = useState(true);
  const [uomsLoading, setUomsLoading] = useState(true);
  const [partnersLoading, setPartnersLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [categoryError, setCategoryError] = useState<string | null>(null);
  const [uomError, setUomError] = useState<string | null>(null);
  const [partnerError, setPartnerError] = useState<string | null>(null);
  const [stockProduct, setStockProduct] = useState<KassProduct | null>(null);
  const [stockForm, setStockForm] = useState(emptyStockForm);
  const [stockSaving, setStockSaving] = useState(false);
  const [stockError, setStockError] = useState<string | null>(null);
  const [productModalOpen, setProductModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<KassProduct | null>(null);
  const [productForm, setProductForm] = useState(emptyWarehouseProductForm);
  const [productSaving, setProductSaving] = useState(false);
  const [productFormError, setProductFormError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [categoryModalOpen, setCategoryModalOpen] = useState(false);
  const [categoryForm, setCategoryForm] = useState(emptyCategoryForm);
  const [categorySaving, setCategorySaving] = useState(false);
  const [categoryFormError, setCategoryFormError] = useState<string | null>(null);

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

  async function loadCategories() {
    setCategoriesLoading(true);
    setCategoryError(null);

    try {
      const response = await getWarehouseCategories();
      setCategories(response.categories ?? []);
    } catch (loadError) {
      setCategoryError(getReadableError(loadError));
      setCategories([]);
    } finally {
      setCategoriesLoading(false);
    }
  }

  async function loadUoms() {
    setUomsLoading(true);
    setUomError(null);

    try {
      const response = await getProductUoms();
      setUoms(response.uoms ?? []);
    } catch (loadError) {
      setUomError(getReadableError(loadError));
      setUoms([]);
    } finally {
      setUomsLoading(false);
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
    await Promise.all([loadProducts(), loadCategories(), loadUoms(), loadPartners()]);
  }

  useEffect(() => {
    void refreshWarehouse();
  }, []);

  const stockProducts = useMemo(
    () => products.filter((product) => product.is_storable === true),
    [products],
  );

  const categoryOptions = useMemo(() => {
    const nextCategories = new Set<string>();
    categories.forEach((category) => {
      if (category.display_name) nextCategories.add(category.display_name);
    });
    stockProducts.forEach((product) => {
      if (product.category) nextCategories.add(product.category);
    });
    return Array.from(nextCategories).sort((a, b) => a.localeCompare(b, "mn"));
  }, [categories, stockProducts]);

  const uomOptions = useMemo(
    () =>
      uoms
        .slice()
        .sort((a, b) =>
          `${a.category_name ?? ""} ${a.display_name}`.localeCompare(
            `${b.category_name ?? ""} ${b.display_name}`,
            "mn",
          ),
        ),
    [uoms],
  );

  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return stockProducts;

    return stockProducts.filter((product) =>
      `${product.name} ${product.barcode ?? ""} ${product.category ?? ""}`
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

  function openProductModal() {
    setEditingProduct(null);
    setProductForm(emptyWarehouseProductForm);
    setProductFormError(null);
    setProductModalOpen(true);
  }

  function openEditProductModal(product: KassProduct) {
    setEditingProduct(product);
    setProductForm(productToWarehouseForm(product));
    setProductFormError(null);
    setProductModalOpen(true);
  }

  function closeProductModal() {
    if (productSaving) return;
    setProductModalOpen(false);
    setEditingProduct(null);
    setProductForm(emptyWarehouseProductForm);
    setProductFormError(null);
  }

  function openCategoryModal() {
    setCategoryForm(emptyCategoryForm);
    setCategoryFormError(null);
    setCategoryModalOpen(true);
  }

  async function handleProductImageChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setProductFormError("Зөвхөн зураг файл оруулна уу.");
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      setProductFormError("Зургийн хэмжээ 2MB-аас бага байх ёстой.");
      return;
    }

    try {
      const dataUrl = await readImageFile(file);
      setProductForm((current) => ({
        ...current,
        image_base64: dataUrl,
        image_preview: dataUrl,
      }));
      setProductFormError(null);
    } catch (imageError) {
      setProductFormError(getReadableError(imageError));
    }
  }

  function removeProductImage() {
    setProductForm((current) => ({
      ...current,
      image_base64: null,
      image_preview: "",
    }));
  }

  async function handleCategorySubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = categoryForm.name.trim();

    if (!name) {
      setCategoryFormError("Ангиллын нэр оруулна уу.");
      return;
    }

    setCategorySaving(true);
    setCategoryFormError(null);

    try {
      const response = await createProductCategory({ name, scope: "warehouse" });
      setCategories((current) => {
        const exists = current.some((category) => category.id === response.category.id);
        return exists ? current : [...current, response.category].sort((a, b) => a.display_name.localeCompare(b.display_name, "mn"));
      });
      setProductForm((current) => ({ ...current, category: response.category.display_name }));
      setCategoryModalOpen(false);
      setCategoryForm(emptyCategoryForm);
    } catch (saveError) {
      setCategoryFormError(getReadableError(saveError));
    } finally {
      setCategorySaving(false);
    }
  }

  async function handleProductSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = productForm.name.trim();
    const salePrice = productForm.sale_price.trim() ? Number(productForm.sale_price) : 0;

    if (!name) {
      setProductFormError("Агуулахын барааны нэр оруулна уу.");
      return;
    }

    if (!Number.isFinite(salePrice) || salePrice < 0) {
      setProductFormError("Үнэ хоосон эсвэл 0-ээс их тоо байна.");
      return;
    }

    setProductSaving(true);
    setProductFormError(null);

    try {
      const body: ProductFormRequest = {
        name,
        sale_price: salePrice,
        barcode: productForm.barcode.trim() || null,
        default_code: null,
        category: productForm.category.trim() || null,
        category_scope: "warehouse",
        description: null,
        image_base64: productForm.image_base64,
        available_for_sale: false,
        is_storable: true,
        uom_id: productForm.uom_id ? Number(productForm.uom_id) : null,
      };
      const response = editingProduct
        ? await updateKassProduct(editingProduct.id, body)
        : await createKassProduct(body);
      setProducts((current) => {
        const exists = current.some((product) => product.id === response.product.id);
        return exists
          ? current.map((product) => (product.id === response.product.id ? response.product : product))
          : [...current, response.product];
      });
      setProductModalOpen(false);
      setEditingProduct(null);
      setProductForm(emptyWarehouseProductForm);
      await loadProducts();
    } catch (saveError) {
      setProductFormError(getReadableError(saveError));
    } finally {
      setProductSaving(false);
    }
  }

  async function handleArchive(product: KassProduct) {
    const ok = window.confirm(`${product.name} агуулахын барааг хасах уу? Odoo дээр архивлагдана.`);
    if (!ok) return;

    setDeletingId(product.id);
    setError(null);

    try {
      await deleteKassProduct(product.id);
      await loadProducts();
    } catch (deleteError) {
      setError(getReadableError(deleteError));
    } finally {
      setDeletingId(null);
    }
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
            <button className="secondary-button" type="button" onClick={openCategoryModal}>
              <Tags size={16} aria-hidden="true" />
              <span>Ангилал нэмэх</span>
            </button>
            <button className="primary-button" type="button" onClick={openProductModal} data-testid="warehouse-product-create-button">
              <Plus size={16} aria-hidden="true" />
              <span>Агуулахын бараа нэмэх</span>
            </button>
            <button
              className="secondary-button"
              type="button"
              onClick={refreshWarehouse}
              disabled={loading || partnersLoading || categoriesLoading || uomsLoading}
            >
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
            placeholder="Нэр, баркод, ангиллаар хайх"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>

        {categoryError || uomError ? (
          <div className="state-box warning-state">
            <strong>Туслах мэдээлэл бүрэн уншигдсангүй</strong>
            <p>{categoryError || uomError}</p>
          </div>
        ) : null}

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
                  <div className="warehouse-card-actions">
                    <button
                      className="primary-button compact-button"
                      type="button"
                      onClick={() => openStockModal(product)}
                      data-testid={`warehouse-mobile-stock-in-${product.id}`}
                    >
                      <PackagePlus size={16} aria-hidden="true" />
                      <span>Орлого</span>
                    </button>
                    <button
                      className="secondary-button compact-button"
                      type="button"
                      onClick={() => openEditProductModal(product)}
                      data-testid={`warehouse-mobile-edit-${product.id}`}
                    >
                      <Edit3 size={16} aria-hidden="true" />
                      <span>Засах</span>
                    </button>
                    <button
                      className="danger-button compact-button"
                      type="button"
                      onClick={() => handleArchive(product)}
                      disabled={deletingId === product.id}
                      data-testid={`warehouse-mobile-delete-${product.id}`}
                    >
                      <Trash2 size={16} aria-hidden="true" />
                      <span>Хасах</span>
                    </button>
                  </div>
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
                    <td colSpan={8}>
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
                      <td>{product.barcode || "Баркодгүй"}</td>
                      <td>
                        <strong>{stockQuantityText(product)}</strong>
                      </td>
                      <td>{formatUnitName(product.uom_name)}</td>
                      <td>{formatMoney(product.cost_price ?? 0)}</td>
                      <td>
                        <div className="table-actions warehouse-actions">
                          <button
                            className="primary-button compact-button"
                            type="button"
                            onClick={() => openStockModal(product)}
                            data-testid={`warehouse-stock-in-${product.id}`}
                          >
                            <PackagePlus size={16} aria-hidden="true" />
                            <span>Орлого</span>
                          </button>
                          <button
                            className="icon-button"
                            type="button"
                            onClick={() => openEditProductModal(product)}
                            aria-label="Засах"
                            data-testid={`warehouse-edit-${product.id}`}
                          >
                            <Edit3 size={16} aria-hidden="true" />
                          </button>
                          <button
                            className="icon-button danger"
                            type="button"
                            onClick={() => handleArchive(product)}
                            disabled={deletingId === product.id}
                            aria-label="Хасах"
                            data-testid={`warehouse-delete-${product.id}`}
                          >
                            <Trash2 size={16} aria-hidden="true" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={8}>Агуулахын бараа олдсонгүй.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {productModalOpen ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="warehouse-product-title">
          <form className="modal-card product-modal" onSubmit={handleProductSubmit} data-testid="warehouse-product-modal">
            <button
              className="icon-button modal-close"
              type="button"
              aria-label="Хаах"
              onClick={closeProductModal}
              disabled={productSaving}
            >
              <X size={18} aria-hidden="true" />
            </button>
            <p className="eyebrow">Агуулахын бараа</p>
            <h2 id="warehouse-product-title">{editingProduct ? "Агуулахын бараа засах" : "Агуулахын бараа нэмэх"}</h2>

            <div className="product-form-layout">
              <div className="image-upload-box">
                {productForm.image_preview ? (
                  <img className="image-preview" src={productForm.image_preview} alt="Барааны зураг" />
                ) : (
                  <div className="image-empty-state">
                    <ImageIcon size={28} aria-hidden="true" />
                    <strong>Зураг оруулах</strong>
                    <span>PNG эсвэл JPG, 2MB хүртэл</span>
                  </div>
                )}
                <div className="image-actions">
                  <label className="secondary-button file-button">
                    <Upload size={16} aria-hidden="true" />
                    <span>Зураг сонгох</span>
                    <input type="file" accept="image/*" onChange={handleProductImageChange} />
                  </label>
                  {productForm.image_preview ? (
                    <button className="secondary-button" type="button" onClick={removeProductImage} disabled={productSaving}>
                      Зураг авахгүй
                    </button>
                  ) : null}
                </div>
              </div>

              <div className="product-fields">
                <label className="field">
                  <span>Барааны нэр</span>
                  <input
                    value={productForm.name}
                    onChange={(event) => setProductForm((current) => ({ ...current, name: event.target.value }))}
                    placeholder="Жишээ: Кофены үр"
                    required
                    data-testid="warehouse-product-name"
                  />
                </label>

                <div className="form-grid two-columns">
                  <label className="field">
                    <span>Үнэ</span>
                    <input
                      type="number"
                      min="0"
                      step="any"
                      inputMode="decimal"
                      value={productForm.sale_price}
                      onChange={(event) => setProductForm((current) => ({ ...current, sale_price: event.target.value }))}
                      placeholder="Заавал биш"
                    />
                  </label>
                  <label className="field">
                    <span>Баркод</span>
                    <input
                      value={productForm.barcode}
                      onChange={(event) => setProductForm((current) => ({ ...current, barcode: event.target.value }))}
                      placeholder="Заавал биш"
                    />
                  </label>
                </div>

                <div className="form-grid two-columns">
                  <label className="field">
                    <span>Ангилал</span>
                    <select
                      value={productForm.category}
                      onChange={(event) => setProductForm((current) => ({ ...current, category: event.target.value }))}
                      disabled={categoriesLoading}
                    >
                      <option value="">Ангилалгүй</option>
                      {categoryOptions.map((category) => (
                        <option key={category} value={category}>
                          {category}
                        </option>
                      ))}
                    </select>
                    <small className="field-help">Шинэ ангиллыг toolbar дээрээс нэмнэ.</small>
                  </label>
                  <label className="field">
                    <span>Нэгж</span>
                    <select
                      value={productForm.uom_id}
                      onChange={(event) => setProductForm((current) => ({ ...current, uom_id: event.target.value }))}
                      disabled={uomsLoading}
                    >
                      <option value="">Odoo default</option>
                      {uomOptions.map((uom) => (
                        <option key={uom.id} value={uom.id}>
                          {formatUnitName(uom.display_name)}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <div className="form-note">
                  Энэ бараа агуулахын үлдэгдэлтэй байна, касс дээр шууд харагдахгүй. Үлдэгдлийг дараа нь “Орлого” товчоор авна.
                </div>
              </div>
            </div>

            {productFormError ? <div className="form-error">{productFormError}</div> : null}

            <div className="modal-actions">
              <button className="secondary-button" type="button" onClick={closeProductModal} disabled={productSaving}>
                Болих
              </button>
              <button className="primary-button" type="submit" disabled={productSaving} data-testid="warehouse-product-save-button">
                <Save size={17} aria-hidden="true" />
                <span>{productSaving ? "Хадгалж байна" : "Хадгалах"}</span>
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {categoryModalOpen ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="warehouse-category-title">
          <form className="modal-card narrow-modal" onSubmit={handleCategorySubmit} data-testid="warehouse-category-modal">
            <button
              className="icon-button modal-close"
              type="button"
              aria-label="Хаах"
              onClick={() => setCategoryModalOpen(false)}
              disabled={categorySaving}
            >
              <X size={18} aria-hidden="true" />
            </button>
            <p className="eyebrow">Агуулахын ангилал</p>
            <h2 id="warehouse-category-title">Ангилал нэмэх</h2>
            <label className="field">
              <span>Ангиллын нэр</span>
              <input
                value={categoryForm.name}
                onChange={(event) => setCategoryForm((current) => ({ ...current, name: event.target.value }))}
                placeholder="Жишээ: Түүхий эд"
                required
                data-testid="warehouse-category-name"
              />
            </label>
            {categoryFormError ? <div className="form-error">{categoryFormError}</div> : null}
            <div className="modal-actions">
              <button className="secondary-button" type="button" onClick={() => setCategoryModalOpen(false)} disabled={categorySaving}>
                Болих
              </button>
              <button className="primary-button" type="submit" disabled={categorySaving}>
                <Save size={17} aria-hidden="true" />
                <span>{categorySaving ? "Хадгалж байна" : "Хадгалах"}</span>
              </button>
            </div>
          </form>
        </div>
      ) : null}

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
