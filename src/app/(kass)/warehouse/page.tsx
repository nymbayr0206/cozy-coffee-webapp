"use client";

import { FormEvent, useEffect, useMemo, useState, type ChangeEvent } from "react";
import {
  AlertTriangle,
  Boxes,
  ClipboardList,
  Edit3,
  ImageIcon,
  Package,
  PackagePlus,
  Plus,
  RefreshCcw,
  RotateCcw,
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
  deleteProductCategory,
  formatMoney,
  formatUnitName,
  getPartners,
  getProductStockUsage,
  getProducts,
  getReadableError,
  getProductUoms,
  getStockReceipts,
  getWarehouseCategories,
  receiveKassProductStock,
  returnStockReceipt,
  updateStockReceipt,
  updateKassProduct,
} from "@/lib/kass/client-api";
import type {
  KassCategory,
  KassPartner,
  KassProduct,
  KassStockReceipt,
  KassUom,
  ProductFormRequest,
  ProductStockUsageResponse,
  StockReceiptPaymentMethod,
} from "@/lib/kass/client-types";

type WarehouseView = "stock" | "receipts" | "receipt-report" | "categories";

const emptyStockForm = {
  quantity: "1",
  unit_cost: "",
  uom_id: "",
  partner_id: "",
  payment_method: "credit" as StockReceiptPaymentMethod,
  paid_amount: "",
  credit_amount: "",
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

function quantityText(quantity: number) {
  return Number(quantity).toLocaleString("mn-MN", { maximumFractionDigits: 3 });
}

function formatDateTime(value?: string | null) {
  if (!value) return "Байхгүй";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("mn-MN", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function stockPaymentLabel(method?: StockReceiptPaymentMethod | string | null) {
  if (method === "cash") return "Бэлэн";
  if (method === "credit") return "Зээлээр";
  if (method === "mixed") return "Хувааж";
  return "Тодорхойгүй";
}

function inferReceiptPaidAmount(receipt: KassStockReceipt) {
  if (receipt.paid_amount !== undefined) return Number(receipt.paid_amount ?? 0);
  if (receipt.payment_method === "credit") return 0;
  return Number(receipt.total_cost ?? 0);
}

function inferReceiptCreditAmount(receipt: KassStockReceipt) {
  if (receipt.credit_amount !== undefined) return Number(receipt.credit_amount ?? 0);
  if (receipt.payment_method === "credit") return Number(receipt.total_cost ?? 0);
  return 0;
}

function resolveStockPayment(
  form: typeof emptyStockForm,
  totalCost: number,
): { payment_method: StockReceiptPaymentMethod; paid_amount: number; credit_amount: number } {
  if (form.payment_method === "cash") {
    return { payment_method: "cash", paid_amount: totalCost, credit_amount: 0 };
  }

  if (form.payment_method === "credit") {
    return { payment_method: "credit", paid_amount: 0, credit_amount: totalCost };
  }

  const paidAmount = Number(form.paid_amount || 0);
  const creditAmount = Number(form.credit_amount || 0);

  return {
    payment_method: paidAmount > 0 && creditAmount > 0 ? "mixed" : paidAmount > 0 ? "cash" : "credit",
    paid_amount: Math.round(paidAmount * 100) / 100,
    credit_amount: Math.round(creditAmount * 100) / 100,
  };
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

function isSalePointProduct(product: KassProduct) {
  return product.available_for_sale !== false && Boolean(product.pos_category_ids?.length || product.pos_categories?.length);
}

function isManufacturedProduct(product: KassProduct) {
  return product.has_bom === true;
}

export default function WarehousePage() {
  const [products, setProducts] = useState<KassProduct[]>([]);
  const [categories, setCategories] = useState<KassCategory[]>([]);
  const [uoms, setUoms] = useState<KassUom[]>([]);
  const [partners, setPartners] = useState<KassPartner[]>([]);
  const [stockReceipts, setStockReceipts] = useState<KassStockReceipt[]>([]);
  const [activeView, setActiveView] = useState<WarehouseView>("stock");
  const [showFinishedOnly, setShowFinishedOnly] = useState(false);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [categoriesLoading, setCategoriesLoading] = useState(true);
  const [uomsLoading, setUomsLoading] = useState(true);
  const [partnersLoading, setPartnersLoading] = useState(true);
  const [receiptsLoading, setReceiptsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [categoryError, setCategoryError] = useState<string | null>(null);
  const [uomError, setUomError] = useState<string | null>(null);
  const [partnerError, setPartnerError] = useState<string | null>(null);
  const [receiptError, setReceiptError] = useState<string | null>(null);
  const [stockProduct, setStockProduct] = useState<KassProduct | null>(null);
  const [usageProduct, setUsageProduct] = useState<KassProduct | null>(null);
  const [stockUsage, setStockUsage] = useState<ProductStockUsageResponse | null>(null);
  const [usageLoading, setUsageLoading] = useState(false);
  const [usageError, setUsageError] = useState<string | null>(null);
  const [stockForm, setStockForm] = useState(emptyStockForm);
  const [stockSaving, setStockSaving] = useState(false);
  const [stockError, setStockError] = useState<string | null>(null);
  const [editingReceipt, setEditingReceipt] = useState<KassStockReceipt | null>(null);
  const [receiptForm, setReceiptForm] = useState(emptyStockForm);
  const [receiptSaving, setReceiptSaving] = useState(false);
  const [returningReceiptId, setReturningReceiptId] = useState<string | null>(null);
  const [productModalOpen, setProductModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<KassProduct | null>(null);
  const [productForm, setProductForm] = useState(emptyWarehouseProductForm);
  const [productSaving, setProductSaving] = useState(false);
  const [productFormError, setProductFormError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [deletingCategoryId, setDeletingCategoryId] = useState<number | null>(null);
  const [categoryModalOpen, setCategoryModalOpen] = useState(false);
  const [categoryForm, setCategoryForm] = useState(emptyCategoryForm);
  const [categorySaving, setCategorySaving] = useState(false);
  const [categoryFormError, setCategoryFormError] = useState<string | null>(null);

  async function loadProducts() {
    setLoading(true);
    setError(null);

    try {
      const response = await getProducts("stock");
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

  async function loadStockReceipts() {
    setReceiptsLoading(true);
    setReceiptError(null);

    try {
      const response = await getStockReceipts({ status: "all" });
      setStockReceipts(response.receipts ?? []);
    } catch (loadError) {
      setReceiptError(getReadableError(loadError));
      setStockReceipts([]);
    } finally {
      setReceiptsLoading(false);
    }
  }

  async function refreshWarehouse() {
    await Promise.all([loadProducts(), loadCategories(), loadUoms(), loadPartners(), loadStockReceipts()]);
  }

  useEffect(() => {
    void refreshWarehouse();
  }, []);

  const stockProducts = useMemo(
    () => products.filter((product) => product.is_storable === true && !isSalePointProduct(product) && !isManufacturedProduct(product)),
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
  const stockUomOptions = useMemo(() => {
    if (!stockProduct) return [];

    const productUom = uomOptions.find((uom) => uom.id === stockProduct.uom_id);
    if (!productUom?.category_id) return productUom ? [productUom] : [];

    return uomOptions.filter((uom) => uom.category_id === productUom.category_id);
  }, [stockProduct, uomOptions]);

  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const visibleProducts = showFinishedOnly ? stockProducts.filter(isLowStock) : stockProducts;
    if (!normalizedQuery) return visibleProducts;

    return visibleProducts.filter((product) =>
      `${product.name} ${product.barcode ?? ""} ${product.category ?? ""}`
        .toLowerCase()
        .includes(normalizedQuery),
    );
  }, [query, showFinishedOnly, stockProducts]);

  const categoryProductCounts = useMemo(() => {
    const nextCounts = new Map<number, number>();

    categories.forEach((category) => {
      const names = new Set(
        [category.display_name, category.name]
          .filter(Boolean)
          .map((name) => name.trim().toLowerCase()),
      );
      const count = stockProducts.filter((product) => {
        const productCategory = product.category?.trim().toLowerCase();
        return Boolean(productCategory && names.has(productCategory));
      }).length;
      nextCounts.set(category.id, count);
    });

    return nextCounts;
  }, [categories, stockProducts]);

  const filteredCategories = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return categories;

    return categories.filter((category) =>
      `${category.display_name} ${category.name} ${category.parent_name ?? ""}`
        .toLowerCase()
        .includes(normalizedQuery),
    );
  }, [categories, query]);

  const filteredReceipts = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return stockReceipts;

    return stockReceipts.filter((receipt) =>
      `${receipt.product_name} ${receipt.partner_name ?? ""} ${receipt.note ?? ""} ${receipt.odoo_receipt_name ?? ""}`
        .toLowerCase()
        .includes(normalizedQuery),
    );
  }, [query, stockReceipts]);

  const summary = useMemo(
    () => ({
      totalItems: stockProducts.length,
      lowStock: stockProducts.filter(isLowStock).length,
      totalValue: stockProducts.reduce(
        (sum, product) => sum + Number(product.qty_available ?? 0) * Number(product.cost_price ?? 0),
        0,
      ),
    }),
    [stockProducts],
  );

  const receiptSummary = useMemo(
    () => {
      const activeReceipts = stockReceipts.filter((receipt) => receipt.status === "active");
      const byPartner = new Map<
        string,
        {
          partnerName: string;
          totalCost: number;
          paidAmount: number;
          creditAmount: number;
          count: number;
        }
      >();

      activeReceipts.forEach((receipt) => {
        const key = receipt.partner_id ? String(receipt.partner_id) : "none";
        const current =
          byPartner.get(key) ?? {
            partnerName: receipt.partner_name || "Харилцагчгүй",
            totalCost: 0,
            paidAmount: 0,
            creditAmount: 0,
            count: 0,
          };
        current.totalCost += Number(receipt.total_cost ?? 0);
        current.paidAmount += inferReceiptPaidAmount(receipt);
        current.creditAmount += inferReceiptCreditAmount(receipt);
        current.count += 1;
        byPartner.set(key, current);
      });

      return {
        activeCount: activeReceipts.length,
        returnedCount: stockReceipts.filter((receipt) => receipt.status === "returned").length,
        totalCost: activeReceipts.reduce((sum, receipt) => sum + Number(receipt.total_cost ?? 0), 0),
        paidAmount: activeReceipts.reduce((sum, receipt) => sum + inferReceiptPaidAmount(receipt), 0),
        creditAmount: activeReceipts.reduce((sum, receipt) => sum + inferReceiptCreditAmount(receipt), 0),
        byPartner: Array.from(byPartner.values()).sort((a, b) => b.creditAmount - a.creditAmount || b.totalCost - a.totalCost),
      };
    },
    [stockReceipts],
  );

  const activeResultCount =
    activeView === "categories"
      ? filteredCategories.length
      : activeView === "receipts" || activeView === "receipt-report"
        ? filteredReceipts.length
        : filtered.length;
  const activeStockUom =
    stockUomOptions.find((uom) => String(uom.id) === stockForm.uom_id) ??
    stockUomOptions.find((uom) => uom.id === stockProduct?.uom_id);
  const activeStockUnitName = stockProduct
    ? formatUnitName(activeStockUom?.display_name ?? stockProduct.uom_name)
    : "нэгж";
  const stockFormTotalCost =
    Number.isFinite(Number(stockForm.quantity)) && Number.isFinite(Number(stockForm.unit_cost))
      ? Number(stockForm.quantity) * Number(stockForm.unit_cost)
      : 0;
  const receiptFormTotalCost =
    Number.isFinite(Number(receiptForm.quantity)) && Number.isFinite(Number(receiptForm.unit_cost))
      ? Number(receiptForm.quantity) * Number(receiptForm.unit_cost)
      : 0;

  function showStockProducts(finishedOnly = false) {
    setActiveView("stock");
    setShowFinishedOnly(finishedOnly);
  }

  function openStockModal(product: KassProduct) {
    setStockProduct(product);
    setStockForm({
      ...emptyStockForm,
      uom_id: product.uom_id ? String(product.uom_id) : "",
      unit_cost: Number(product.cost_price ?? 0) > 0 ? String(product.cost_price) : "",
    });
    setStockError(null);
    setError(null);
  }

  async function openUsageModal(product: KassProduct) {
    setUsageProduct(product);
    setStockUsage(null);
    setUsageError(null);
    setUsageLoading(true);

    try {
      const response = await getProductStockUsage(product.id);
      setStockUsage(response);
    } catch (loadError) {
      setUsageError(getReadableError(loadError));
    } finally {
      setUsageLoading(false);
    }
  }

  function closeUsageModal() {
    setUsageProduct(null);
    setStockUsage(null);
    setUsageError(null);
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

  function openReceiptEditModal(receipt: KassStockReceipt) {
    setEditingReceipt(receipt);
    setReceiptForm({
      quantity: String(receipt.quantity),
      unit_cost: String(receipt.unit_cost),
      uom_id: receipt.uom_id ? String(receipt.uom_id) : "",
      partner_id: receipt.partner_id ? String(receipt.partner_id) : "",
      payment_method: receipt.payment_method ?? "cash",
      paid_amount: String(inferReceiptPaidAmount(receipt)),
      credit_amount: String(inferReceiptCreditAmount(receipt)),
      note: receipt.note ?? "",
    });
    setReceiptError(null);
  }

  function closeReceiptEditModal() {
    if (receiptSaving) return;
    setEditingReceipt(null);
    setReceiptForm(emptyStockForm);
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

  async function handleCategoryDelete(category: KassCategory) {
    const productCount = Number(categoryProductCounts.get(category.id) ?? 0);
    if (productCount > 0) {
      setCategoryError("Энэ ангилалд агуулахын бараа оноогдсон байна. Эхлээд тухайн бараануудын ангиллыг солино уу.");
      return;
    }

    const ok = window.confirm(`${category.display_name} ангиллыг устгах уу?`);
    if (!ok) return;

    setDeletingCategoryId(category.id);
    setCategoryError(null);

    try {
      await deleteProductCategory(category.id, "warehouse");
      setCategories((current) => current.filter((item) => item.id !== category.id));
      await loadCategories();
    } catch (deleteError) {
      setCategoryError(getReadableError(deleteError));
    } finally {
      setDeletingCategoryId(null);
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
    const uomId = stockForm.uom_id ? Number(stockForm.uom_id) : null;
    const partnerId = stockForm.partner_id ? Number(stockForm.partner_id) : null;
    const totalCost = Math.round(quantity * unitCost * 100) / 100;
    const payment = resolveStockPayment(stockForm, totalCost);

    if (!Number.isFinite(quantity) || quantity <= 0) {
      setStockError("Орлого авах тоо хэмжээ 0-ээс их байх ёстой.");
      return;
    }

    if (!Number.isFinite(unitCost) || unitCost <= 0) {
      setStockError("Нэгж өртөг 0-ээс их байх ёстой.");
      return;
    }

    if (uomId !== null && (!Number.isInteger(uomId) || uomId <= 0)) {
      setStockError("Хэмжих нэгжийн сонголт буруу байна.");
      return;
    }

    if (partnerId !== null && (!Number.isInteger(partnerId) || partnerId <= 0)) {
      setStockError("Харилцагчийн сонголт буруу байна.");
      return;
    }

    if (Math.abs(payment.paid_amount + payment.credit_amount - totalCost) > 0.01) {
      setStockError("Бэлэн болон зээлийн дүн нийлээд нийт өртөгтэй тэнцэх ёстой.");
      return;
    }

    setStockSaving(true);
    setStockError(null);

    try {
      const result = await receiveKassProductStock(stockProduct.id, {
        quantity,
        unit_cost: unitCost,
        uom_id: uomId,
        partner_id: partnerId,
        ...payment,
        note: stockForm.note.trim() || null,
      });

      setProducts((current) =>
        current.map((product) => (product.id === result.product.id ? result.product : product)),
      );
      setStockProduct(null);
      setStockForm(emptyStockForm);
      await loadProducts();
      await loadStockReceipts();
    } catch (saveError) {
      setStockError(getReadableError(saveError));
    } finally {
      setStockSaving(false);
    }
  }

  async function handleReceiptSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingReceipt) return;

    const quantity = Number(receiptForm.quantity);
    const unitCost = Number(receiptForm.unit_cost);
    const partnerId = receiptForm.partner_id ? Number(receiptForm.partner_id) : null;
    const partner = partnerId ? partners.find((item) => item.id === partnerId) : null;
    const totalCost = Math.round(quantity * unitCost * 100) / 100;
    const payment = resolveStockPayment(receiptForm, totalCost);

    if (!Number.isFinite(quantity) || quantity <= 0) {
      setReceiptError("Орлогын тоо хэмжээ 0-ээс их байх ёстой.");
      return;
    }

    if (!Number.isFinite(unitCost) || unitCost <= 0) {
      setReceiptError("Нэгж өртөг 0-ээс их байх ёстой.");
      return;
    }

    if (partnerId !== null && (!Number.isInteger(partnerId) || partnerId <= 0)) {
      setReceiptError("Харилцагчийн сонголт буруу байна.");
      return;
    }

    if (Math.abs(payment.paid_amount + payment.credit_amount - totalCost) > 0.01) {
      setReceiptError("Бэлэн болон зээлийн дүн нийлээд нийт өртөгтэй тэнцэх ёстой.");
      return;
    }

    setReceiptSaving(true);
    setReceiptError(null);

    try {
      const result = await updateStockReceipt(editingReceipt.receipt_id, {
        quantity,
        unit_cost: unitCost,
        partner_id: partnerId,
        partner_name: partner?.name ?? null,
        ...payment,
        note: receiptForm.note.trim() || null,
      });

      setStockReceipts((current) =>
        current.map((receipt) => (receipt.receipt_id === result.receipt.receipt_id ? result.receipt : receipt)),
      );
      setProducts((current) =>
        current.map((product) => (product.id === result.product.id ? result.product : product)),
      );
      setEditingReceipt(null);
      setReceiptForm(emptyStockForm);
      await loadProducts();
      await loadStockReceipts();
    } catch (saveError) {
      setReceiptError(getReadableError(saveError));
    } finally {
      setReceiptSaving(false);
    }
  }

  async function handleReceiptReturn(receipt: KassStockReceipt) {
    const ok = window.confirm(`${receipt.product_name} орлогыг буцааж, үлдэгдлээс ${quantityText(receipt.quantity)} нэгж хасах уу?`);
    if (!ok) return;

    setReturningReceiptId(receipt.receipt_id);
    setReceiptError(null);

    try {
      const result = await returnStockReceipt(receipt.receipt_id);
      setStockReceipts((current) =>
        current.map((item) => (item.receipt_id === result.receipt.receipt_id ? result.receipt : item)),
      );
      setProducts((current) =>
        current.map((product) => (product.id === result.product.id ? result.product : product)),
      );
      await loadProducts();
      await loadStockReceipts();
    } catch (returnError) {
      setReceiptError(getReadableError(returnError));
    } finally {
      setReturningReceiptId(null);
    }
  }

  return (
    <div className="page-stack" data-testid="warehouse-page">
      <section className="content-panel">
        <div className="panel-toolbar">
          <div>
            <p className="eyebrow">Агуулах</p>
            <div className="heading-line">
              <h2>
                {activeView === "categories"
                  ? "Агуулахын ангилал"
                  : activeView === "receipts"
                    ? "Орлогын түүх"
                    : activeView === "receipt-report"
                      ? "Орлогын тайлан"
                    : showFinishedOnly
                      ? "Дууссан бараа"
                    : "Үлдэгдэл ба орлого"}
              </h2>
              {!loading && !categoriesLoading ? <span className="soft-pill">{activeResultCount} илэрц</span> : null}
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
              disabled={loading || partnersLoading || categoriesLoading || uomsLoading || receiptsLoading}
            >
              <RefreshCcw size={16} aria-hidden="true" />
              <span>{loading ? "Уншиж байна" : "Шинэчлэх"}</span>
            </button>
          </div>
        </div>

        <div className="filter-tabs warehouse-view-tabs" role="tablist" aria-label="Агуулахын харагдац">
          <button
            className={activeView === "stock" ? "filter-tab active" : "filter-tab"}
            type="button"
            role="tab"
            aria-selected={activeView === "stock"}
            onClick={() => showStockProducts(false)}
            data-testid="warehouse-stock-tab"
          >
            <Warehouse size={16} aria-hidden="true" />
            <span>Агуулахын бараа</span>
            <strong>{stockProducts.length}</strong>
          </button>
          <button
            className={activeView === "receipts" ? "filter-tab active" : "filter-tab"}
            type="button"
            role="tab"
            aria-selected={activeView === "receipts"}
            onClick={() => setActiveView("receipts")}
            data-testid="warehouse-receipts-tab"
          >
            <ClipboardList size={16} aria-hidden="true" />
            <span>Орлогын түүх</span>
            <strong>{stockReceipts.length}</strong>
          </button>
          <button
            className={activeView === "receipt-report" ? "filter-tab active" : "filter-tab"}
            type="button"
            role="tab"
            aria-selected={activeView === "receipt-report"}
            onClick={() => setActiveView("receipt-report")}
            data-testid="warehouse-receipt-report-tab"
          >
            <ClipboardList size={16} aria-hidden="true" />
            <span>Орлогын тайлан</span>
            <strong>{receiptSummary.activeCount}</strong>
          </button>
          <button
            className={activeView === "categories" ? "filter-tab active" : "filter-tab"}
            type="button"
            role="tab"
            aria-selected={activeView === "categories"}
            onClick={() => setActiveView("categories")}
            data-testid="warehouse-category-tab"
          >
            <Tags size={16} aria-hidden="true" />
            <span>Ангилал</span>
            <strong>{categories.length}</strong>
          </button>
        </div>

        <div className="report-kpi-grid warehouse-kpi-grid">
          <div className="metric strong-metric">
            <Warehouse size={22} aria-hidden="true" />
            <span>Агуулахын бараа</span>
            <strong>{summary.totalItems}</strong>
          </div>
          <div className="metric">
            <Boxes size={22} aria-hidden="true" />
            <span>Нийт үлдэгдэл дүн</span>
            <strong>{formatMoney(summary.totalValue)}</strong>
          </div>
          <button
            className={showFinishedOnly && activeView === "stock" ? "metric metric-button active" : "metric metric-button"}
            type="button"
            onClick={() => showStockProducts(true)}
            aria-pressed={showFinishedOnly && activeView === "stock"}
            data-testid="warehouse-finished-filter-button"
          >
            <AlertTriangle size={22} aria-hidden="true" />
            <span>Дууссан бараа</span>
            <strong>{summary.lowStock}</strong>
          </button>
        </div>

        <label className="search-box list-search">
          <Search size={18} aria-hidden="true" />
          <input
            type="search"
            placeholder={
              activeView === "categories"
                ? "Ангиллын нэрээр хайх"
                : showFinishedOnly && activeView === "stock"
                  ? "Дууссан бараанаас хайх"
                : "Нэр, баркод, ангиллаар хайх"
            }
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

        {activeView === "stock" ? (
          <>
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
                          onClick={() => openUsageModal(product)}
                          data-testid={`warehouse-mobile-usage-${product.id}`}
                        >
                          <ClipboardList size={16} aria-hidden="true" />
                          <span>Зарцуулалт</span>
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
                <div className="state-box">{showFinishedOnly ? "Дууссан бараа алга байна." : "Агуулахын бараа олдсонгүй."}</div>
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
                                onClick={() => openUsageModal(product)}
                                aria-label="Зарцуулалт харах"
                                data-testid={`warehouse-usage-${product.id}`}
                              >
                                <ClipboardList size={16} aria-hidden="true" />
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
                      <td colSpan={8}>{showFinishedOnly ? "Дууссан бараа алга байна." : "Агуулахын бараа олдсонгүй."}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        ) : activeView === "receipts" ? (
          <>
            {receiptError ? <div className="inline-error">{receiptError}</div> : null}

            <div className="report-kpi-grid warehouse-receipt-metrics">
              <div className="metric strong-metric">
                <span>Идэвхтэй орлого</span>
                <strong>{receiptSummary.activeCount}</strong>
              </div>
              <div className="metric">
                <span>Буцаагдсан</span>
                <strong>{receiptSummary.returnedCount}</strong>
              </div>
              <div className="metric">
                <span>Нийт өртөг</span>
                <strong>{formatMoney(receiptSummary.totalCost)}</strong>
              </div>
              <div className="metric">
                <span>Бэлнээр</span>
                <strong>{formatMoney(receiptSummary.paidAmount)}</strong>
              </div>
              <div className="metric">
                <span>Зээлээр</span>
                <strong>{formatMoney(receiptSummary.creditAmount)}</strong>
              </div>
            </div>

            <div className="warehouse-card-list">
              {receiptsLoading ? (
                Array.from({ length: 5 }).map((_, index) => <div className="row-skeleton" key={index} />)
              ) : filteredReceipts.length > 0 ? (
                filteredReceipts.map((receipt) => {
                  const isReturned = receipt.status === "returned";

                  return (
                    <article className="warehouse-card" key={receipt.receipt_id}>
                      <span className="product-thumb placeholder" aria-hidden="true">
                        <ClipboardList size={18} />
                      </span>
                      <div className="warehouse-card-main">
                        <strong>{receipt.product_name}</strong>
                        <span>{formatDateTime(receipt.created_at)}</span>
                        <div className="warehouse-card-meta">
                          <span>Тоо: {quantityText(receipt.quantity)} {formatUnitName(receipt.uom_name)}</span>
                          <span>Нэгж өртөг: {formatMoney(receipt.unit_cost)} / {formatUnitName(receipt.uom_name)}</span>
                          <span>Нийт: {formatMoney(receipt.total_cost)}</span>
                          <span>Төлбөр: {stockPaymentLabel(receipt.payment_method ?? (inferReceiptCreditAmount(receipt) > 0 ? "credit" : "cash"))}</span>
                          <span>Бэлэн: {formatMoney(inferReceiptPaidAmount(receipt))}</span>
                          <span>Зээл: {formatMoney(inferReceiptCreditAmount(receipt))}</span>
                          <span>{receipt.partner_name || "Харилцагчгүй"}</span>
                        </div>
                      </div>
                      <div className="warehouse-card-actions">
                        <button
                          className="secondary-button compact-button"
                          type="button"
                          onClick={() => openReceiptEditModal(receipt)}
                          disabled={isReturned}
                        >
                          <Edit3 size={16} aria-hidden="true" />
                          <span>Засах</span>
                        </button>
                        <button
                          className="danger-button compact-button"
                          type="button"
                          onClick={() => handleReceiptReturn(receipt)}
                          disabled={isReturned || returningReceiptId === receipt.receipt_id}
                        >
                          <RotateCcw size={16} aria-hidden="true" />
                          <span>{isReturned ? "Буцаагдсан" : "Буцаах"}</span>
                        </button>
                      </div>
                    </article>
                  );
                })
              ) : (
                <div className="state-box">Орлогын бүртгэл олдсонгүй.</div>
              )}
            </div>

            <div className="table-wrap warehouse-table-wrap">
              <table className="data-table product-table">
                <thead>
                  <tr>
                    <th>Огноо</th>
                    <th>Бараа</th>
                    <th>Тоо</th>
                    <th>Нэгж өртөг</th>
                    <th>Нийт</th>
                    <th>Харилцагч</th>
                    <th>Төлбөр</th>
                    <th>Бэлэн</th>
                    <th>Зээл</th>
                    <th>Төлөв</th>
                    <th>Үйлдэл</th>
                  </tr>
                </thead>
                <tbody>
                  {receiptsLoading ? (
                    Array.from({ length: 6 }).map((_, index) => (
                      <tr key={index}>
                        <td colSpan={11}>
                          <div className="row-skeleton" />
                        </td>
                      </tr>
                    ))
                  ) : filteredReceipts.length > 0 ? (
                    filteredReceipts.map((receipt) => {
                      const isReturned = receipt.status === "returned";

                      return (
                        <tr key={receipt.receipt_id}>
                          <td>{formatDateTime(receipt.created_at)}</td>
                          <td>
                            <strong>{receipt.product_name}</strong>
                            {receipt.note ? <small className="table-subtext">{receipt.note}</small> : null}
                            {receipt.odoo_receipt_name ? <small className="table-subtext">Odoo: {receipt.odoo_receipt_name}</small> : null}
                          </td>
                          <td>{quantityText(receipt.quantity)} {formatUnitName(receipt.uom_name)}</td>
                          <td>{formatMoney(receipt.unit_cost)} / {formatUnitName(receipt.uom_name)}</td>
                          <td>{formatMoney(receipt.total_cost)}</td>
                          <td>{receipt.partner_name || "Сонгоогүй"}</td>
                          <td>{stockPaymentLabel(receipt.payment_method ?? (inferReceiptCreditAmount(receipt) > 0 ? "credit" : "cash"))}</td>
                          <td>{formatMoney(inferReceiptPaidAmount(receipt))}</td>
                          <td>{formatMoney(inferReceiptCreditAmount(receipt))}</td>
                          <td>
                            <span className={isReturned ? "soft-pill muted-pill" : "soft-pill"}>
                              {isReturned ? "Буцаагдсан" : "Идэвхтэй"}
                            </span>
                          </td>
                          <td>
                            <div className="table-actions warehouse-actions">
                              <button
                                className="icon-button"
                                type="button"
                                onClick={() => openReceiptEditModal(receipt)}
                                disabled={isReturned}
                                aria-label="Орлого засах"
                              >
                                <Edit3 size={16} aria-hidden="true" />
                              </button>
                              <button
                                className="icon-button danger"
                                type="button"
                                onClick={() => handleReceiptReturn(receipt)}
                                disabled={isReturned || returningReceiptId === receipt.receipt_id}
                                aria-label="Орлого буцаах"
                              >
                                <RotateCcw size={16} aria-hidden="true" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={11}>Орлогын бүртгэл олдсонгүй.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        ) : activeView === "receipt-report" ? (
          <>
            <div className="report-kpi-grid warehouse-receipt-metrics">
              <div className="metric strong-metric">
                <span>Нийт орлого</span>
                <strong>{formatMoney(receiptSummary.totalCost)}</strong>
              </div>
              <div className="metric">
                <span>Бэлнээр төлсөн</span>
                <strong>{formatMoney(receiptSummary.paidAmount)}</strong>
              </div>
              <div className="metric">
                <span>Өглөг / зээл</span>
                <strong>{formatMoney(receiptSummary.creditAmount)}</strong>
              </div>
            </div>

            <section className="embedded-panel">
              <div className="panel-toolbar">
                <div>
                  <p className="eyebrow">Орлогын тайлан</p>
                  <h2>Харилцагчаар</h2>
                </div>
                <span className="soft-pill">{receiptSummary.byPartner.length} мөр</span>
              </div>
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Харилцагч</th>
                      <th>Орлого</th>
                      <th>Бэлэн</th>
                      <th>Зээл</th>
                      <th>Тоо</th>
                    </tr>
                  </thead>
                  <tbody>
                    {receiptSummary.byPartner.length > 0 ? (
                      receiptSummary.byPartner.map((row) => (
                        <tr key={row.partnerName}>
                          <td><strong>{row.partnerName}</strong></td>
                          <td>{formatMoney(row.totalCost)}</td>
                          <td>{formatMoney(row.paidAmount)}</td>
                          <td>{formatMoney(row.creditAmount)}</td>
                          <td>{row.count}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={5}>Орлогын тайлан гаргах бүртгэл алга байна.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            <div className="table-wrap">
              <table className="data-table product-table">
                <thead>
                  <tr>
                    <th>Огноо</th>
                    <th>Бараа</th>
                    <th>Тоо</th>
                    <th>Нэгж өртөг</th>
                    <th>Харилцагч</th>
                    <th>Төлбөр</th>
                    <th>Бэлэн</th>
                    <th>Зээл</th>
                    <th>Нийт</th>
                    <th>Төлөв</th>
                    <th>Үйлдэл</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredReceipts.length > 0 ? (
                    filteredReceipts.map((receipt) => {
                      const isReturned = receipt.status === "returned";

                      return (
                        <tr key={receipt.receipt_id}>
                          <td>{formatDateTime(receipt.created_at)}</td>
                          <td>
                            <strong>{receipt.product_name}</strong>
                            {receipt.note ? <small className="table-subtext">{receipt.note}</small> : null}
                          </td>
                          <td>{quantityText(receipt.quantity)}</td>
                          <td>{formatMoney(receipt.unit_cost)}</td>
                          <td>{receipt.partner_name || "Сонгоогүй"}</td>
                          <td>{stockPaymentLabel(receipt.payment_method ?? (inferReceiptCreditAmount(receipt) > 0 ? "credit" : "cash"))}</td>
                          <td>{formatMoney(inferReceiptPaidAmount(receipt))}</td>
                          <td>{formatMoney(inferReceiptCreditAmount(receipt))}</td>
                          <td>{formatMoney(receipt.total_cost)}</td>
                          <td>
                            <span className={isReturned ? "soft-pill muted-pill" : "soft-pill"}>
                              {isReturned ? "Буцаагдсан" : "Идэвхтэй"}
                            </span>
                          </td>
                          <td>
                            <button
                              className="icon-button"
                              type="button"
                              onClick={() => openReceiptEditModal(receipt)}
                              disabled={isReturned}
                              aria-label="Орлого засах"
                            >
                              <Edit3 size={16} aria-hidden="true" />
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={11}>Орлогын бүртгэл олдсонгүй.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <>
            <div className="category-card-list">
              {categoriesLoading ? (
                Array.from({ length: 5 }).map((_, index) => <div className="row-skeleton" key={index} />)
              ) : filteredCategories.length > 0 ? (
                filteredCategories.map((category) => {
                  const productCount = Number(categoryProductCounts.get(category.id) ?? 0);
                  const deleteDisabled = productCount > 0 || deletingCategoryId === category.id;

                  return (
                    <article className="category-card" key={category.id}>
                      <div>
                        <strong>{category.display_name}</strong>
                        <span>ID: {category.id}</span>
                      </div>
                      <div>
                        <small>Дээд ангилал</small>
                        <span>{category.parent_name || "Дээд ангилалгүй"}</span>
                      </div>
                      <div>
                        <small>Агуулахын бараа</small>
                        <span>{productCount} бараа</span>
                      </div>
                      <button
                        className="danger-button compact-button"
                        type="button"
                        onClick={() => handleCategoryDelete(category)}
                        disabled={deleteDisabled}
                        title={productCount > 0 ? "Энэ ангилалд бараа байгаа тул устгах боломжгүй" : "Ангилал устгах"}
                        data-testid={`warehouse-category-mobile-delete-${category.id}`}
                      >
                        <Trash2 size={16} aria-hidden="true" />
                        <span>Устгах</span>
                      </button>
                    </article>
                  );
                })
              ) : (
                <div className="state-box">Ангилал олдсонгүй.</div>
              )}
            </div>

            <div className="table-wrap category-table-wrap">
              <table className="data-table category-table">
                <thead>
                  <tr>
                    <th>Ангилал</th>
                    <th>Дээд ангилал</th>
                    <th>Агуулахын бараа</th>
                    <th>Үйлдэл</th>
                  </tr>
                </thead>
                <tbody>
                  {categoriesLoading ? (
                    Array.from({ length: 6 }).map((_, index) => (
                      <tr key={index}>
                        <td colSpan={4}>
                          <div className="row-skeleton" />
                        </td>
                      </tr>
                    ))
                  ) : filteredCategories.length > 0 ? (
                    filteredCategories.map((category) => {
                      const productCount = Number(categoryProductCounts.get(category.id) ?? 0);
                      const deleteDisabled = productCount > 0 || deletingCategoryId === category.id;

                      return (
                        <tr key={category.id}>
                          <td>
                            <strong>{category.display_name}</strong>
                            <small className="table-subtext">ID: {category.id}</small>
                          </td>
                          <td>{category.parent_name || "Дээд ангилалгүй"}</td>
                          <td>
                            <span className={productCount > 0 ? "soft-pill" : "soft-pill muted-pill"}>
                              {productCount} бараа
                            </span>
                          </td>
                          <td>
                            <button
                              className="icon-button danger"
                              type="button"
                              onClick={() => handleCategoryDelete(category)}
                              disabled={deleteDisabled}
                              title={productCount > 0 ? "Энэ ангилалд бараа байгаа тул устгах боломжгүй" : "Ангилал устгах"}
                              aria-label="Ангилал устгах"
                              data-testid={`warehouse-category-delete-${category.id}`}
                            >
                              <Trash2 size={16} aria-hidden="true" />
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={4}>Ангилал олдсонгүй.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
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

      {editingReceipt ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="receipt-edit-title">
          <form className="modal-card narrow-modal" onSubmit={handleReceiptSubmit} data-testid="warehouse-receipt-edit-modal">
            <button
              className="icon-button modal-close"
              type="button"
              aria-label="Хаах"
              onClick={closeReceiptEditModal}
              disabled={receiptSaving}
            >
              <X size={18} aria-hidden="true" />
            </button>
            <p className="eyebrow">Агуулахын орлого</p>
            <h2 id="receipt-edit-title">Орлого засах</h2>
            <div className="stock-product-card">
              <span>{editingReceipt.product_name}</span>
              <strong>{formatDateTime(editingReceipt.created_at)}</strong>
              <small>{editingReceipt.odoo_receipt_name ? `Odoo: ${editingReceipt.odoo_receipt_name}` : "Кассын орлогын бүртгэл"}</small>
            </div>

            <div className="form-grid two-columns">
              <label className="field">
                <span>Тоо хэмжээ</span>
                <input
                  type="number"
                  min="0.000001"
                  step="any"
                  inputMode="decimal"
                  value={receiptForm.quantity}
                  onChange={(event) => setReceiptForm((current) => ({ ...current, quantity: event.target.value }))}
                  required
                />
              </label>
              <label className="field">
                <span>Нэгж өртөг</span>
                <input
                  type="number"
                  min="0.000001"
                  step="any"
                  inputMode="decimal"
                  value={receiptForm.unit_cost}
                  onChange={(event) => setReceiptForm((current) => ({ ...current, unit_cost: event.target.value }))}
                  required
                />
              </label>
            </div>

            <div className="stock-cost-preview">
              <span>Шинэ нийт өртөг</span>
              <strong>
                {formatMoney(
                  Number.isFinite(Number(receiptForm.quantity)) && Number.isFinite(Number(receiptForm.unit_cost))
                    ? Number(receiptForm.quantity) * Number(receiptForm.unit_cost)
                    : 0,
                )}
              </strong>
            </div>

            <label className="field">
              <span>Харилцагч</span>
              <select
                value={receiptForm.partner_id}
                onChange={(event) => setReceiptForm((current) => ({ ...current, partner_id: event.target.value }))}
                disabled={partnersLoading}
              >
                <option value="">Сонгохгүй</option>
                {partners.map((partner) => (
                  <option key={partner.id} value={partner.id}>
                    {partner.name}
                  </option>
                ))}
              </select>
            </label>

            <div className="payment-method-panel stock-payment-panel">
              <div>
                <h3>Төлбөрийн хэлбэр</h3>
                <p className="muted-text">Нийт өртөг: {formatMoney(receiptFormTotalCost)}</p>
              </div>
              <div className="period-tabs" role="tablist" aria-label="Орлогын төлбөрийн хэлбэр">
                {(["cash", "credit", "mixed"] as StockReceiptPaymentMethod[]).map((option) => (
                  <button
                    key={option}
                    className={receiptForm.payment_method === option ? "period-tab active" : "period-tab"}
                    type="button"
                    onClick={() =>
                      setReceiptForm((current) => ({
                        ...current,
                        payment_method: option,
                        paid_amount: option === "cash" ? String(receiptFormTotalCost) : option === "credit" ? "0" : current.paid_amount,
                        credit_amount: option === "credit" ? String(receiptFormTotalCost) : option === "cash" ? "0" : current.credit_amount,
                      }))
                    }
                  >
                    {stockPaymentLabel(option)}
                  </button>
                ))}
              </div>
              {receiptForm.payment_method === "mixed" ? (
                <div className="form-grid two-columns">
                  <label className="field">
                    <span>Бэлнээр төлсөн</span>
                    <input
                      type="number"
                      min="0"
                      step="any"
                      inputMode="decimal"
                      value={receiptForm.paid_amount}
                      onChange={(event) => setReceiptForm((current) => ({ ...current, paid_amount: event.target.value }))}
                    />
                  </label>
                  <label className="field">
                    <span>Зээлд үлдсэн</span>
                    <input
                      type="number"
                      min="0"
                      step="any"
                      inputMode="decimal"
                      value={receiptForm.credit_amount}
                      onChange={(event) => setReceiptForm((current) => ({ ...current, credit_amount: event.target.value }))}
                    />
                  </label>
                </div>
              ) : (
                <div className="stock-cost-preview">
                  <span>{receiptForm.payment_method === "cash" ? "Бэлнээр төлөх" : "Зээлд үлдэх"}</span>
                  <strong>{formatMoney(receiptFormTotalCost)}</strong>
                </div>
              )}
            </div>

            <label className="field">
              <span>Тэмдэглэл</span>
              <textarea
                value={receiptForm.note}
                onChange={(event) => setReceiptForm((current) => ({ ...current, note: event.target.value }))}
              />
            </label>

            {receiptError ? <div className="form-error">{receiptError}</div> : null}

            <div className="modal-actions">
              <button className="secondary-button" type="button" onClick={closeReceiptEditModal} disabled={receiptSaving}>
                Болих
              </button>
              <button className="primary-button" type="submit" disabled={receiptSaving}>
                <Save size={17} aria-hidden="true" />
                <span>{receiptSaving ? "Хадгалж байна" : "Хадгалах"}</span>
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {usageProduct ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="stock-usage-title">
          <div className="modal-card usage-modal" data-testid="warehouse-usage-modal">
            <button
              className="icon-button modal-close"
              type="button"
              aria-label="Хаах"
              onClick={closeUsageModal}
            >
              <X size={18} aria-hidden="true" />
            </button>
            <p className="eyebrow">Агуулахын зарцуулалт</p>
            <h2 id="stock-usage-title">{usageProduct.name}</h2>

            {usageLoading ? (
              <div className="state-box">Зарцуулалтын мэдээлэл уншиж байна.</div>
            ) : usageError ? (
              <div className="state-box error-state">
                <strong>Зарцуулалт уншихад алдаа гарлаа</strong>
                <p>{usageError}</p>
              </div>
            ) : stockUsage ? (
              <>
                <div className="report-kpi-grid warehouse-receipt-metrics">
                  <div className="metric strong-metric">
                    <span>Нийт хасагдсан</span>
                    <strong>
                      {quantityText(stockUsage.total_quantity)} {formatUnitName(stockUsage.component.uom_name ?? usageProduct.uom_name)}
                    </strong>
                  </div>
                  <div className="metric">
                    <span>Борлуулалтын баримт</span>
                    <strong>{stockUsage.orders_count}</strong>
                  </div>
                  <div className="metric">
                    <span>Бүтээгдэхүүн</span>
                    <strong>{stockUsage.products.length}</strong>
                  </div>
                </div>

                <section className="usage-section">
                  <div className="usage-section-heading">
                    <div>
                      <p className="eyebrow">Юунаас хасагдсан</p>
                      <h3>Бүтээгдэхүүнээр</h3>
                    </div>
                    <span className="soft-pill">{stockUsage.products.length} мөр</span>
                  </div>
                  <div className="table-wrap usage-table-wrap">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Бүтээгдэхүүн</th>
                          <th>Хасагдсан</th>
                          <th>Баримт</th>
                          <th>Сүүлд</th>
                        </tr>
                      </thead>
                      <tbody>
                        {stockUsage.products.length > 0 ? (
                          stockUsage.products.map((row) => (
                            <tr key={row.product_id}>
                              <td><strong>{row.product_name}</strong></td>
                              <td>
                                {quantityText(row.quantity)} {formatUnitName(row.uom_name ?? stockUsage.component.uom_name ?? usageProduct.uom_name)}
                              </td>
                              <td>{row.orders_count}</td>
                              <td>{formatDateTime(row.last_used_at)}</td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan={4}>Энэ бараанаас борлуулалтаар хасагдсан бүртгэл алга байна.</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </section>

                <section className="usage-section">
                  <div className="usage-section-heading">
                    <div>
                      <p className="eyebrow">Сүүлийн хөдөлгөөн</p>
                      <h3>Баримтаар</h3>
                    </div>
                    <span className="soft-pill">{stockUsage.orders.length} мөр</span>
                  </div>
                  <div className="table-wrap usage-table-wrap">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Огноо</th>
                          <th>Баримт</th>
                          <th>Бүтээгдэхүүн</th>
                          <th>Зарагдсан</th>
                          <th>Хасагдсан</th>
                        </tr>
                      </thead>
                      <tbody>
                        {stockUsage.orders.length > 0 ? (
                          stockUsage.orders.map((row, index) => (
                            <tr key={`${row.receipt_number ?? row.order_id ?? index}-${row.source_product_id}`}>
                              <td>{formatDateTime(row.created_at)}</td>
                              <td>{row.receipt_number ?? row.order_id ?? "Баримтгүй"}</td>
                              <td><strong>{row.source_product_name}</strong></td>
                              <td>{quantityText(row.sold_quantity)} ш</td>
                              <td>
                                {quantityText(row.quantity)} {formatUnitName(row.uom_name ?? stockUsage.component.uom_name ?? usageProduct.uom_name)}
                              </td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan={5}>Сүүлийн хөдөлгөөн байхгүй байна.</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </section>
              </>
            ) : null}
          </div>
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
                <span>Нэгж</span>
                <select
                  value={stockForm.uom_id}
                  onChange={(event) => setStockForm((current) => ({ ...current, uom_id: event.target.value }))}
                  disabled={uomsLoading || stockUomOptions.length <= 1}
                  data-testid="stock-uom-select"
                >
                  {stockUomOptions.length > 0 ? (
                    stockUomOptions.map((uom) => (
                      <option key={uom.id} value={uom.id}>
                        {formatUnitName(uom.display_name)}
                      </option>
                    ))
                  ) : (
                    <option value={stockProduct.uom_id ? String(stockProduct.uom_id) : ""}>
                      {activeStockUnitName}
                    </option>
                  )}
                </select>
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

            <div className="payment-method-panel stock-payment-panel">
              <div>
                <h3>Төлбөрийн хэлбэр</h3>
                <p className="muted-text">Нийт өртөг: {formatMoney(stockFormTotalCost)}</p>
              </div>
              <div className="period-tabs" role="tablist" aria-label="Орлогын төлбөрийн хэлбэр">
                {(["cash", "credit", "mixed"] as StockReceiptPaymentMethod[]).map((option) => (
                  <button
                    key={option}
                    className={stockForm.payment_method === option ? "period-tab active" : "period-tab"}
                    type="button"
                    onClick={() =>
                      setStockForm((current) => ({
                        ...current,
                        payment_method: option,
                        paid_amount: option === "cash" ? String(stockFormTotalCost) : option === "credit" ? "0" : current.paid_amount,
                        credit_amount: option === "credit" ? String(stockFormTotalCost) : option === "cash" ? "0" : current.credit_amount,
                      }))
                    }
                  >
                    {stockPaymentLabel(option)}
                  </button>
                ))}
              </div>
              {stockForm.payment_method === "mixed" ? (
                <div className="form-grid two-columns">
                  <label className="field">
                    <span>Бэлнээр төлсөн</span>
                    <input
                      type="number"
                      min="0"
                      step="any"
                      inputMode="decimal"
                      value={stockForm.paid_amount}
                      onChange={(event) => setStockForm((current) => ({ ...current, paid_amount: event.target.value }))}
                    />
                  </label>
                  <label className="field">
                    <span>Зээлд үлдсэн</span>
                    <input
                      type="number"
                      min="0"
                      step="any"
                      inputMode="decimal"
                      value={stockForm.credit_amount}
                      onChange={(event) => setStockForm((current) => ({ ...current, credit_amount: event.target.value }))}
                    />
                  </label>
                </div>
              ) : (
                <div className="stock-cost-preview">
                  <span>{stockForm.payment_method === "cash" ? "Бэлнээр төлөх" : "Зээлд үлдэх"}</span>
                  <strong>{formatMoney(stockFormTotalCost)}</strong>
                </div>
              )}
            </div>

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
