export type PaymentMethod = "cash" | "card" | "qpay" | "bank" | "credit" | "coupon";
export type OrderPaymentMethod = PaymentMethod | "mixed";

export interface PaymentPart {
  method: PaymentMethod;
  amount: number;
}

export interface KassStockConsumption {
  component_product_id: number;
  component_name: string;
  source_product_id: number;
  source_product_name: string;
  source_quantity: number;
  quantity: number;
  uom_id?: number | null;
  uom_name?: string | null;
}

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
  has_bom?: boolean;
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

export interface UomFormRequest {
  name: string;
  category_id: number;
  uom_type?: "reference" | "bigger" | "smaller";
  factor_inv?: number | null;
}

export interface UomResponse {
  uom: KassUom;
}

export interface UomDeleteResponse {
  ok: boolean;
  uom_id: number;
  archived: boolean;
}

export interface KassPartner {
  id: number;
  name: string;
  phone?: string | null;
  email?: string | null;
  company_register?: string | null;
  bank_account?: string | null;
  supplier_rank?: number;
  customer_rank?: number;
}

export interface PartnersResponse {
  partners: KassPartner[];
}

export interface PartnerFormRequest {
  name: string;
  phone?: string | null;
  email?: string | null;
  company_register?: string | null;
  bank_account?: string | null;
  is_supplier?: boolean;
  is_customer?: boolean;
}

export interface PartnerResponse {
  partner: KassPartner;
}

export interface PartnerDeleteResponse {
  ok: boolean;
  partner_id: number;
  archived: boolean;
}

export interface ProductFormRequest {
  name: string;
  sale_price: number;
  barcode?: string | null;
  default_code?: string | null;
  category?: string | null;
  category_scope?: "pos" | "warehouse";
  description?: string | null;
  image_base64?: string | null;
  available_for_sale?: boolean;
  is_storable?: boolean;
  uom_id?: number | null;
}

export interface CategoryFormRequest {
  name: string;
  scope?: "pos" | "warehouse";
}

export interface CategoryDeleteResponse {
  ok: boolean;
  category_id: number;
  deleted: boolean;
}

export interface CategoryResponse {
  category: KassCategory;
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
  uom_id?: number | null;
  partner_id?: number | null;
  payment_method?: StockReceiptPaymentMethod;
  paid_amount?: number;
  credit_amount?: number;
  note?: string | null;
}

export type StockReceiptPaymentMethod = "cash" | "credit" | "mixed";

export interface KassStockReceipt {
  receipt_id: string;
  product_id: number;
  product_name: string;
  quantity: number;
  unit_cost: number;
  total_cost: number;
  uom_id?: number | null;
  uom_name?: string | null;
  stock_quantity?: number;
  stock_uom_id?: number | null;
  stock_uom_name?: string | null;
  partner_id?: number | null;
  partner_name?: string | null;
  payment_method?: StockReceiptPaymentMethod;
  paid_amount?: number;
  credit_amount?: number;
  note?: string | null;
  odoo_receipt_id?: number | null;
  odoo_receipt_name?: string | null;
  odoo_receipt_state?: string | null;
  location_id?: number | null;
  location_name?: string | null;
  status: "active" | "returned";
  created_at: string;
  updated_at?: string;
  returned_at?: string;
}

export interface StockReceiptsResponse {
  receipts: KassStockReceipt[];
  active_count: number;
  returned_count: number;
  total_quantity: number;
  total_cost: number;
  paid_total: number;
  credit_total: number;
}

export interface StockReceiptUpdateRequest {
  quantity?: number;
  unit_cost?: number;
  partner_id?: number | null;
  partner_name?: string | null;
  payment_method?: StockReceiptPaymentMethod;
  paid_amount?: number;
  credit_amount?: number;
  note?: string | null;
}

export interface StockReceiptMutationResponse {
  ok: boolean;
  receipt: KassStockReceipt;
  product: KassProduct;
  quantity_delta: number;
}

export interface ProductStockUsageSource {
  product_id: number;
  product_name: string;
  quantity: number;
  orders_count: number;
  last_used_at?: string | null;
  uom_id?: number | null;
  uom_name?: string | null;
}

export interface ProductStockUsageOrder {
  order_id?: string | number;
  receipt_number?: string;
  created_at: string;
  source_product_id: number;
  source_product_name: string;
  sold_quantity: number;
  quantity: number;
  uom_id?: number | null;
  uom_name?: string | null;
}

export interface ProductStockUsageResponse {
  component: {
    product_id: number;
    product_name: string;
    uom_id?: number | null;
    uom_name?: string | null;
  };
  total_quantity: number;
  orders_count: number;
  products: ProductStockUsageSource[];
  orders: ProductStockUsageOrder[];
}

export type FinanceSettlementType = "payable" | "receivable";

export interface FinanceSettlement {
  settlement_id: string;
  type: FinanceSettlementType;
  partner_id?: number | null;
  partner_name: string;
  amount: number;
  note?: string | null;
  created_at: string;
}

export interface FinanceSettlementsResponse {
  settlements: FinanceSettlement[];
}

export interface FinanceSettlementRequest {
  type: FinanceSettlementType;
  partner_id?: number | null;
  partner_name: string;
  amount: number;
  note?: string | null;
}

export interface FinanceSettlementResponse {
  settlement: FinanceSettlement;
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
  uom_id?: number | null;
  uom_name?: string | null;
  stock_quantity_received?: number | null;
  stock_uom_id?: number | null;
  stock_uom_name?: string | null;
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
  stock_receipt?: KassStockReceipt;
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
    role?: KassUserRole;
  };
}

export type KassUserRole = "admin" | "barista";

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
  payment_method?: OrderPaymentMethod;
  payments?: PaymentPart[];
  partner_id?: number | null;
  partner_name?: string | null;
  lines: OrderLineRequest[];
  qpay_transaction_id?: number | null;
  coupon_qr_token?: string | null;
  coupon_pin?: string | null;
}

export interface CreateOrderResponse {
  order_id?: string | number;
  receipt_number?: string;
  payment_method?: OrderPaymentMethod;
  payment_parts?: PaymentPart[];
  partner_id?: number | null;
  partner_name?: string | null;
  total?: number;
  status?: "active" | "returned";
  returned_at?: string;
  order?: {
    id?: string | number;
    order_id?: string | number;
    receipt_number?: string;
    total?: number;
    payment_method?: OrderPaymentMethod;
    payment_parts?: PaymentPart[];
    partner_id?: number | null;
    partner_name?: string | null;
    status?: "active" | "returned";
    returned_at?: string;
  };
  [key: string]: unknown;
}

export interface ReturnOrderResponse {
  ok: boolean;
  order: KassOrderSummary;
}

export interface QpayInvoiceRequest {
  session_id: string;
  lines: OrderLineRequest[];
  amount?: number;
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
  payment_method?: OrderPaymentMethod | "other";
  payment_parts?: PaymentPart[];
  partner_id?: number | null;
  partner_name?: string | null;
  total?: number;
  status?: "active" | "returned";
  created_at?: string;
  returned_at?: string;
  stock_consumptions?: KassStockConsumption[];
  date?: string;
  [key: string]: unknown;
}

export interface SalesProductSummary {
  product_id: number;
  name: string;
  category?: string | null;
  quantity: number;
  total: number;
  unit_cost?: number;
  total_cost?: number;
  net_profit?: number;
  orders_count: number;
  average_price: number;
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
  bank_total: number;
  credit_total: number;
  coupon_total?: number;
  other_total: number;
  cost_total: number;
  net_profit: number;
  profit_margin: number;
  orders_count: number;
  average_order: number;
  average_hourly_sales: number;
  orders: KassOrderSummary[];
  products: SalesProductSummary[];
}

export interface KassReport {
  session_id?: string;
  cashier_name?: string;
  status?: "open" | "closed" | string;
  opened_at?: string;
  closed_at?: string;
  opening_cash?: number;
  closing_cash?: number;
  total_sales?: number;
  cash_total?: number;
  card_total?: number;
  qpay_total?: number;
  bank_total?: number;
  credit_total?: number;
  coupon_total?: number;
  orders_count?: number;
  returned_orders_count?: number;
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
  bank_total?: number;
  credit_total?: number;
  coupon_total?: number;
  orders_count?: number;
  closed_at?: string;
  report?: Partial<KassReport>;
  [key: string]: unknown;
}

export interface KassSessionEvent {
  event_id: string;
  session_id: string;
  type: "session_opened" | "order_created" | "order_returned" | "session_closed" | string;
  cashier_name?: string;
  order_id?: string | number;
  receipt_number?: string;
  payment_method?: OrderPaymentMethod | "other";
  payment_parts?: PaymentPart[];
  partner_id?: number | null;
  partner_name?: string | null;
  amount?: number;
  opening_cash?: number;
  closing_cash?: number;
  expected_cash?: number;
  cash_difference?: number;
  created_at: string;
}

export interface SessionsResponse {
  sessions: KassReport[];
  events: KassSessionEvent[];
  active_session?: KassReport | null;
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
  paymentMethod: OrderPaymentMethod;
  payments: PaymentPart[];
  paidAt: string;
}
