export type PaymentMethod = "cash" | "card" | "qpay";

export interface KassApiErrorShape {
  error?: {
    code?: string;
    message?: string;
  };
}

export interface KassProduct {
  id: number;
  name: string;
  sale_price: number;
  barcode?: string | null;
  default_code?: string | null;
  category?: string | null;
  pos_category_ids?: number[];
  pos_categories?: string[];
  description?: string | null;
  image_base64?: string | null;
  available_for_sale?: boolean;
  is_storable?: boolean;
  cost_price?: number;
  qty_available?: number;
  virtual_available?: number;
  uom_id?: number | null;
  uom_name?: string | null;
}

export interface ProductsResponse {
  products: KassProduct[];
}

export interface KassCategory {
  id: number;
  name: string;
  display_name: string;
  parent_id?: number | null;
  parent_name?: string | null;
}

export interface CategoriesResponse {
  categories: KassCategory[];
}

export interface KassUom {
  id: number;
  name: string;
  display_name: string;
  category_id?: number | null;
  category_name?: string | null;
  uom_type?: string | null;
}

export interface UomsResponse {
  uoms: KassUom[];
}

export interface KassPartner {
  id: number;
  name: string;
  phone?: string | null;
  email?: string | null;
  supplier_rank?: number;
  customer_rank?: number;
}

export interface PartnersResponse {
  partners: KassPartner[];
}

export interface ProductFormRequest {
  name: string;
  sale_price: number;
  barcode?: string | null;
  default_code?: string | null;
  category?: string | null;
  description?: string | null;
  image_base64?: string | null;
  available_for_sale?: boolean;
  is_storable?: boolean;
  uom_id?: number | null;
}

export interface ProductResponse {
  product: KassProduct;
}

export type ProductScope = "pos" | "all" | "hidden" | "production" | "stock";

export interface KassRecipeLine {
  id?: number;
  component_product_id: number | null;
  component_name: string;
  quantity: number;
  uom_id?: number | null;
  uom_name?: string | null;
  is_storable?: boolean | null;
  qty_available?: number | null;
  virtual_available?: number | null;
}

export interface KassProductRecipe {
  bom_id?: number | null;
  product_id: number;
  product_name: string;
  quantity: number;
  uom_id?: number | null;
  uom_name?: string | null;
  lines: KassRecipeLine[];
}

export interface ProductRecipeResponse {
  recipe: KassProductRecipe;
}

export interface ProductRecipeRequest {
  lines: Array<{
    component_product_id: number;
    quantity: number;
  }>;
}

export interface ProductStockInRequest {
  quantity: number;
  unit_cost?: number | null;
  partner_id?: number | null;
  note?: string | null;
}

export interface ProductStockInResponse {
  ok: boolean;
  product: KassProduct;
  product_id: number;
  quantity_received: number;
  previous_quantity: number | null;
  quantity_available: number;
  unit_cost?: number | null;
  total_cost?: number | null;
  partner?: KassPartner | null;
  receipt?: {
    id: number;
    name: string | null;
    state: string | null;
  } | null;
  location?: {
    id: number;
    name: string;
  } | null;
  note?: string | null;
}

export interface OdooLoginRequest {
  username: string;
  password: string;
}

export interface OdooLoginResponse {
  ok?: boolean;
  user: {
    user_id: number;
    name: string;
    login: string;
  };
}

export interface OpenSessionRequest {
  cashier_name: string;
  opening_cash: number;
}

export interface OpenSessionResponse {
  session_id?: string;
  cashier_name?: string;
  opening_cash?: number;
  opened_at?: string;
  session?: {
    id?: string;
    session_id?: string;
    cashier_name?: string;
    opening_cash?: number;
    opened_at?: string;
  };
  [key: string]: unknown;
}

export interface CartItem {
  product_id: number;
  name: string;
  category?: string | null;
  barcode?: string | null;
  quantity: number;
  price: number;
  image_base64?: string | null;
}

export interface OrderLineRequest {
  product_id: number;
  quantity: number;
  price: number;
}

export interface CreateOrderRequest {
  session_id: string;
  payment_method: PaymentMethod;
  lines: OrderLineRequest[];
  qpay_transaction_id?: number | null;
}

export interface CreateOrderResponse {
  order_id?: string | number;
  receipt_number?: string;
  payment_method?: PaymentMethod;
  total?: number;
  order?: {
    id?: string | number;
    order_id?: string | number;
    receipt_number?: string;
    total?: number;
    payment_method?: PaymentMethod;
  };
  [key: string]: unknown;
}

export interface QpayInvoiceRequest {
  session_id: string;
  lines: OrderLineRequest[];
}

export interface QpayInvoiceResponse {
  ok: boolean;
  transaction_id: number;
  amount: number;
  state?: string | null;
  paid?: boolean;
  qpay_invoice_id?: string | null;
  qr_text?: string | null;
  qr_image?: string | null;
  qpay_short_url?: string | null;
  error_message?: string | null;
}

export interface QpayCheckRequest {
  transaction_id: number;
}

export interface QpayCheckResponse {
  ok: boolean;
  transaction_id: number;
  state?: string | null;
  paid: boolean;
  qpay_payment_id?: string | null;
  error_message?: string | null;
}

export interface KassOrderSummary {
  order_id?: string | number;
  receipt_number?: string;
  payment_method?: PaymentMethod | "other";
  total?: number;
  created_at?: string;
  date?: string;
  [key: string]: unknown;
}

export type SalesReportPeriod = "day" | "week" | "month" | "year";

export interface SalesReportResponse {
  period: SalesReportPeriod;
  start: string;
  end: string;
  total_sales: number;
  cash_total: number;
  card_total: number;
  qpay_total: number;
  other_total: number;
  orders_count: number;
  average_order: number;
  orders: KassOrderSummary[];
}

export interface KassReport {
  session_id?: string;
  cashier_name?: string;
  status?: string;
  opened_at?: string;
  closed_at?: string;
  opening_cash?: number;
  closing_cash?: number;
  total_sales?: number;
  cash_total?: number;
  card_total?: number;
  qpay_total?: number;
  orders_count?: number;
  expected_cash?: number;
  orders?: KassOrderSummary[];
  report?: Partial<KassReport>;
  [key: string]: unknown;
}

export interface CloseSessionRequest {
  session_id: string;
  closing_cash: number;
}

export interface CloseSessionResponse {
  session_id?: string;
  closing_cash?: number;
  expected_cash?: number;
  cash_difference?: number;
  total_sales?: number;
  cash_total?: number;
  card_total?: number;
  qpay_total?: number;
  orders_count?: number;
  closed_at?: string;
  report?: Partial<KassReport>;
  [key: string]: unknown;
}

export interface KassHealthResponse {
  status?: string;
  ok?: boolean;
  odoo?: {
    status?: string;
    connected?: boolean;
    configured?: boolean;
    db?: string | null;
    message?: string;
  };
  connection?: {
    odoo?: string;
    status?: string;
  };
  [key: string]: unknown;
}

export interface ReceiptData {
  order: CreateOrderResponse;
  lines: CartItem[];
  total: number;
  paymentMethod: PaymentMethod;
  paidAt: string;
}
