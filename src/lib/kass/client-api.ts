import type {
  CategoriesResponse,
  CloseSessionRequest,
  CloseSessionResponse,
  CategoryFormRequest,
  CreateOrderRequest,
  CreateOrderResponse,
  KassApiErrorShape,
  KassHealthResponse,
  KassReport,
  OdooLoginRequest,
  OdooLoginResponse,
  OpenSessionRequest,
  OpenSessionResponse,
  PartnersResponse,
  ProductFormRequest,
  ProductRecipeRequest,
  ProductRecipeResponse,
  ProductResponse,
  ProductScope,
  ProductStockInRequest,
  ProductStockInResponse,
  QpayCheckRequest,
  QpayCheckResponse,
  QpayInvoiceRequest,
  QpayInvoiceResponse,
  ProductsResponse,
  SalesReportPeriod,
  SalesReportResponse,
  UomsResponse,
} from "./client-types";

const API_ROOT = "/api/kass";

const errorMessages: Record<string, string> = {
  qpay_invoice_failed: "QPay QR үүсгэхэд алдаа гарлаа. Odoo QPay тохиргоо болон эрхийг шалгана уу.",
  qpay_check_failed: "QPay төлбөр шалгахад алдаа гарлаа.",
  odoo_config_missing: "Odoo тохиргоо дутуу байна. Сервер талын .env файлаа шалгана уу.",
  odoo_auth_failed: "Odoo нэвтрэлт амжилтгүй боллоо. Нэвтрэх нэр эсвэл нууц үг буруу байж магадгүй.",
  odoo_connection_failed: "Odoo сервертэй холбогдож чадсангүй. ODOO_URL болон Odoo үйлчилгээгээ шалгана уу.",
  product_not_found: "Бараа олдсонгүй.",
  product_create_failed: "Бараа нэмэхэд алдаа гарлаа.",
  product_update_failed: "Бараа засахад алдаа гарлаа.",
  product_delete_failed: "Бараа хасахад алдаа гарлаа.",
  category_create_failed: "Ангилал нэмэхэд алдаа гарлаа.",
  partner_not_found: "Харилцагч олдсонгүй.",
  stock_location_not_found: "Odoo агуулахын байршил олдсонгүй.",
  stock_receive_failed: "Барааны орлого авахад алдаа гарлаа.",
  recipe_save_failed: "Барааны жор хадгалахад алдаа гарлаа.",
  session_not_found: "Ээлж олдсонгүй. Шинэ ээлж нээгээд дахин оролдоно уу.",
  session_closed: "Энэ ээлж хаагдсан байна. Шинэ ээлж нээнэ үү.",
  invalid_payment_method: "Төлбөрийн төрөл буруу байна.",
  order_create_failed: "Захиалга үүсгэхэд алдаа гарлаа.",
  validation_error: "Оруулсан мэдээлэл дутуу эсвэл буруу байна.",
};

export class KassApiError extends Error {
  code: string;
  status: number;

  constructor(message: string, code = "unknown_error", status = 500) {
    super(message);
    this.name = "KassApiError";
    this.code = code;
    this.status = status;
  }
}

function parseApiError(payload: unknown, status: number) {
  const apiError = payload as KassApiErrorShape;
  const code = apiError?.error?.code ?? "unknown_error";
  const fallback = errorMessages[code] ?? "API хүсэлт амжилтгүй боллоо.";
  const message = apiError?.error?.message ?? errorMessages[code] ?? fallback;

  return new KassApiError(message, code, status);
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_ROOT}${path}`, {
    ...init,
    cache: "no-store",
    headers: {
      Accept: "application/json",
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });

  const text = await response.text();
  let payload: unknown = null;

  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      const isHtml = text.trimStart().startsWith("<!DOCTYPE") || text.trimStart().startsWith("<html");
      const message = isHtml
        ? `${API_ROOT}${path} API зам JSON биш HTML буцаалаа. Backend route ажиллаж байгаа эсэхийг шалгана уу.`
        : `${API_ROOT}${path} API зам JSON хариу буцаасангүй.`;
      throw new KassApiError(message, response.status === 404 ? "api_route_not_found" : "invalid_api_response", response.status);
    }
  }

  if (!response.ok) {
    throw parseApiError(payload, response.status);
  }

  return payload as T;
}

export function getReadableError(error: unknown) {
  if (error instanceof KassApiError) {
    const message = error.message || errorMessages[error.code] || "API хүсэлт амжилтгүй боллоо.";
    return `${message} (${error.code})`;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "Тодорхойгүй алдаа гарлаа.";
}

export function getHealth() {
  return request<KassHealthResponse>("/health");
}

export function getProducts(scope: ProductScope = "pos") {
  const query = scope === "pos" ? "" : `?scope=${encodeURIComponent(scope)}`;
  return request<ProductsResponse>(`/products${query}`);
}

export function getProductCategories() {
  return request<CategoriesResponse>("/categories");
}

export function getWarehouseCategories() {
  return request<CategoriesResponse>("/categories?scope=warehouse");
}

export function createProductCategory(body: CategoryFormRequest) {
  return request<{ category: CategoriesResponse["categories"][number] }>("/categories", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function getProductUoms() {
  return request<UomsResponse>("/uoms");
}

export function getPartners() {
  return request<PartnersResponse>("/partners");
}

export function createKassProduct(body: ProductFormRequest) {
  return request<ProductResponse>("/products", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function updateKassProduct(productId: number, body: Partial<ProductFormRequest>) {
  return request<ProductResponse>(`/products/${encodeURIComponent(productId)}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export function getProductRecipe(productId: number) {
  return request<ProductRecipeResponse>(`/products/${encodeURIComponent(productId)}/recipe`);
}

export function updateProductRecipe(productId: number, body: ProductRecipeRequest) {
  return request<ProductRecipeResponse>(`/products/${encodeURIComponent(productId)}/recipe`, {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

export function deleteKassProduct(productId: number) {
  return request<{ ok: boolean; product_id: number; archived: boolean }>(`/products/${encodeURIComponent(productId)}`, {
    method: "DELETE",
  });
}

export function receiveKassProductStock(productId: number, body: ProductStockInRequest) {
  return request<ProductStockInResponse>(`/products/${encodeURIComponent(productId)}/stock-in`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function loginOdooCashier(body: OdooLoginRequest) {
  return request<OdooLoginResponse>("/auth/login", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function openKassSession(body: OpenSessionRequest) {
  return request<OpenSessionResponse>("/session/open", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function createKassOrder(body: CreateOrderRequest) {
  return request<CreateOrderResponse>("/order", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function createQpayInvoice(body: QpayInvoiceRequest) {
  return request<QpayInvoiceResponse>("/qpay/invoice", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function checkQpayPayment(body: QpayCheckRequest) {
  return request<QpayCheckResponse>("/qpay/check", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function getSessionReport(sessionId: string) {
  return request<KassReport>(`/report?session_id=${encodeURIComponent(sessionId)}`);
}

export function getSalesReport(period: SalesReportPeriod, start: string, end: string) {
  const query = new URLSearchParams({ period, start, end });
  return request<SalesReportResponse>(`/reports?${query.toString()}`);
}

export function closeKassSession(body: CloseSessionRequest) {
  return request<CloseSessionResponse>("/session/close", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function formatMoney(value: number | null | undefined) {
  const amount = Math.round(Number(value ?? 0));
  const absolute = Math.abs(amount).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${amount < 0 ? "-" : ""}MNT ${absolute}`;
}

const unitLabels: Record<string, string> = {
  unit: "ширхэг",
  units: "ширхэг",
  piece: "ширхэг",
  pieces: "ширхэг",
  pcs: "ширхэг",
  kg: "кг",
  kilogram: "кг",
  kilograms: "кг",
  g: "гр",
  gram: "гр",
  grams: "гр",
  l: "л",
  liter: "л",
  liters: "л",
  litre: "л",
  litres: "л",
  ml: "мл",
  milliliter: "мл",
  milliliters: "мл",
  ton: "тонн",
  tons: "тонн",
  hour: "цаг",
  hours: "цаг",
  day: "өдөр",
  days: "өдөр",
  minute: "минут",
  minutes: "минут",
  kwh: "кВт.ц",
};

export function formatUnitName(value: string | null | undefined) {
  const name = String(value ?? "").trim();
  if (!name) return "нэгж";

  const normalized = name.toLowerCase();
  const packMatch = normalized.match(/^pack of (\d+)$/);
  if (packMatch) return `${packMatch[1]} ширхэгийн багц`;

  return unitLabels[normalized] ?? name;
}

export function paymentMethodLabel(method: string | undefined) {
  if (method === "cash") return "Бэлэн мөнгө";
  if (method === "card") return "Карт";
  if (method === "qpay") return "QPay";
  if (method === "other") return "Бусад";
  return "Тодорхойгүй";
}

export function normalizeReport(report: KassReport | null | undefined): KassReport | null {
  if (!report) return null;
  return {
    ...report.report,
    ...report,
  };
}
