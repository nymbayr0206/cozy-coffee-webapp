"use client";

import { FormEvent, useEffect, useMemo, useState, type ChangeEvent } from "react";
import {
  Boxes,
  Edit3,
  Eye,
  EyeOff,
  Factory,
  ImageIcon,
  Package,
  PackagePlus,
  Plus,
  RefreshCcw,
  Save,
  Search,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import {
  createKassProduct,
  deleteKassProduct,
  formatMoney,
  formatUnitName,
  getPartners,
  getProductCategories,
  getProductRecipe,
  getProductUoms,
  getProducts,
  getReadableError,
  receiveKassProductStock,
  updateKassProduct,
  updateProductRecipe,
} from "@/lib/kass/client-api";
import type { KassCategory, KassPartner, KassProduct, KassUom, ProductFormRequest } from "@/lib/kass/client-types";

type ProductViewFilter = "all" | "pos" | "hidden" | "production";

type ProductFormState = {
  name: string;
  sale_price: string;
  barcode: string;
  default_code: string;
  category: string;
  description: string;
  image_base64: string | null;
  image_preview: string;
  available_for_sale: boolean;
  is_storable: boolean;
  uom_id: string;
};

type RecipeLineState = {
  key: string;
  component_product_id: string;
  quantity: string;
  component_name?: string;
  uom_name?: string | null;
  qty_available?: number | null;
};

const emptyForm: ProductFormState = {
  name: "",
  sale_price: "0",
  barcode: "",
  default_code: "",
  category: "",
  description: "",
  image_base64: null,
  image_preview: "",
  available_for_sale: true,
  is_storable: false,
  uom_id: "",
};

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

function productToForm(product: KassProduct): ProductFormState {
  return {
    name: product.name,
    sale_price: String(product.sale_price ?? 0),
    barcode: product.barcode ?? "",
    default_code: product.default_code ?? "",
    category: product.category ?? "",
    description: product.description ?? "",
    image_base64: product.image_base64 ?? null,
    image_preview: imageSource(product.image_base64),
    available_for_sale: product.available_for_sale !== false,
    is_storable: product.is_storable === true,
    uom_id: product.uom_id ? String(product.uom_id) : "",
  };
}

function readImageFile(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(String(reader.result ?? "")));
    reader.addEventListener("error", () => reject(new Error("Зургийг уншиж чадсангүй.")));
    reader.readAsDataURL(file);
  });
}

function isProductionProduct(product: KassProduct) {
  return product.is_storable !== true;
}

function stockQuantityText(product: KassProduct) {
  return Number(product.qty_available ?? 0).toLocaleString("mn-MN");
}

function makeRecipeLine(line?: Partial<RecipeLineState>): RecipeLineState {
  return {
    key: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    component_product_id: "",
    quantity: "1",
    ...line,
  };
}

export default function ProductsPage() {
  const [products, setProducts] = useState<KassProduct[]>([]);
  const [categories, setCategories] = useState<KassCategory[]>([]);
  const [uoms, setUoms] = useState<KassUom[]>([]);
  const [partners, setPartners] = useState<KassPartner[]>([]);
  const [query, setQuery] = useState("");
  const [viewFilter, setViewFilter] = useState<ProductViewFilter>("all");
  const [loading, setLoading] = useState(true);
  const [categoriesLoading, setCategoriesLoading] = useState(true);
  const [uomsLoading, setUomsLoading] = useState(true);
  const [partnersLoading, setPartnersLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [categoryError, setCategoryError] = useState<string | null>(null);
  const [uomError, setUomError] = useState<string | null>(null);
  const [partnerError, setPartnerError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<KassProduct | null>(null);
  const [form, setForm] = useState<ProductFormState>(emptyForm);
  const [customCategoryMode, setCustomCategoryMode] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [visibilitySavingId, setVisibilitySavingId] = useState<number | null>(null);
  const [stockProduct, setStockProduct] = useState<KassProduct | null>(null);
  const [stockForm, setStockForm] = useState(emptyStockForm);
  const [stockSaving, setStockSaving] = useState(false);
  const [stockError, setStockError] = useState<string | null>(null);
  const [recipeLines, setRecipeLines] = useState<RecipeLineState[]>([]);
  const [recipeLoading, setRecipeLoading] = useState(false);
  const [recipeError, setRecipeError] = useState<string | null>(null);
  const [recipeDirty, setRecipeDirty] = useState(false);

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
      const response = await getProductCategories();
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

  async function refreshCatalog() {
    await Promise.all([loadProducts(), loadCategories(), loadUoms(), loadPartners()]);
  }

  useEffect(() => {
    loadProducts();
    loadCategories();
    loadUoms();
    loadPartners();
  }, []);

  const categoryOptions = useMemo(() => {
    const nextCategories = new Set<string>();
    categories.forEach((category) => {
      if (category.display_name) nextCategories.add(category.display_name);
    });
    products.forEach((product) => {
      if (product.category) nextCategories.add(product.category);
    });
    return Array.from(nextCategories).sort((a, b) => a.localeCompare(b, "mn"));
  }, [categories, products]);

  const ingredientOptions = useMemo(
    () =>
      products
        .filter((product) => product.is_storable === true && product.id !== editingProduct?.id)
        .sort((a, b) => a.name.localeCompare(b.name, "mn")),
    [editingProduct?.id, products],
  );

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

  const counts = useMemo(
    () => ({
      all: products.length,
      pos: products.filter((product) => product.available_for_sale !== false).length,
      hidden: products.filter((product) => product.available_for_sale === false).length,
      production: products.filter(
        (product) => product.available_for_sale !== false && isProductionProduct(product),
      ).length,
      stock: products.filter((product) => product.is_storable === true).length,
    }),
    [products],
  );

  const viewOptions = useMemo(
    () => [
      { key: "all" as const, label: "Бүх бараа", count: counts.all, icon: Boxes },
      { key: "pos" as const, label: "Кассаар зарагдах", count: counts.pos, icon: Eye },
      { key: "hidden" as const, label: "Касс дээр харагдахгүй", count: counts.hidden, icon: EyeOff },
      { key: "production" as const, label: "Үйлдвэрлэлийн бараа", count: counts.production, icon: Factory },
    ],
    [counts],
  );

  const scopedProducts = useMemo(() => {
    if (viewFilter === "pos") return products.filter((product) => product.available_for_sale !== false);
    if (viewFilter === "hidden") return products.filter((product) => product.available_for_sale === false);
    if (viewFilter === "production") {
      return products.filter((product) => product.available_for_sale !== false && isProductionProduct(product));
    }
    return products;
  }, [products, viewFilter]);

  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return scopedProducts.filter((product) =>
      `${product.name} ${product.barcode ?? ""} ${product.default_code ?? ""} ${product.category ?? ""} ${
        product.description ?? ""
      }`
        .toLowerCase()
        .includes(normalizedQuery),
    );
  }, [scopedProducts, query]);

  function openCreateModal() {
    setEditingProduct(null);
    setForm(emptyForm);
    setCustomCategoryMode(false);
    setFormError(null);
    setRecipeLines([]);
    setRecipeError(null);
    setRecipeDirty(false);
    setRecipeLoading(false);
    setModalOpen(true);
  }

  function openEditModal(product: KassProduct) {
    setEditingProduct(product);
    setForm(productToForm(product));
    setCustomCategoryMode(Boolean(product.category && !categoryOptions.includes(product.category)));
    setFormError(null);
    setRecipeLines([]);
    setRecipeError(null);
    setRecipeDirty(false);
    setModalOpen(true);
    void loadRecipe(product.id);
  }

  async function loadRecipe(productId: number) {
    setRecipeLoading(true);
    setRecipeError(null);

    try {
      const response = await getProductRecipe(productId);
      setRecipeLines(
        response.recipe.lines
          .filter((line) => typeof line.component_product_id === "number")
          .map((line) =>
            makeRecipeLine({
              component_product_id: String(line.component_product_id ?? ""),
              quantity: String(line.quantity ?? 1),
              component_name: line.component_name,
              uom_name: line.uom_name,
              qty_available: line.qty_available,
            }),
          ),
      );
      setRecipeDirty(false);
    } catch (error) {
      setRecipeError(getReadableError(error));
      setRecipeLines([]);
    } finally {
      setRecipeLoading(false);
    }
  }

  async function handleImageChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setFormError("Зөвхөн зураг файл оруулна уу.");
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      setFormError("Зургийн хэмжээ 2MB-аас бага байх ёстой.");
      return;
    }

    try {
      const dataUrl = await readImageFile(file);
      setForm((current) => ({
        ...current,
        image_base64: dataUrl,
        image_preview: dataUrl,
      }));
      setFormError(null);
    } catch (imageError) {
      setFormError(getReadableError(imageError));
    }
  }

  function removeImage() {
    setForm((current) => ({
      ...current,
      image_base64: null,
      image_preview: "",
    }));
  }

  function handleCategorySelect(value: string) {
    if (value === "__custom__") {
      setCustomCategoryMode(true);
      setForm((current) => ({ ...current, category: "" }));
      return;
    }

    setCustomCategoryMode(false);
    setForm((current) => ({ ...current, category: value }));
  }

  function addRecipeLine() {
    setRecipeDirty(true);
    setRecipeLines((current) => [...current, makeRecipeLine()]);
  }

  function updateRecipeLine(key: string, patch: Partial<RecipeLineState>) {
    setRecipeDirty(true);
    setRecipeLines((current) =>
      current.map((line) => {
        if (line.key !== key) return line;

        if (patch.component_product_id !== undefined) {
          const selectedProduct = products.find((product) => product.id === Number(patch.component_product_id));

          return {
            ...line,
            ...patch,
            component_name: selectedProduct?.name ?? line.component_name,
            uom_name: selectedProduct?.uom_name ?? line.uom_name,
            qty_available: selectedProduct?.qty_available ?? line.qty_available,
          };
        }

        return { ...line, ...patch };
      }),
    );
  }

  function removeRecipeLine(key: string) {
    setRecipeDirty(true);
    setRecipeLines((current) => current.filter((line) => line.key !== key));
  }

  function buildRecipeRequest() {
    return {
      lines: recipeLines.map((line, index) => {
        const componentProductId = Number(line.component_product_id);
        const quantity = Number(line.quantity);

        if (!Number.isInteger(componentProductId) || componentProductId <= 0) {
          throw new Error(`Орц #${index + 1}: агуулахын бараа сонгоно уу.`);
        }

        if (!Number.isFinite(quantity) || quantity <= 0) {
          throw new Error(`Орц #${index + 1}: тоо хэмжээ 0-ээс их байх ёстой.`);
        }

        return {
          component_product_id: componentProductId,
          quantity,
        };
      }),
    };
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = form.name.trim();
    const salePrice = Number(form.sale_price);

    if (!name) {
      setFormError("Барааны нэр оруулна уу.");
      return;
    }

    if (!Number.isFinite(salePrice) || salePrice < 0) {
      setFormError("Үнэ 0 эсвэл түүнээс их тоо байх ёстой.");
      return;
    }

    let recipeRequest: ReturnType<typeof buildRecipeRequest> | null = null;

    try {
      if (recipeDirty) {
        recipeRequest = buildRecipeRequest();
      }
    } catch (recipeValidationError) {
      setFormError(getReadableError(recipeValidationError));
      return;
    }

    setSaving(true);
    setFormError(null);

    try {
      const body: ProductFormRequest = {
        name,
        sale_price: salePrice,
        barcode: form.barcode.trim() || null,
        default_code: form.default_code.trim() || null,
        category: form.category.trim() || null,
        description: form.description.trim() || null,
        image_base64: form.image_base64,
        available_for_sale: form.available_for_sale,
        is_storable: form.is_storable,
        uom_id: form.uom_id ? Number(form.uom_id) : null,
      };
      const response = editingProduct
        ? await updateKassProduct(editingProduct.id, body)
        : await createKassProduct(body);
      const savedProductId = response.product.id;

      if (recipeRequest && savedProductId) {
        await updateProductRecipe(savedProductId, recipeRequest);
      }

      setModalOpen(false);
      setEditingProduct(null);
      setForm(emptyForm);
      setRecipeLines([]);
      setRecipeDirty(false);
      await loadProducts();
    } catch (saveError) {
      setFormError(getReadableError(saveError));
    } finally {
      setSaving(false);
    }
  }

  async function handleArchive(product: KassProduct) {
    const ok = window.confirm(`${product.name} барааг борлуулалтаас хасах уу?`);
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

  async function handleVisibilityChange(product: KassProduct, nextVisible: boolean) {
    const previousVisible = product.available_for_sale !== false;

    setVisibilitySavingId(product.id);
    setError(null);
    setProducts((current) =>
      current.map((item) => (item.id === product.id ? { ...item, available_for_sale: nextVisible } : item)),
    );

    try {
      const response = await updateKassProduct(product.id, { available_for_sale: nextVisible });
      setProducts((current) =>
        current.map((item) => (item.id === product.id ? response.product : item)),
      );
    } catch (visibilityError) {
      setProducts((current) =>
        current.map((item) => (item.id === product.id ? { ...item, available_for_sale: previousVisible } : item)),
      );
      setError(getReadableError(visibilityError));
    } finally {
      setVisibilitySavingId(null);
    }
  }

  function openStockModal(product: KassProduct) {
    if (isProductionProduct(product)) {
      setError("Үйлдвэрлэлийн бараанд шууд үлдэгдэл хөтлөхгүй. Орлого авахдаа агуулахын түүхий эд эсвэл агуулахын бараагаа сонгоно уу.");
      return;
    }

    setStockProduct(product);
    setStockForm(emptyStockForm);
    setStockError(null);
    setError(null);
  }

  async function handleStockSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!stockProduct) return;

    if (isProductionProduct(stockProduct)) {
      setStockError("Энэ бараанд агуулахын үлдэгдэл хөтлөхгүй. Эхлээд барааны тохиргооноос агуулахын үлдэгдэл хөтлөхийг идэвхжүүлнэ үү.");
      return;
    }

    const quantity = Number(stockForm.quantity);
    const unitCost = stockForm.unit_cost.trim() ? Number(stockForm.unit_cost) : null;
    const partnerId = stockForm.partner_id ? Number(stockForm.partner_id) : null;

    if (!Number.isFinite(quantity) || quantity <= 0) {
      setStockError("Орлого авах тоо хэмжээ 0-ээс их байх ёстой.");
      return;
    }

    if (unitCost !== null && (!Number.isFinite(unitCost) || unitCost < 0)) {
      setStockError("Нэгж өртөг 0 эсвэл түүнээс их байх ёстой.");
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
    } catch (error) {
      setStockError(getReadableError(error));
    } finally {
      setStockSaving(false);
    }
  }

  const categorySelectValue =
    customCategoryMode || (form.category.trim() && !categoryOptions.includes(form.category.trim()))
      ? "__custom__"
      : form.category;

  return (
    <div className="page-stack">
      <section className="content-panel">
        <div className="panel-toolbar">
          <div>
            <p className="eyebrow">Каталог</p>
            <div className="heading-line">
              <h2>Барааны жагсаалт</h2>
              {!loading ? <span className="soft-pill">{filtered.length} илэрц</span> : null}
            </div>
          </div>
          <div className="toolbar-actions">
            <button
              className="secondary-button"
              type="button"
              onClick={refreshCatalog}
              disabled={loading || categoriesLoading || uomsLoading || partnersLoading}
            >
              <RefreshCcw size={16} aria-hidden="true" />
              <span>Шинэчлэх</span>
            </button>
            <button className="primary-button" type="button" onClick={openCreateModal} data-testid="product-create-button">
              <Plus size={16} aria-hidden="true" />
              <span>Бараа нэмэх</span>
            </button>
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

        <div className="filter-tabs product-view-tabs" role="tablist" aria-label="Барааны төрөл">
          {viewOptions.map((option) => {
            const Icon = option.icon;
            const active = viewFilter === option.key;

            return (
              <button
                key={option.key}
                className={active ? "filter-tab active" : "filter-tab"}
                type="button"
                onClick={() => setViewFilter(option.key)}
                data-testid={`product-view-${option.key}`}
              >
                <Icon size={16} aria-hidden="true" />
                <span>{option.label}</span>
                <strong>{option.count}</strong>
              </button>
            );
          })}
        </div>

        {error ? (
          <div className="state-box error-state">
            <strong>Барааны мэдээлэл боловсруулахад алдаа гарлаа</strong>
            <p>{error}</p>
          </div>
        ) : null}

        <div className="table-wrap">
          <table className="data-table product-table">
            <thead>
              <tr>
                <th>Зураг</th>
                <th>Нэр</th>
                <th>Ангилал</th>
                <th>Дотоод код</th>
                <th>Баркод</th>
                <th>Нэгж</th>
                <th>Үнэ</th>
                <th>Касс</th>
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
                        {product.description ? <small className="table-subtext">{product.description}</small> : null}
                      </td>
                      <td>{product.category || "Ангилалгүй"}</td>
                      <td>{product.default_code || "Кодгүй"}</td>
                      <td>{product.barcode || "Баркодгүй"}</td>
                      <td>{formatUnitName(product.uom_name)}</td>
                      <td>{formatMoney(product.sale_price)}</td>
                      <td>
                        <label className="table-checkbox">
                          <input
                            type="checkbox"
                            checked={product.available_for_sale !== false}
                            disabled={visibilitySavingId === product.id}
                            onChange={(event) => handleVisibilityChange(product, event.target.checked)}
                            data-testid={`product-visibility-${product.id}`}
                          />
                          <span>{product.available_for_sale === false ? "Харагдахгүй" : "Харагдана"}</span>
                        </label>
                      </td>
                      <td>
                        <div className="table-actions">
                          <button className="icon-button" type="button" onClick={() => openEditModal(product)} aria-label="Засах">
                            <Edit3 size={16} aria-hidden="true" />
                          </button>
                          <button
                            className="icon-button danger"
                            type="button"
                            onClick={() => handleArchive(product)}
                            disabled={deletingId === product.id}
                            aria-label="Хасах"
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
                  <td colSpan={9}>Бараа олдсонгүй.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {modalOpen ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="product-form-title">
          <form className="modal-card product-modal" onSubmit={handleSubmit} data-testid="product-modal">
            <button className="icon-button modal-close" type="button" aria-label="Хаах" onClick={() => setModalOpen(false)}>
              <X size={18} aria-hidden="true" />
            </button>
            <p className="eyebrow">Odoo бараа</p>
            <h2 id="product-form-title">{editingProduct ? "Бараа засах" : "Бараа нэмэх"}</h2>

            <div className="product-form-layout">
              <div className="image-upload-box">
                {form.image_preview ? (
                  <img className="image-preview" src={form.image_preview} alt="Барааны зураг" />
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
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleImageChange}
                      data-testid="product-image-input"
                    />
                  </label>
                  {form.image_preview ? (
                    <button className="secondary-button" type="button" onClick={removeImage}>
                      Зураг арилгах
                    </button>
                  ) : null}
                </div>
              </div>

              <div className="product-fields">
                <label className="field">
                  <span>Барааны нэр</span>
                  <input
                    type="text"
                    value={form.name}
                    onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                    placeholder="Жишээ: Латте"
                  />
                </label>

                <div className="form-grid two-columns">
                  <label className="field">
                    <span>Үнэ</span>
                    <input
                      type="number"
                      min="0"
                      inputMode="numeric"
                      value={form.sale_price}
                      onChange={(event) => setForm((current) => ({ ...current, sale_price: event.target.value }))}
                      placeholder="0"
                    />
                  </label>

                  <label className="field">
                    <span>Дотоод код</span>
                    <input
                      type="text"
                      value={form.default_code}
                      onChange={(event) => setForm((current) => ({ ...current, default_code: event.target.value }))}
                      placeholder="Жишээ: COFFEE-LATTE"
                    />
                  </label>
                </div>

                <label className="field">
                  <span>Хэмжих нэгж</span>
                  <select
                    value={form.uom_id}
                    onChange={(event) => setForm((current) => ({ ...current, uom_id: event.target.value }))}
                    disabled={uomsLoading}
                    data-testid="product-uom-select"
                  >
                    <option value="">Odoo default нэгж</option>
                    {uomOptions.map((uom) => (
                      <option key={uom.id} value={uom.id}>
                        {formatUnitName(uom.display_name)}
                        {uom.category_name ? ` (${uom.category_name})` : ""}
                      </option>
                    ))}
                  </select>
                  {uomError ? (
                    <small className="field-help error">{uomError}</small>
                  ) : (
                    <small className="field-help">
                      Кофены үр, нунтаг зэрэг агуулахын бараанд кг/гр зэрэг зөв нэгжийг сонгоно.
                    </small>
                  )}
                </label>

                <div className="form-grid two-columns">
                  <label className="field">
                    <span>Ангилал</span>
                    <select
                      value={categorySelectValue}
                      onChange={(event) => handleCategorySelect(event.target.value)}
                      disabled={categoriesLoading}
                    >
                      <option value="">Ангилалгүй</option>
                      {categoryOptions.map((category) => (
                        <option key={category} value={category}>
                          {category}
                        </option>
                      ))}
                      <option value="__custom__">+ Шинэ ангилал бичих</option>
                    </select>
                    {categoryError ? (
                      <small className="field-help error">{categoryError}</small>
                    ) : (
                      <small className="field-help">
                        {categoriesLoading ? "Odoo ангилал уншиж байна" : `${categoryOptions.length} ангилал`}
                      </small>
                    )}
                    {categorySelectValue === "__custom__" ? (
                      <input
                        type="text"
                        value={form.category}
                        onChange={(event) => setForm((current) => ({ ...current, category: event.target.value }))}
                        placeholder="Шинэ ангиллын нэр"
                      />
                    ) : null}
                  </label>

                  <label className="field">
                    <span>Баркод</span>
                    <input
                      type="text"
                      value={form.barcode}
                      onChange={(event) => setForm((current) => ({ ...current, barcode: event.target.value }))}
                      placeholder="Хоосон байж болно"
                    />
                  </label>
                </div>

                <label className="field">
                  <span>Тайлбар</span>
                  <textarea
                    value={form.description}
                    onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
                    placeholder="POS болон Odoo дээр харагдах богино тайлбар"
                  />
                </label>

                <label className="switch-field">
                  <input
                    type="checkbox"
                    checked={form.available_for_sale}
                    onChange={(event) => setForm((current) => ({ ...current, available_for_sale: event.target.checked }))}
                  />
                  <span>Касс дээр харагдах</span>
                </label>

                <label className="switch-field">
                  <input
                    type="checkbox"
                    checked={form.is_storable}
                    onChange={(event) => setForm((current) => ({ ...current, is_storable: event.target.checked }))}
                  />
                  <span>Агуулахын үлдэгдэл хөтлөх</span>
                </label>

                <div className="recipe-panel" data-testid="recipe-panel">
                  <div className="recipe-header">
                    <div>
                      <p className="eyebrow">Үйлдвэрлэл</p>
                      <h3>Орц / Жор</h3>
                    </div>
                    <button
                      className="secondary-button"
                      type="button"
                      onClick={addRecipeLine}
                      disabled={recipeLoading || ingredientOptions.length === 0}
                      data-testid="recipe-add-line"
                    >
                      <Plus size={16} aria-hidden="true" />
                      <span>Орц нэмэх</span>
                    </button>
                  </div>

                  <p className="muted-text small">
                    Нэг ширхэг бүтээгдэхүүн хийхэд зарцуулагдах агуулахын барааг сонгоно.
                  </p>

                  {recipeLoading ? <div className="row-skeleton" /> : null}
                  {recipeError ? <div className="form-error">{recipeError}</div> : null}

                  {!recipeLoading && ingredientOptions.length === 0 ? (
                    <div className="compact-empty">Агуулахын бараа алга байна.</div>
                  ) : null}

                  {!recipeLoading && ingredientOptions.length > 0 && recipeLines.length === 0 ? (
                    <div className="recipe-empty">Орц нэмээгүй байна.</div>
                  ) : null}

                  {!recipeLoading && recipeLines.length > 0 ? (
                    <div className="recipe-lines">
                      {recipeLines.map((line, index) => {
                        const selectedProduct = products.find((product) => product.id === Number(line.component_product_id));
                        const availableText =
                          selectedProduct || line.qty_available !== undefined
                            ? `${Number(selectedProduct?.qty_available ?? line.qty_available ?? 0).toLocaleString("mn-MN")} ${
                                formatUnitName(selectedProduct?.uom_name ?? line.uom_name)
                              }`.trim()
                            : null;

                        return (
                          <div className="recipe-line" key={line.key}>
                            <label className="field recipe-ingredient-field">
                              <span>Орц {index + 1}</span>
                              <select
                                value={line.component_product_id}
                                onChange={(event) =>
                                  updateRecipeLine(line.key, { component_product_id: event.target.value })
                                }
                                data-testid={`recipe-component-${index}`}
                              >
                                <option value="">Агуулахын бараа сонгох</option>
                                {ingredientOptions.map((product) => (
                                  <option key={product.id} value={product.id}>
                                    {product.name}
                                  </option>
                                ))}
                              </select>
                              {availableText ? <small className="field-help">Үлдэгдэл: {availableText}</small> : null}
                            </label>

                            <label className="field recipe-quantity-field">
                              <span>Тоо хэмжээ</span>
                              <input
                                type="number"
                                min="0.000001"
                                step="any"
                                inputMode="decimal"
                                value={line.quantity}
                                onChange={(event) => updateRecipeLine(line.key, { quantity: event.target.value })}
                                data-testid={`recipe-quantity-${index}`}
                              />
                            </label>

                            <button
                              className="icon-button danger recipe-remove-button"
                              type="button"
                              onClick={() => removeRecipeLine(line.key)}
                              aria-label="Орц хасах"
                              title="Орц хасах"
                              data-testid={`recipe-remove-${index}`}
                            >
                              <Trash2 size={16} aria-hidden="true" />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  ) : null}
                </div>
              </div>
            </div>

            {formError ? <div className="form-error">{formError}</div> : null}

            <div className="modal-actions">
              <button className="secondary-button" type="button" onClick={() => setModalOpen(false)} disabled={saving}>
                Болих
              </button>
              <button className="primary-button" type="submit" disabled={saving || recipeLoading}>
                <Save size={17} aria-hidden="true" />
                <span>{saving ? "Хадгалж байна" : "Хадгалах"}</span>
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {stockProduct ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="stock-form-title">
          <form className="modal-card narrow-modal" onSubmit={handleStockSubmit} data-testid="stock-in-modal">
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
              <strong>Одоогийн үлдэгдэл: {stockQuantityText(stockProduct)}</strong>
            </div>

            {!stockProduct.is_storable ? (
              <div className="inline-warning">
                Энэ бараанд агуулахын үлдэгдэл хөтлөхгүй. Орлого авахын өмнө барааны тохиргооноос агуулахын үлдэгдэл хөтлөхийг идэвхжүүлнэ үү.
              </div>
            ) : null}

            <div className="form-grid two-columns">
              <label className="field">
                <span>Тоо хэмжээ</span>
                <input
                  type="number"
                  min="0.000001"
                  step="any"
                  inputMode="decimal"
                  value={stockForm.quantity}
                  onChange={(event) => setStockForm((current) => ({ ...current, quantity: event.target.value }))}
                />
              </label>
              <label className="field">
                <span>Нэгж өртөг</span>
                <input
                  type="number"
                  min="0"
                  step="any"
                  inputMode="decimal"
                  value={stockForm.unit_cost}
                  onChange={(event) => setStockForm((current) => ({ ...current, unit_cost: event.target.value }))}
                  placeholder="Заавал биш"
                />
              </label>
            </div>

            <label className="field">
              <span>Харилцагч</span>
              <select
                value={stockForm.partner_id}
                onChange={(event) => setStockForm((current) => ({ ...current, partner_id: event.target.value }))}
                disabled={partnersLoading}
                data-testid="stock-partner-select"
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
                  {partnersLoading
                    ? "Харилцагч уншиж байна"
                    : "Сонгохгүй бол энгийн үлдэгдлийн тохируулгаар бүртгэнэ."}
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
              <button className="primary-button" type="submit" disabled={stockSaving || isProductionProduct(stockProduct)}>
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
