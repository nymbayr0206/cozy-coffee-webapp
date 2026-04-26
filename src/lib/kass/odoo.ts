import { KassServerError } from "./errors";

interface OdooConfig {
  url: string;
  db: string;
  username: string;
  password: string;
  defaultPartnerId: number;
  productModel: "product.product" | "product.template";
  productFilterField: "sale_ok" | "available_in_pos";
}

interface OdooProductRecord {
  id: number;
  name?: string;
  display_name?: string;
  list_price?: number;
  lst_price?: number;
  standard_price?: number;
  barcode?: string | false;
  default_code?: string | false;
  categ_id?: [number, string] | false;
  pos_categ_ids?: number[];
  image_128?: string | false;
  image_1920?: string | false;
  description_sale?: string | false;
  sale_ok?: boolean;
  available_in_pos?: boolean;
  active?: boolean;
  is_storable?: boolean;
  type?: string;
  qty_available?: number;
  virtual_available?: number;
  uom_id?: [number, string] | false;
  product_tmpl_id?: [number, string] | false;
  product_variant_id?: [number, string] | false;
}

interface OdooBomRecord {
  id: number;
  code?: string | false;
  type?: string;
  product_tmpl_id?: [number, string] | false;
  product_id?: [number, string] | false;
  product_qty?: number;
  product_uom_id?: [number, string] | false;
  bom_line_ids?: number[];
}

interface OdooBomLineRecord {
  id: number;
  bom_id?: [number, string] | false;
  product_id?: [number, string] | false;
  product_qty?: number;
  product_uom_id?: [number, string] | false;
}

interface OdooModuleRecord {
  name: string;
  state: string;
}

interface OdooUserRecord {
  id: number;
  name?: string;
  login?: string;
}

interface OdooCategoryRecord {
  id: number;
  name?: string;
  display_name?: string;
  complete_name?: string;
  parent_id?: [number, string] | false;
}

interface OdooUomRecord {
  id: number;
  name?: string;
  display_name?: string;
  category_id?: [number, string] | false;
  uom_type?: string | false;
  active?: boolean;
}

interface NormalizedPosCategory {
  id: number;
  name: string;
  display_name: string;
  parent_id: number | null;
  parent_name: string | null;
}

interface OdooPartnerRecord {
  id: number;
  name?: string;
  display_name?: string;
  phone?: string | false;
  email?: string | false;
  company_registry?: string | false;
  vat?: string | false;
  supplier_rank?: number;
  customer_rank?: number;
  active?: boolean;
}

interface OdooPartnerBankRecord {
  id: number;
  acc_number?: string | false;
  partner_id?: [number, string] | false;
  active?: boolean;
}

function normalizePartner(record: OdooPartnerRecord, bankAccount: string | null = null) {
  return {
    id: record.id,
    name: record.display_name ?? record.name ?? `Partner ${record.id}`,
    phone: record.phone || null,
    email: record.email || null,
    company_register: record.company_registry || record.vat || null,
    bank_account: bankAccount,
    supplier_rank: Number(record.supplier_rank ?? 0),
    customer_rank: Number(record.customer_rank ?? 0),
  };
}

interface OdooSaleOrderRecord {
  id: number;
  name?: string;
  date_order?: string | false;
  amount_total?: number;
  note?: string | false;
  state?: string | false;
}

interface OdooQpayTransactionRecord {
  id: number;
  name?: string | false;
  amount?: number;
  state?: string | false;
  qpay_invoice_id?: string | false;
  qr_text?: string | false;
  qr_image?: string | false;
  qpay_short_url?: string | false;
  qpay_payment_id?: string | false;
  error_message?: string | false;
}

interface ProductWriteInput {
  name?: string;
  sale_price?: number;
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

interface PartnerWriteInput {
  name?: string;
  phone?: string | null;
  email?: string | null;
  company_register?: string | null;
  bank_account?: string | null;
  is_supplier?: boolean;
  is_customer?: boolean;
}

interface RecipeLineInput {
  component_product_id: number;
  quantity: number;
}

interface OdooStockLocationRecord {
  id: number;
  name?: string;
  complete_name?: string;
  usage?: string;
}

interface OdooPickingTypeRecord {
  id: number;
  name?: string;
  code?: string;
  default_location_src_id?: [number, string] | false;
  default_location_dest_id?: [number, string] | false;
}

interface OdooPickingRecord {
  id: number;
  name?: string;
  state?: string;
  move_ids?: number[];
}

interface OdooStockMoveRecord {
  id: number;
  move_line_ids?: number[];
}

interface OdooStockQuantRecord {
  id: number;
  quantity?: number;
  available_quantity?: number;
  inventory_quantity?: number;
  inventory_diff_quantity?: number;
  product_id?: [number, string] | false;
  location_id?: [number, string] | false;
}

interface OdooJsonRpcResponse<T> {
  jsonrpc: "2.0";
  id: number;
  result?: T;
  error?: {
    code?: number;
    message?: string;
    data?: {
      name?: string;
      message?: string;
      debug?: string;
    };
  };
}

let cachedUid: number | null = null;

function getOdooConfig(): OdooConfig {
  const missing = [
    "ODOO_URL",
    "ODOO_DB",
    "ODOO_USERNAME",
    "ODOO_PASSWORD",
    "ODOO_DEFAULT_PARTNER_ID",
  ].filter((key) => !process.env[key]);

  if (missing.length > 0) {
    throw new KassServerError("odoo_config_missing", `Missing Odoo env: ${missing.join(", ")}`, 500);
  }

  const defaultPartnerId = Number(process.env.ODOO_DEFAULT_PARTNER_ID);
  if (!Number.isFinite(defaultPartnerId) || defaultPartnerId <= 0) {
    throw new KassServerError("odoo_config_missing", "ODOO_DEFAULT_PARTNER_ID must be a positive number", 500);
  }

  return {
    url: process.env.ODOO_URL as string,
    db: process.env.ODOO_DB as string,
    username: process.env.ODOO_USERNAME as string,
    password: process.env.ODOO_PASSWORD as string,
    defaultPartnerId,
    productModel:
      process.env.ODOO_PRODUCT_MODEL === "product.template" ? "product.template" : "product.product",
    productFilterField:
      process.env.ODOO_PRODUCT_FILTER_FIELD === "available_in_pos" ? "available_in_pos" : "sale_ok",
  };
}

async function jsonRpc<T>(config: OdooConfig, service: string, method: string, args: unknown[]): Promise<T> {
  let response: Response;

  try {
    response = await fetch(`${config.url.replace(/\/$/, "")}/jsonrpc`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "call",
        params: {
          service,
          method,
          args,
        },
        id: Date.now(),
      }),
      cache: "no-store",
    });
  } catch {
    throw new KassServerError("odoo_connection_failed", "Could not connect to Odoo", 502);
  }

  if (!response.ok) {
    throw new KassServerError("odoo_connection_failed", `Odoo returned HTTP ${response.status}`, 502);
  }

  const payload = (await response.json()) as OdooJsonRpcResponse<T>;

  if (payload.error) {
    const message = payload.error.data?.message ?? payload.error.message ?? "Odoo request failed";
    const debug = payload.error.data?.debug ?? "";

    if (
      message.includes("Invalid model") ||
      message.includes("does not exist") ||
      debug.includes("KeyError") ||
      debug.includes("Invalid field")
    ) {
      throw new KassServerError(
        "odoo_connection_failed",
        `${message}. Required Odoo module may be uninstalled.`,
        502,
      );
    }

    throw new KassServerError("odoo_connection_failed", message, 502);
  }

  return payload.result as T;
}

async function authenticate(config: OdooConfig) {
  if (cachedUid) return cachedUid;

  const uid = await jsonRpc<number | false>(config, "common", "authenticate", [
    config.db,
    config.username,
    config.password,
    {},
  ]);

  if (!uid) {
    throw new KassServerError("odoo_auth_failed", "Odoo authentication failed", 401);
  }

  cachedUid = uid;
  return uid;
}

async function executeKw<T>(
  config: OdooConfig,
  uid: number,
  model: string,
  method: string,
  args: unknown[] = [],
  kwargs: Record<string, unknown> = {},
) {
  return jsonRpc<T>(config, "object", "execute_kw", [
    config.db,
    uid,
    config.password,
    model,
    method,
    args,
    kwargs,
  ]);
}

async function executeKwWithPassword<T>(
  config: OdooConfig,
  uid: number,
  password: string,
  model: string,
  method: string,
  args: unknown[] = [],
  kwargs: Record<string, unknown> = {},
) {
  return jsonRpc<T>(config, "object", "execute_kw", [
    config.db,
    uid,
    password,
    model,
    method,
    args,
    kwargs,
  ]);
}

async function getModuleStates(config: OdooConfig, uid: number) {
  const modules = await executeKw<OdooModuleRecord[]>(
    config,
    uid,
    "ir.module.module",
    "search_read",
    [[["name", "in", ["product", "sale", "stock", "mrp", "point_of_sale", "payment_qpay_custom"]]]],
    { fields: ["name", "state"], limit: 10 },
  );

  return {
    product: modules.find((module) => module.name === "product")?.state ?? "unknown",
    sale: modules.find((module) => module.name === "sale")?.state ?? "unknown",
    stock: modules.find((module) => module.name === "stock")?.state ?? "unknown",
    mrp: modules.find((module) => module.name === "mrp")?.state ?? "unknown",
    point_of_sale: modules.find((module) => module.name === "point_of_sale")?.state ?? "unknown",
    payment_qpay_custom: modules.find((module) => module.name === "payment_qpay_custom")?.state ?? "unknown",
  };
}

function assertModuleInstalled(modules: Record<string, string>, moduleName: string) {
  if (modules[moduleName] !== "installed") {
    throw new KassServerError(
      "odoo_connection_failed",
      `Odoo module '${moduleName}' is ${modules[moduleName] ?? "unknown"}. Install '${moduleName}' module first.`,
      502,
    );
  }
}

async function getFieldNames(config: OdooConfig, uid: number, model: string) {
  const fields = await executeKw<Record<string, unknown>>(config, uid, model, "fields_get", [], {
    attributes: ["string"],
  });

  return new Set(Object.keys(fields));
}

function normalizeProduct(record: OdooProductRecord, isTemplateModel = false, posCategoryMap = new Map<number, string>()) {
  const posCategoryIds = Array.isArray(record.pos_categ_ids) ? record.pos_categ_ids : [];
  const posCategories = posCategoryIds
    .map((categoryId) => posCategoryMap.get(categoryId))
    .filter((categoryName): categoryName is string => Boolean(categoryName));
  const primaryCategory = posCategories[0] ?? (Array.isArray(record.categ_id) ? record.categ_id[1] : null);

  return {
    id: isTemplateModel && Array.isArray(record.product_variant_id) ? record.product_variant_id[0] : record.id,
    name: record.display_name ?? record.name ?? `Product ${record.id}`,
    sale_price: Number(record.lst_price ?? record.list_price ?? 0),
    barcode: record.barcode || null,
    default_code: record.default_code || null,
    category: primaryCategory,
    pos_category_ids: posCategoryIds,
    pos_categories: posCategories,
    image_base64: record.image_128 || null,
    description: record.description_sale || null,
    available_for_sale: record.sale_ok !== false && record.available_in_pos !== false && record.active !== false,
    is_storable: record.is_storable === true || record.type === "product",
    cost_price: Number(record.standard_price ?? 0),
    qty_available: Number(record.qty_available ?? 0),
    virtual_available: Number(record.virtual_available ?? record.qty_available ?? 0),
    uom_id: Array.isArray(record.uom_id) ? record.uom_id[0] : null,
    uom_name: Array.isArray(record.uom_id) ? record.uom_id[1] : null,
  };
}

async function getProductTemplateId(config: OdooConfig, uid: number, productId: number) {
  const records = await executeKw<OdooProductRecord[]>(
    config,
    uid,
    "product.product",
    "read",
    [[productId], ["product_tmpl_id"]],
  );
  const templateId = records[0]?.product_tmpl_id;

  if (!Array.isArray(templateId)) {
    throw new KassServerError("product_not_found", "Бараа олдсонгүй.", 404);
  }

  return templateId[0];
}

async function readProduct(config: OdooConfig, uid: number, productId: number) {
  const productFields = await getFieldNames(config, uid, "product.product");
  const fields = [
    "id",
    "name",
    "display_name",
    "lst_price",
    "standard_price",
    "barcode",
    "default_code",
    "categ_id",
    "pos_categ_ids",
    "image_128",
    "description_sale",
    "sale_ok",
    "available_in_pos",
    "active",
    "is_storable",
    "type",
    "qty_available",
    "virtual_available",
    "uom_id",
  ].filter((field) => productFields.has(field));
  const records = await executeKw<OdooProductRecord[]>(
    config,
    uid,
    "product.product",
    "read",
    [[productId], fields],
  );

  if (!records[0]) {
    throw new KassServerError("product_not_found", "Бараа олдсонгүй.", 404);
  }

  const posCategoryMap = productFields.has("pos_categ_ids") ? await getPosCategoryMap(config, uid) : new Map<number, string>();
  return normalizeProduct(records[0], false, posCategoryMap);
}

function relationId(value: [number, string] | false | undefined) {
  return Array.isArray(value) ? value[0] : null;
}

function relationName(value: [number, string] | false | undefined) {
  return Array.isArray(value) ? value[1] : null;
}

function normalizePosCategory(record: OdooCategoryRecord): NormalizedPosCategory {
  return {
    id: record.id,
    name: record.name ?? record.display_name ?? record.complete_name ?? `Category ${record.id}`,
    display_name: record.display_name ?? record.complete_name ?? record.name ?? `Category ${record.id}`,
    parent_id: Array.isArray(record.parent_id) ? record.parent_id[0] : null,
    parent_name: Array.isArray(record.parent_id) ? record.parent_id[1] : null,
  };
}

async function fetchPosCategoryRecords(config: OdooConfig, uid: number) {
  const categoryFields = await getFieldNames(config, uid, "pos.category");
  const fields = ["id", "name", "display_name", "complete_name", "parent_id"].filter((field) =>
    categoryFields.has(field),
  );
  const records = await executeKw<OdooCategoryRecord[]>(
    config,
    uid,
    "pos.category",
    "search_read",
    [[]],
    {
      fields,
      limit: 500,
      order: categoryFields.has("sequence") ? "sequence asc, name asc" : "name asc",
    },
  );

  return records.map(normalizePosCategory);
}

async function getPosCategoryMap(config: OdooConfig, uid: number) {
  const categories = await fetchPosCategoryRecords(config, uid);
  return new Map(categories.map((category) => [category.id, category.display_name || category.name]));
}

async function readProductForRecipe(config: OdooConfig, uid: number, productId: number) {
  const productFields = await getFieldNames(config, uid, "product.product");
  const fields = [
    "id",
    "name",
    "display_name",
    "product_tmpl_id",
    "uom_id",
    "is_storable",
    "type",
    "qty_available",
    "virtual_available",
  ].filter((field) => productFields.has(field));
  const records = await executeKw<OdooProductRecord[]>(
    config,
    uid,
    "product.product",
    "read",
    [[productId], fields],
  );
  const product = records[0];

  if (!product) {
    throw new KassServerError("product_not_found", "Бараа олдсонгүй.", 404);
  }

  return product;
}

async function readProductsForRecipe(config: OdooConfig, uid: number, productIds: number[]) {
  if (productIds.length === 0) return new Map<number, OdooProductRecord>();

  const productFields = await getFieldNames(config, uid, "product.product");
  const fields = [
    "id",
    "name",
    "display_name",
    "uom_id",
    "is_storable",
    "type",
    "qty_available",
    "virtual_available",
  ].filter((field) => productFields.has(field));
  const records = await executeKw<OdooProductRecord[]>(
    config,
    uid,
    "product.product",
    "read",
    [productIds, fields],
  );

  return new Map(records.map((record) => [record.id, record]));
}

async function readPrimaryBom(config: OdooConfig, uid: number, productId: number, templateId: number) {
  const bomFields = await getFieldNames(config, uid, "mrp.bom");
  const fields = [
    "id",
    "code",
    "type",
    "product_tmpl_id",
    "product_id",
    "product_qty",
    "product_uom_id",
    "bom_line_ids",
  ].filter((field) => bomFields.has(field));
  const domain: unknown[] = bomFields.has("product_id")
    ? ["|", ["product_id", "=", productId], ["product_tmpl_id", "=", templateId]]
    : [["product_tmpl_id", "=", templateId]];
  const records = await executeKw<OdooBomRecord[]>(
    config,
    uid,
    "mrp.bom",
    "search_read",
    [domain],
    { fields, limit: 1, order: "id asc" },
  );

  return records[0] ?? null;
}

async function readBomLines(config: OdooConfig, uid: number, bomId: number) {
  const lineFields = await getFieldNames(config, uid, "mrp.bom.line");
  const fields = ["id", "bom_id", "product_id", "product_qty", "product_uom_id"].filter((field) =>
    lineFields.has(field),
  );

  return executeKw<OdooBomLineRecord[]>(
    config,
    uid,
    "mrp.bom.line",
    "search_read",
    [[["bom_id", "=", bomId]]],
    { fields, limit: 500, order: "id asc" },
  );
}

function normalizeRecipe(product: OdooProductRecord, bom: OdooBomRecord | null, lines: OdooBomLineRecord[], components: Map<number, OdooProductRecord>) {
  return {
    bom_id: bom?.id ?? null,
    product_id: product.id,
    product_name: product.display_name ?? product.name ?? `Product ${product.id}`,
    quantity: Number(bom?.product_qty ?? 1),
    uom_id: relationId(bom?.product_uom_id) ?? relationId(product.uom_id),
    uom_name: relationName(bom?.product_uom_id) ?? relationName(product.uom_id),
    lines: lines.map((line) => {
      const componentId = relationId(line.product_id);
      const component = componentId ? components.get(componentId) : null;

      return {
        id: line.id,
        component_product_id: componentId,
        component_name:
          component?.display_name ?? component?.name ?? relationName(line.product_id) ?? `Product ${componentId ?? ""}`,
        quantity: Number(line.product_qty ?? 0),
        uom_id: relationId(line.product_uom_id) ?? relationId(component?.uom_id),
        uom_name: relationName(line.product_uom_id) ?? relationName(component?.uom_id),
        is_storable: component ? component.is_storable === true || component.type === "product" : null,
        qty_available: component ? Number(component.qty_available ?? 0) : null,
        virtual_available: component
          ? Number(component.virtual_available ?? component.qty_available ?? 0)
          : null,
      };
    }),
  };
}

function cleanBarcode(value: unknown) {
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : false;
}

function cleanOptionalText(value: unknown) {
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : false;
}

function cleanImageBase64(value: unknown) {
  if (value === null) return false;
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return false;

  const commaIndex = trimmed.indexOf(",");
  if (trimmed.startsWith("data:image") && commaIndex >= 0) {
    return trimmed.slice(commaIndex + 1);
  }

  return trimmed;
}

async function findOrCreateCategory(config: OdooConfig, uid: number, value: unknown) {
  const name = cleanOptionalText(value);
  if (!name) return null;
  const categoryFields = await getFieldNames(config, uid, "product.category");
  const domain = categoryFields.has("complete_name")
    ? ["|", ["complete_name", "=", name], ["name", "=", name]]
    : [["name", "=", name]];

  const existing = await executeKw<Array<{ id: number }>>(
    config,
    uid,
    "product.category",
    "search_read",
    [domain],
    { fields: ["id"], limit: 1 },
  );

  if (existing[0]?.id) return existing[0].id;

  const categoryName = name.includes("/") ? name.split("/").pop()?.trim() || name : name;
  return executeKw<number>(config, uid, "product.category", "create", [{ name: categoryName }]);
}

async function findOrCreatePosCategory(config: OdooConfig, uid: number, value: unknown) {
  const name = cleanOptionalText(value);
  if (!name) return null;
  const categoryFields = await getFieldNames(config, uid, "pos.category");
  const domain = categoryFields.has("display_name")
    ? ["|", ["display_name", "=", name], ["name", "=", name]]
    : [["name", "=", name]];

  const existing = await executeKw<Array<{ id: number }>>(
    config,
    uid,
    "pos.category",
    "search_read",
    [domain],
    { fields: ["id"], limit: 1 },
  );

  if (existing[0]?.id) return existing[0].id;

  const categoryName = name.includes("/") ? name.split("/").pop()?.trim() || name : name;
  return executeKw<number>(config, uid, "pos.category", "create", [{ name: categoryName }]);
}

async function productTemplateValues(
  config: OdooConfig,
  uid: number,
  fields: Set<string>,
  input: ProductWriteInput,
) {
  const values: Record<string, unknown> = {};

  if (input.name !== undefined) values.name = input.name;
  if (input.sale_price !== undefined) values.list_price = input.sale_price;
  if (input.barcode !== undefined && fields.has("barcode")) values.barcode = cleanBarcode(input.barcode);
  if (input.default_code !== undefined && fields.has("default_code")) {
    values.default_code = cleanOptionalText(input.default_code);
  }
  if (input.description !== undefined && fields.has("description_sale")) {
    values.description_sale = cleanOptionalText(input.description);
  }
  if (input.category !== undefined) {
    if (input.category_scope === "warehouse") {
      if (fields.has("categ_id")) {
        const categoryId = await findOrCreateCategory(config, uid, input.category);
        if (categoryId) values.categ_id = categoryId;
      }
    } else if (fields.has("pos_categ_ids")) {
      const categoryId = await findOrCreatePosCategory(config, uid, input.category);
      values.pos_categ_ids = categoryId ? [[6, 0, [categoryId]]] : [[5, 0, 0]];
    } else if (fields.has("categ_id")) {
      const categoryId = await findOrCreateCategory(config, uid, input.category);
      if (categoryId) values.categ_id = categoryId;
    }
  }
  if (input.image_base64 !== undefined) {
    const imageValue = cleanImageBase64(input.image_base64);
    if (imageValue !== undefined) {
      if (fields.has("image_1920")) values.image_1920 = imageValue;
      else if (fields.has("image_128")) values.image_128 = imageValue;
    }
  }
  if (input.available_for_sale !== undefined) {
    if (fields.has("sale_ok")) values.sale_ok = input.available_for_sale;
    if (fields.has("available_in_pos")) values.available_in_pos = input.available_for_sale;
  }
  if (input.is_storable !== undefined) {
    if (fields.has("is_storable")) values.is_storable = input.is_storable;
    else if (fields.has("type")) values.type = input.is_storable ? "product" : "consu";
  }
  if (input.uom_id !== undefined && input.uom_id !== null) {
    if (!Number.isInteger(input.uom_id) || input.uom_id <= 0) {
      throw new KassServerError("validation_error", "Хэмжих нэгж буруу байна.", 400);
    }

    if (fields.has("uom_id")) values.uom_id = input.uom_id;
    if (fields.has("uom_po_id")) values.uom_po_id = input.uom_id;
  }

  return values;
}

function productVariantValues(fields: Set<string>, templateFields: Set<string>, input: ProductWriteInput) {
  const values: Record<string, unknown> = {};

  if (input.barcode !== undefined && fields.has("barcode") && !templateFields.has("barcode")) {
    values.barcode = cleanBarcode(input.barcode);
  }
  if (input.default_code !== undefined && fields.has("default_code") && !templateFields.has("default_code")) {
    values.default_code = cleanOptionalText(input.default_code);
  }

  return values;
}

export async function checkOdooHealth() {
  try {
    const config = getOdooConfig();
    const uid = await authenticate(config);
    const modules = await getModuleStates(config, uid);

    return {
      ok: true,
      status: "ok",
      odoo: {
        connected: true,
        status: "connected",
        configured: true,
        db: config.db,
        uid,
        modules,
      },
    };
  } catch (error) {
    if (error instanceof KassServerError) {
      return {
        ok: false,
        status: "error",
        odoo: {
          connected: false,
          status: error.code,
          configured: error.code !== "odoo_config_missing",
          db: process.env.ODOO_DB ?? null,
          message: error.message,
        },
      };
    }

    return {
      ok: false,
      status: "error",
      odoo: {
        connected: false,
        status: "odoo_connection_failed",
        message: "Unknown Odoo health check error",
      },
    };
  }
}

export async function loginOdooUser(username: string, password: string) {
  const config = getOdooConfig();
  const uid = await jsonRpc<number | false>(config, "common", "authenticate", [
    config.db,
    username,
    password,
    {},
  ]);

  if (!uid) {
    throw new KassServerError("odoo_auth_failed", "Odoo нэвтрэх нэр эсвэл нууц үг буруу байна.", 401);
  }

  const users = await executeKwWithPassword<OdooUserRecord[]>(
    config,
    uid,
    password,
    "res.users",
    "read",
    [[uid], ["name", "login"]],
  );
  const user = users[0];

  return {
    user_id: uid,
    name: user?.name ?? username,
    login: user?.login ?? username,
  };
}

export async function fetchOdooProducts(options: { scope?: "pos" | "all" | "hidden" | "production" | "stock" } = {}) {
  const config = getOdooConfig();
  const uid = await authenticate(config);
  const modules = await getModuleStates(config, uid);
  assertModuleInstalled(modules, "product");

  const isTemplateModel = config.productModel === "product.template";
  const priceField = isTemplateModel ? "list_price" : "lst_price";
  const modelFields = await getFieldNames(config, uid, config.productModel);
  const filterField = modelFields.has(config.productFilterField) ? config.productFilterField : "sale_ok";
  const fields = [
    "id",
    "name",
    "display_name",
    priceField,
    "standard_price",
    "barcode",
    "default_code",
    "categ_id",
    "pos_categ_ids",
    "image_128",
    "description_sale",
    filterField,
    "active",
    "is_storable",
    "type",
    "qty_available",
    "virtual_available",
    "uom_id",
    ...(isTemplateModel ? ["product_variant_id"] : []),
  ].filter((field) => modelFields.has(field));
  const scope = options.scope ?? "pos";
  const domain: unknown[] = [];

  if (scope === "pos" && modelFields.has("available_in_pos")) {
    domain.push(["available_in_pos", "=", true]);
  } else if (scope === "pos" && modelFields.has(filterField)) {
    domain.push([filterField, "=", true]);
  }

  if (scope === "hidden" && modelFields.has("available_in_pos")) {
    domain.push(["available_in_pos", "=", false]);
  } else if (scope === "hidden" && modelFields.has(filterField)) {
    domain.push([filterField, "=", false]);
  }

  if (scope === "stock") {
    if (modelFields.has("is_storable")) domain.push(["is_storable", "=", true]);
    else if (modelFields.has("type")) domain.push(["type", "=", "product"]);
  }

  if (scope === "production") {
    if (modelFields.has("available_in_pos")) domain.push(["available_in_pos", "=", true]);
    else if (modelFields.has(filterField)) domain.push([filterField, "=", true]);
    if (modelFields.has("is_storable")) domain.push(["is_storable", "=", false]);
    else if (modelFields.has("type")) domain.push(["type", "!=", "product"]);
  }

  const posCategoryMap = modelFields.has("pos_categ_ids") ? await getPosCategoryMap(config, uid) : new Map<number, string>();
  const records = await executeKw<OdooProductRecord[]>(
    config,
    uid,
    config.productModel,
    "search_read",
    [domain],
    {
      fields,
      limit: 500,
      order: "name asc",
    },
  );

  return {
    products: records.map((record) => normalizeProduct(record, isTemplateModel, posCategoryMap)),
  };
}

export async function fetchOdooProductRecipe(productId: number) {
  const config = getOdooConfig();
  const uid = await authenticate(config);
  const modules = await getModuleStates(config, uid);
  assertModuleInstalled(modules, "product");
  assertModuleInstalled(modules, "mrp");

  const product = await readProductForRecipe(config, uid, productId);
  const templateId = relationId(product.product_tmpl_id);

  if (!templateId) {
    throw new KassServerError("product_not_found", "Барааны template олдсонгүй.", 404);
  }

  const bom = await readPrimaryBom(config, uid, productId, templateId);
  const lines = bom ? await readBomLines(config, uid, bom.id) : [];
  const componentIds = lines
    .map((line) => relationId(line.product_id))
    .filter((id): id is number => typeof id === "number");
  const components = await readProductsForRecipe(config, uid, componentIds);

  return {
    recipe: normalizeRecipe(product, bom, lines, components),
  };
}

export async function upsertOdooProductRecipe(productId: number, input: { lines: RecipeLineInput[] }) {
  const config = getOdooConfig();
  const uid = await authenticate(config);
  const modules = await getModuleStates(config, uid);
  assertModuleInstalled(modules, "product");
  assertModuleInstalled(modules, "mrp");

  const product = await readProductForRecipe(config, uid, productId);
  const templateId = relationId(product.product_tmpl_id);
  const productUomId = relationId(product.uom_id);

  if (!templateId) {
    throw new KassServerError("product_not_found", "Барааны template олдсонгүй.", 404);
  }

  const mergedLines = new Map<number, number>();
  input.lines.forEach((line) => {
    if (!Number.isInteger(line.component_product_id) || line.component_product_id <= 0) {
      throw new KassServerError("validation_error", "Орцын бараа сонгоно уу.", 400);
    }

    if (!Number.isFinite(line.quantity) || line.quantity <= 0) {
      throw new KassServerError("validation_error", "Орцын тоо хэмжээ 0-ээс их байх ёстой.", 400);
    }

    mergedLines.set(
      line.component_product_id,
      Number(mergedLines.get(line.component_product_id) ?? 0) + line.quantity,
    );
  });

  const componentIds = Array.from(mergedLines.keys());
  const components = await readProductsForRecipe(config, uid, componentIds);
  const missingComponentIds = componentIds.filter((componentId) => !components.has(componentId));

  if (missingComponentIds.length > 0) {
    throw new KassServerError("product_not_found", `Орцын бараа олдсонгүй: ${missingComponentIds.join(", ")}`, 404);
  }

  componentIds.forEach((componentId) => {
    if (componentId === productId) {
      throw new KassServerError("validation_error", "Бараа өөрөө өөрийнхөө орц байж болохгүй.", 400);
    }

    const component = components.get(componentId);
    const isStorable = component?.is_storable === true || component?.type === "product";

    if (!isStorable) {
      throw new KassServerError(
        "validation_error",
        "Орц нь агуулахын үлдэгдэл хөтөлдөг бараа байх ёстой.",
        400,
      );
    }
  });

  const bom = await readPrimaryBom(config, uid, productId, templateId);

  if (componentIds.length === 0) {
    if (bom) {
      await executeKw<boolean>(config, uid, "mrp.bom", "unlink", [[bom.id]]);
    }

    return {
      recipe: normalizeRecipe(product, null, [], components),
    };
  }

  const bomFields = await getFieldNames(config, uid, "mrp.bom");
  const lineValues = componentIds.map((componentId) => {
    const component = components.get(componentId);
    const componentUomId = relationId(component?.uom_id);
    const values: Record<string, unknown> = {
      product_id: componentId,
      product_qty: mergedLines.get(componentId),
    };

    if (componentUomId) values.product_uom_id = componentUomId;
    return [0, 0, values];
  });
  const bomValues: Record<string, unknown> = {
    product_tmpl_id: templateId,
    product_qty: 1,
    bom_line_ids: lineValues,
  };

  if (productUomId && bomFields.has("product_uom_id")) bomValues.product_uom_id = productUomId;
  if (bomFields.has("product_id")) bomValues.product_id = productId;
  if (bomFields.has("type")) bomValues.type = "normal";

  let bomId = bom?.id ?? null;

  if (bomId) {
    await executeKw<boolean>(config, uid, "mrp.bom", "write", [
      [bomId],
      {
        bom_line_ids: [[5, 0, 0], ...lineValues],
      },
    ]);
  } else {
    bomId = await executeKw<number>(config, uid, "mrp.bom", "create", [bomValues]);
  }

  const savedBom = await readPrimaryBom(config, uid, productId, templateId);
  const savedLines = savedBom ? await readBomLines(config, uid, savedBom.id) : [];
  const savedComponentIds = savedLines
    .map((line) => relationId(line.product_id))
    .filter((id): id is number => typeof id === "number");
  const savedComponents = await readProductsForRecipe(config, uid, savedComponentIds);

  return {
    recipe: normalizeRecipe(product, savedBom ?? (bomId ? { id: bomId } : null), savedLines, savedComponents),
  };
}

export async function fetchOdooProductCategories() {
  const config = getOdooConfig();
  const uid = await authenticate(config);
  const modules = await getModuleStates(config, uid);
  assertModuleInstalled(modules, "point_of_sale");
  const categories = await fetchPosCategoryRecords(config, uid);

  return {
    categories,
  };
}

export async function fetchOdooWarehouseCategories() {
  const config = getOdooConfig();
  const uid = await authenticate(config);
  const modules = await getModuleStates(config, uid);
  assertModuleInstalled(modules, "product");
  const categoryFields = await getFieldNames(config, uid, "product.category");
  const fields = ["id", "name", "display_name", "complete_name", "parent_id"].filter((field) =>
    categoryFields.has(field),
  );
  const records = await executeKw<OdooCategoryRecord[]>(
    config,
    uid,
    "product.category",
    "search_read",
    [[]],
    {
      fields,
      limit: 500,
      order: categoryFields.has("complete_name") ? "complete_name asc" : "name asc",
    },
  );

  return {
    categories: records.map(normalizePosCategory),
  };
}

export async function createOdooProductCategory(input: { name: string; scope?: "pos" | "warehouse" }) {
  const name = cleanOptionalText(input.name);
  if (!name) {
    throw new KassServerError("validation_error", "Ангиллын нэр оруулна уу.", 400);
  }

  const config = getOdooConfig();
  const uid = await authenticate(config);
  const modules = await getModuleStates(config, uid);

  try {
    if (input.scope === "warehouse") {
      assertModuleInstalled(modules, "product");
      const categoryId = await findOrCreateCategory(config, uid, name);
      if (!categoryId) throw new KassServerError("category_create_failed", "Ангилал үүссэнгүй.", 502);
      const categoryFields = await getFieldNames(config, uid, "product.category");
      const fields = ["id", "name", "display_name", "complete_name", "parent_id"].filter((field) =>
        categoryFields.has(field),
      );
      const records = await executeKw<OdooCategoryRecord[]>(config, uid, "product.category", "read", [
        [categoryId],
        fields,
      ]);
      return normalizePosCategory(records[0]);
    }

    assertModuleInstalled(modules, "point_of_sale");
    const categoryId = await findOrCreatePosCategory(config, uid, name);
    if (!categoryId) throw new KassServerError("category_create_failed", "Ангилал үүссэнгүй.", 502);
    const categoryFields = await getFieldNames(config, uid, "pos.category");
    const fields = ["id", "name", "display_name", "complete_name", "parent_id"].filter((field) =>
      categoryFields.has(field),
    );
    const records = await executeKw<OdooCategoryRecord[]>(config, uid, "pos.category", "read", [
      [categoryId],
      fields,
    ]);
    return normalizePosCategory(records[0]);
  } catch (error) {
    if (error instanceof KassServerError) throw error;
    throw new KassServerError("category_create_failed", "Odoo дээр ангилал нэмэхэд алдаа гарлаа.", 502);
  }
}

export async function deleteOdooProductCategory(categoryId: number, scope: "pos" | "warehouse" = "warehouse") {
  if (!Number.isInteger(categoryId) || categoryId <= 0) {
    throw new KassServerError("validation_error", "category id буруу байна.", 400);
  }

  const config = getOdooConfig();
  const uid = await authenticate(config);
  const modules = await getModuleStates(config, uid);

  try {
    if (scope === "warehouse") {
      assertModuleInstalled(modules, "product");

      const existing = await executeKw<OdooCategoryRecord[]>(config, uid, "product.category", "read", [
        [categoryId],
        ["id", "name", "display_name", "complete_name", "parent_id"],
      ]);

      if (!existing[0]) {
        throw new KassServerError("validation_error", "Ангилал олдсонгүй.", 404);
      }

      const productCount = await executeKw<number>(config, uid, "product.template", "search_count", [
        [["categ_id", "=", categoryId]],
      ]);
      if (productCount > 0) {
        throw new KassServerError(
          "validation_error",
          "Энэ ангилалд агуулахын бараа оноогдсон байна. Эхлээд бараануудын ангиллыг солих буюу хоослоно уу.",
          409,
        );
      }

      const childCount = await executeKw<number>(config, uid, "product.category", "search_count", [
        [["parent_id", "=", categoryId]],
      ]);
      if (childCount > 0) {
        throw new KassServerError(
          "validation_error",
          "Энэ ангилал дэд ангилалтай байна. Эхлээд дэд ангиллыг устгана уу.",
          409,
        );
      }

      const deleted = await executeKw<boolean>(config, uid, "product.category", "unlink", [[categoryId]]);
      return { ok: Boolean(deleted), category_id: categoryId, deleted: Boolean(deleted) };
    }

    assertModuleInstalled(modules, "point_of_sale");
    const categoryFields = await getFieldNames(config, uid, "pos.category");
    const existing = await executeKw<OdooCategoryRecord[]>(config, uid, "pos.category", "read", [
      [categoryId],
      ["id", "name", "display_name", "parent_id"].filter((field) => categoryFields.has(field)),
    ]);

    if (!existing[0]) {
      throw new KassServerError("validation_error", "Ангилал олдсонгүй.", 404);
    }

    const productFields = await getFieldNames(config, uid, "product.template");
    if (productFields.has("pos_categ_ids")) {
      const productCount = await executeKw<number>(config, uid, "product.template", "search_count", [
        [["pos_categ_ids", "in", [categoryId]]],
      ]);
      if (productCount > 0) {
        throw new KassServerError(
          "validation_error",
          "Энэ POS ангилалд кассын бүтээгдэхүүн оноогдсон байна. Эхлээд бүтээгдэхүүнүүдийн ангиллыг солино уу.",
          409,
        );
      }
    }

    if (categoryFields.has("parent_id")) {
      const childCount = await executeKw<number>(config, uid, "pos.category", "search_count", [
        [["parent_id", "=", categoryId]],
      ]);
      if (childCount > 0) {
        throw new KassServerError(
          "validation_error",
          "Энэ ангилал дэд ангилалтай байна. Эхлээд дэд ангиллыг устгана уу.",
          409,
        );
      }
    }

    const deleted = await executeKw<boolean>(config, uid, "pos.category", "unlink", [[categoryId]]);
    return { ok: Boolean(deleted), category_id: categoryId, deleted: Boolean(deleted) };
  } catch (error) {
    if (error instanceof KassServerError) throw error;
    throw new KassServerError("category_delete_failed", "Odoo дээр ангилал устгахад алдаа гарлаа.", 502);
  }
}

export async function fetchOdooProductUoms() {
  const config = getOdooConfig();
  const uid = await authenticate(config);
  const modules = await getModuleStates(config, uid);
  assertModuleInstalled(modules, "product");

  const uomFields = await getFieldNames(config, uid, "uom.uom");
  const fields = ["id", "name", "display_name", "category_id", "uom_type", "active"].filter((field) =>
    uomFields.has(field),
  );
  const domain = uomFields.has("active") ? [["active", "=", true]] : [];
  const records = await executeKw<OdooUomRecord[]>(
    config,
    uid,
    "uom.uom",
    "search_read",
    [domain],
    {
      fields,
      limit: 500,
      order: uomFields.has("category_id") ? "category_id asc, name asc" : "name asc",
    },
  );

  return {
    uoms: records.map((record) => ({
      id: record.id,
      name: record.name ?? record.display_name ?? `UoM ${record.id}`,
      display_name: record.display_name ?? record.name ?? `UoM ${record.id}`,
      category_id: Array.isArray(record.category_id) ? record.category_id[0] : null,
      category_name: Array.isArray(record.category_id) ? record.category_id[1] : null,
      uom_type: record.uom_type || null,
    })),
  };
}

function normalizeUom(record: OdooUomRecord) {
  return {
    id: record.id,
    name: record.name ?? record.display_name ?? `UoM ${record.id}`,
    display_name: record.display_name ?? record.name ?? `UoM ${record.id}`,
    category_id: Array.isArray(record.category_id) ? record.category_id[0] : null,
    category_name: Array.isArray(record.category_id) ? record.category_id[1] : null,
    uom_type: record.uom_type || null,
  };
}

export async function createOdooProductUom(input: {
  name: string;
  category_id: number;
  uom_type?: "reference" | "bigger" | "smaller";
  factor_inv?: number | null;
}) {
  const name = cleanOptionalText(input.name);
  if (!name) {
    throw new KassServerError("validation_error", "Хэмжих нэгжийн нэр оруулна уу.", 400);
  }

  if (!Number.isInteger(input.category_id) || input.category_id <= 0) {
    throw new KassServerError("validation_error", "Хэмжих нэгжийн ангилал буруу байна.", 400);
  }

  const config = getOdooConfig();
  const uid = await authenticate(config);
  const modules = await getModuleStates(config, uid);
  assertModuleInstalled(modules, "product");

  try {
    const uomFields = await getFieldNames(config, uid, "uom.uom");
    const values: Record<string, unknown> = {
      name,
      category_id: input.category_id,
    };
    const uomType = input.uom_type ?? "reference";

    if (uomFields.has("uom_type")) values.uom_type = uomType;
    if (input.factor_inv && input.factor_inv > 0 && uomType !== "reference") {
      if (uomFields.has("factor_inv")) values.factor_inv = input.factor_inv;
      else if (uomFields.has("factor")) values.factor = 1 / input.factor_inv;
    }
    if (uomFields.has("active")) values.active = true;

    const uomId = await executeKw<number>(config, uid, "uom.uom", "create", [values]);
    const fields = ["id", "name", "display_name", "category_id", "uom_type", "active"].filter((field) =>
      uomFields.has(field),
    );
    const records = await executeKw<OdooUomRecord[]>(config, uid, "uom.uom", "read", [[uomId], fields]);

    return normalizeUom(records[0]);
  } catch (error) {
    if (error instanceof KassServerError) throw error;
    throw new KassServerError("validation_error", "Odoo дээр хэмжих нэгж нэмэхэд алдаа гарлаа.", 502);
  }
}

export async function deleteOdooProductUom(uomId: number) {
  if (!Number.isInteger(uomId) || uomId <= 0) {
    throw new KassServerError("validation_error", "Хэмжих нэгжийн ID буруу байна.", 400);
  }

  const config = getOdooConfig();
  const uid = await authenticate(config);
  const modules = await getModuleStates(config, uid);
  assertModuleInstalled(modules, "product");

  try {
    const uomFields = await getFieldNames(config, uid, "uom.uom");
    if (uomFields.has("active")) {
      const archived = await executeKw<boolean>(config, uid, "uom.uom", "write", [[uomId], { active: false }]);
      return { ok: Boolean(archived), uom_id: uomId, archived: Boolean(archived) };
    }

    const deleted = await executeKw<boolean>(config, uid, "uom.uom", "unlink", [[uomId]]);
    return { ok: Boolean(deleted), uom_id: uomId, archived: false };
  } catch (error) {
    if (error instanceof KassServerError) throw error;
    throw new KassServerError("validation_error", "Odoo дээр хэмжих нэгж хасахад алдаа гарлаа.", 502);
  }
}

export async function fetchOdooPartners() {
  const config = getOdooConfig();
  const uid = await authenticate(config);
  const partnerFields = await getFieldNames(config, uid, "res.partner");
  const fields = [
    "id",
    "name",
    "display_name",
    "phone",
    "email",
    "company_registry",
    "vat",
    "supplier_rank",
    "customer_rank",
    "active",
  ].filter((field) => partnerFields.has(field));
  const domain = partnerFields.has("active") ? [["active", "=", true]] : [];
  const records = await executeKw<OdooPartnerRecord[]>(
    config,
    uid,
    "res.partner",
    "search_read",
    [domain],
    {
      fields,
      limit: 500,
      order: partnerFields.has("name") ? "name asc" : "id asc",
    },
  );
  const bankAccounts = await readPartnerBankAccountMap(
    config,
    uid,
    records.map((record) => record.id),
  );

  return {
    partners: records.map((record) => normalizePartner(record, bankAccounts.get(record.id) ?? null)),
  };
}

export async function createOdooPartner(input: {
  name: string;
  phone?: string | null;
  email?: string | null;
  company_register?: string | null;
  bank_account?: string | null;
  is_supplier?: boolean;
  is_customer?: boolean;
}) {
  const name = cleanOptionalText(input.name);
  if (!name) {
    throw new KassServerError("validation_error", "Харилцагчийн нэр оруулна уу.", 400);
  }

  const config = getOdooConfig();
  const uid = await authenticate(config);

  try {
    const partnerFields = await getFieldNames(config, uid, "res.partner");
    const values: Record<string, unknown> = { name };
    const phone = cleanOptionalText(input.phone);
    const email = cleanOptionalText(input.email);
    const companyRegister = cleanOptionalText(input.company_register);

    if (phone && partnerFields.has("phone")) values.phone = phone;
    if (email && partnerFields.has("email")) values.email = email;
    if (companyRegister) applyPartnerCompanyRegister(values, partnerFields, companyRegister);
    if (partnerFields.has("supplier_rank")) values.supplier_rank = input.is_supplier === false ? 0 : 1;
    if (partnerFields.has("customer_rank")) values.customer_rank = input.is_customer ? 1 : 0;
    if (partnerFields.has("active")) values.active = true;

    const partnerId = await executeKw<number>(config, uid, "res.partner", "create", [values]);
    await syncPartnerBankAccount(config, uid, partnerId, input.bank_account, "partner_create_failed");
    return readPartner(config, uid, partnerId);
  } catch (error) {
    if (error instanceof KassServerError) throw error;
    throw new KassServerError("partner_create_failed", "Odoo дээр харилцагч нэмэхэд алдаа гарлаа.", 502);
  }
}

function applyPartnerCompanyRegister(
  values: Record<string, unknown>,
  partnerFields: Set<string>,
  companyRegister: string | false,
) {
  if (partnerFields.has("company_registry")) {
    values.company_registry = companyRegister || false;
    return;
  }

  if (partnerFields.has("vat")) {
    values.vat = companyRegister || false;
  }
}

function partnerWriteValues(partnerFields: Set<string>, input: PartnerWriteInput) {
  const values: Record<string, unknown> = {};

  if (input.name !== undefined) {
    const name = cleanOptionalText(input.name);
    if (!name) {
      throw new KassServerError("validation_error", "Харилцагчийн нэр оруулна уу.", 400);
    }
    values.name = name;
  }

  if (input.phone !== undefined && partnerFields.has("phone")) {
    values.phone = cleanOptionalText(input.phone) || false;
  }

  if (input.email !== undefined && partnerFields.has("email")) {
    values.email = cleanOptionalText(input.email) || false;
  }

  if (input.company_register !== undefined) {
    applyPartnerCompanyRegister(values, partnerFields, cleanOptionalText(input.company_register));
  }

  if (input.is_supplier !== undefined && partnerFields.has("supplier_rank")) {
    values.supplier_rank = input.is_supplier ? 1 : 0;
  }

  if (input.is_customer !== undefined && partnerFields.has("customer_rank")) {
    values.customer_rank = input.is_customer ? 1 : 0;
  }

  if (partnerFields.has("active")) {
    values.active = true;
  }

  return values;
}

async function readPartnerBankAccountMap(config: OdooConfig, uid: number, partnerIds: number[]) {
  const result = new Map<number, string>();
  if (partnerIds.length === 0) return result;

  try {
    const bankFields = await getFieldNames(config, uid, "res.partner.bank");
    if (!bankFields.has("partner_id") || !bankFields.has("acc_number")) return result;

    const domain: unknown[] = [["partner_id", "in", partnerIds]];
    if (bankFields.has("active")) domain.push(["active", "=", true]);

    const fields = ["id", "acc_number", "partner_id", "active"].filter((field) => bankFields.has(field));
    const records = await executeKw<OdooPartnerBankRecord[]>(
      config,
      uid,
      "res.partner.bank",
      "search_read",
      [domain],
      { fields, limit: Math.max(partnerIds.length * 3, 100), order: "id asc" },
    );

    for (const record of records) {
      const partnerId = Array.isArray(record.partner_id) ? record.partner_id[0] : null;
      if (partnerId && !result.has(partnerId) && record.acc_number) {
        result.set(partnerId, record.acc_number);
      }
    }
  } catch {
    return result;
  }

  return result;
}

async function syncPartnerBankAccount(
  config: OdooConfig,
  uid: number,
  partnerId: number,
  bankAccount: string | null | undefined,
  failureCode: "partner_create_failed" | "partner_update_failed" = "partner_update_failed",
) {
  if (bankAccount === undefined) return;

  const bankFields = await getFieldNames(config, uid, "res.partner.bank");
  if (!bankFields.has("partner_id") || !bankFields.has("acc_number")) {
    throw new KassServerError(failureCode, "Odoo дээр харилцагчийн дансны талбар олдсонгүй.", 502);
  }

  const domain: unknown[] = [["partner_id", "=", partnerId]];
  if (bankFields.has("active")) domain.push(["active", "=", true]);

  const records = await executeKw<OdooPartnerBankRecord[]>(
    config,
    uid,
    "res.partner.bank",
    "search_read",
    [domain],
    { fields: ["id", "acc_number"].filter((field) => bankFields.has(field)), limit: 1, order: "id asc" },
  );
  const existingId = records[0]?.id;
  const account = cleanOptionalText(bankAccount);

  if (account) {
    if (existingId) {
      await executeKw<boolean>(config, uid, "res.partner.bank", "write", [[existingId], { acc_number: account }]);
      return;
    }

    const values: Record<string, unknown> = {
      partner_id: partnerId,
      acc_number: account,
    };
    if (bankFields.has("active")) values.active = true;
    await executeKw<number>(config, uid, "res.partner.bank", "create", [values]);
    return;
  }

  if (existingId) {
    if (bankFields.has("active")) {
      await executeKw<boolean>(config, uid, "res.partner.bank", "write", [[existingId], { active: false }]);
    } else {
      await executeKw<boolean>(config, uid, "res.partner.bank", "unlink", [[existingId]]);
    }
  }
}

export async function updateOdooPartner(partnerId: number, input: PartnerWriteInput) {
  const config = getOdooConfig();
  const uid = await authenticate(config);

  try {
    await readPartner(config, uid, partnerId);
    const partnerFields = await getFieldNames(config, uid, "res.partner");
    const values = partnerWriteValues(partnerFields, input);

    if (Object.keys(values).length > 0) {
      await executeKw<boolean>(config, uid, "res.partner", "write", [[partnerId], values]);
    }

    await syncPartnerBankAccount(config, uid, partnerId, input.bank_account);
    return readPartner(config, uid, partnerId);
  } catch (error) {
    if (error instanceof KassServerError) throw error;
    throw new KassServerError("partner_update_failed", "Odoo дээр харилцагч засахад алдаа гарлаа.", 502);
  }
}

export async function archiveOdooPartner(partnerId: number) {
  const config = getOdooConfig();
  const uid = await authenticate(config);

  if (partnerId === config.defaultPartnerId) {
    throw new KassServerError("validation_error", "Үндсэн харилцагчийг устгах боломжгүй.", 400);
  }

  try {
    await readPartner(config, uid, partnerId);
    const partnerFields = await getFieldNames(config, uid, "res.partner");

    if (partnerFields.has("active")) {
      await executeKw<boolean>(config, uid, "res.partner", "write", [[partnerId], { active: false }]);
    } else {
      await executeKw<boolean>(config, uid, "res.partner", "unlink", [[partnerId]]);
    }

    return { ok: true, partner_id: partnerId, archived: true };
  } catch (error) {
    if (error instanceof KassServerError) throw error;
    throw new KassServerError("partner_delete_failed", "Odoo дээр харилцагч устгахад алдаа гарлаа.", 502);
  }
}

export async function createOdooProduct(input: {
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
}) {
  const config = getOdooConfig();
  const uid = await authenticate(config);
  const modules = await getModuleStates(config, uid);
  assertModuleInstalled(modules, "product");

  try {
    const templateFields = await getFieldNames(config, uid, "product.template");
    const productFields = await getFieldNames(config, uid, "product.product");
    const availableForSale = input.available_for_sale ?? true;
    const templateValues = await productTemplateValues(config, uid, templateFields, {
      ...input,
      available_for_sale: availableForSale,
    });

    if (templateFields.has("active")) templateValues.active = true;

    const templateId = await executeKw<number>(config, uid, "product.template", "create", [templateValues]);
    const templates = await executeKw<OdooProductRecord[]>(
      config,
      uid,
      "product.template",
      "read",
      [[templateId], ["product_variant_id"]],
    );
    const productId = Array.isArray(templates[0]?.product_variant_id)
      ? templates[0].product_variant_id[0]
      : templateId;
    const variantValues = productVariantValues(productFields, templateFields, input);

    if (Object.keys(variantValues).length > 0) {
      await executeKw<boolean>(config, uid, "product.product", "write", [[productId], variantValues]);
    }

    return readProduct(config, uid, productId);
  } catch (error) {
    if (error instanceof KassServerError) throw error;
    throw new KassServerError("product_create_failed", "Odoo дээр бараа нэмэхэд алдаа гарлаа.", 502);
  }
}

export async function updateOdooProduct(
  productId: number,
  input: {
    name?: string;
    sale_price?: number;
    barcode?: string | null;
    default_code?: string | null;
    category?: string | null;
    category_scope?: "pos" | "warehouse";
    description?: string | null;
    image_base64?: string | null;
    available_for_sale?: boolean;
    is_storable?: boolean;
    uom_id?: number | null;
  },
) {
  const config = getOdooConfig();
  const uid = await authenticate(config);
  const modules = await getModuleStates(config, uid);
  assertModuleInstalled(modules, "product");

  try {
    const templateId = await getProductTemplateId(config, uid, productId);
    const templateFields = await getFieldNames(config, uid, "product.template");
    const productFields = await getFieldNames(config, uid, "product.product");
    const templateValues = await productTemplateValues(config, uid, templateFields, input);
    const variantValues = productVariantValues(productFields, templateFields, input);

    if (Object.keys(templateValues).length > 0) {
      await executeKw<boolean>(config, uid, "product.template", "write", [[templateId], templateValues]);
    }

    if (Object.keys(variantValues).length > 0) {
      await executeKw<boolean>(config, uid, "product.product", "write", [[productId], variantValues]);
    }

    return readProduct(config, uid, productId);
  } catch (error) {
    if (error instanceof KassServerError) throw error;
    throw new KassServerError("product_update_failed", "Odoo дээр бараа засахад алдаа гарлаа.", 502);
  }
}

async function getDefaultStockLocation(config: OdooConfig, uid: number) {
  const locations = await executeKw<OdooStockLocationRecord[]>(
    config,
    uid,
    "stock.location",
    "search_read",
    [[["usage", "=", "internal"]]],
    { fields: ["id", "name", "complete_name", "usage"], limit: 1, order: "id asc" },
  );

  if (!locations[0]?.id) {
    throw new KassServerError("stock_location_not_found", "Odoo дээр internal stock location олдсонгүй.", 502);
  }

  return locations[0];
}

async function getIncomingPickingType(config: OdooConfig, uid: number) {
  const pickingTypes = await executeKw<OdooPickingTypeRecord[]>(
    config,
    uid,
    "stock.picking.type",
    "search_read",
    [[["code", "=", "incoming"]]],
    {
      fields: ["id", "name", "code", "default_location_src_id", "default_location_dest_id"],
      limit: 1,
      order: "id asc",
    },
  );

  return pickingTypes[0] ?? null;
}

async function getSupplierLocation(config: OdooConfig, uid: number) {
  const locations = await executeKw<OdooStockLocationRecord[]>(
    config,
    uid,
    "stock.location",
    "search_read",
    [[["usage", "=", "supplier"]]],
    { fields: ["id", "name", "complete_name", "usage"], limit: 1, order: "id asc" },
  );

  return locations[0] ?? null;
}

async function readPartner(config: OdooConfig, uid: number, partnerId: number) {
  const partnerFields = await getFieldNames(config, uid, "res.partner");
  const fields = [
    "id",
    "name",
    "display_name",
    "phone",
    "email",
    "company_registry",
    "vat",
    "supplier_rank",
    "customer_rank",
  ].filter((field) => partnerFields.has(field));
  const partners = await executeKw<OdooPartnerRecord[]>(
    config,
    uid,
    "res.partner",
    "read",
    [[partnerId], fields],
  );
  const partner = partners[0];

  if (!partner) {
    throw new KassServerError("partner_not_found", "Харилцагч олдсонгүй.", 404);
  }

  const bankAccounts = await readPartnerBankAccountMap(config, uid, [partnerId]);
  return normalizePartner(partner, bankAccounts.get(partnerId) ?? null);
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function assertProductIsStorable(config: OdooConfig, uid: number, productId: number) {
  const productFields = await getFieldNames(config, uid, "product.product");
  const productReadFields = ["id", "name", "display_name", "product_tmpl_id", "is_storable", "type"].filter((field) =>
    productFields.has(field),
  );
  const records = await executeKw<OdooProductRecord[]>(
    config,
    uid,
    "product.product",
    "read",
    [[productId], productReadFields],
  );
  const product = records[0];

  if (!product) {
    throw new KassServerError("product_not_found", "Бараа олдсонгүй.", 404);
  }

  const alreadyStorable = product.is_storable === true || product.type === "product";
  if (alreadyStorable) return product;

  throw new KassServerError(
    "validation_error",
    "Энэ бараанд агуулахын үлдэгдэл хөтлөхгүй. Орлого авахын өмнө барааны тохиргооноос агуулахын үлдэгдэл хөтлөхийг идэвхжүүлнэ үү.",
    400,
  );
}

export async function receiveOdooProductStock(
  productId: number,
  input: {
    quantity: number;
    unit_cost?: number | null;
    note?: string | null;
    partner_id?: number | null;
  },
) {
  const config = getOdooConfig();
  const uid = await authenticate(config);
  const modules = await getModuleStates(config, uid);
  assertModuleInstalled(modules, "product");
  assertModuleInstalled(modules, "stock");

  if (!Number.isFinite(input.quantity) || input.quantity <= 0) {
    throw new KassServerError("validation_error", "Орлого авах тоо хэмжээ 0-ээс их байх ёстой.", 400);
  }

  try {
    await assertProductIsStorable(config, uid, productId);

    const partnerId = Number(input.partner_id ?? 0);
    const partner = Number.isInteger(partnerId) && partnerId > 0 ? await readPartner(config, uid, partnerId) : null;
    let receipt: { id: number; name: string | null; state: string | null } | null = null;
    let adjustment: { previous_quantity: number; location: { id: number; name: string } } | null = null;

    if (partner) {
      receipt = await receiveStockWithPartner(config, uid, productId, {
        quantity: input.quantity,
        unit_cost: input.unit_cost,
        note: input.note,
        partner_id: partner.id,
      });
    } else {
      adjustment = await receiveStockByInventoryAdjustment(config, uid, productId, input.quantity);
    }

    const unitCost = Number(input.unit_cost ?? 0);
    if (Number.isFinite(unitCost) && unitCost > 0) {
      const templateId = await getProductTemplateId(config, uid, productId);
      const templateFields = await getFieldNames(config, uid, "product.template");
      if (templateFields.has("standard_price")) {
        await executeKw<boolean>(config, uid, "product.template", "write", [[templateId], { standard_price: unitCost }]);
      }
    }

    const product = await readProduct(config, uid, productId);
    const receivedUnitCost = Number.isFinite(unitCost) && unitCost > 0 ? unitCost : null;

    return {
      ok: true,
      product,
      product_id: productId,
      quantity_received: input.quantity,
      previous_quantity: adjustment?.previous_quantity ?? null,
      quantity_available: product.qty_available,
      unit_cost: receivedUnitCost,
      total_cost: receivedUnitCost ? receivedUnitCost * input.quantity : null,
      location: adjustment?.location ?? null,
      partner,
      receipt,
      note: cleanOptionalText(input.note) || null,
    };
  } catch (error) {
    if (error instanceof KassServerError) throw error;
    throw new KassServerError("stock_receive_failed", "Odoo дээр барааны орлого авахад алдаа гарлаа.", 502);
  }
}

async function receiveStockByInventoryAdjustment(
  config: OdooConfig,
  uid: number,
  productId: number,
  quantity: number,
) {
  const location = await getDefaultStockLocation(config, uid);
  const quantFields = await getFieldNames(config, uid, "stock.quant");
  const quantReadFields = ["id", "quantity", "available_quantity", "inventory_quantity", "inventory_diff_quantity"].filter(
    (field) => quantFields.has(field),
  );
  const quants = await executeKw<OdooStockQuantRecord[]>(
    config,
    uid,
    "stock.quant",
    "search_read",
    [[["product_id", "=", productId], ["location_id", "=", location.id]]],
    { fields: quantReadFields, limit: 1 },
  );
  const currentQuantity = Number(quants[0]?.quantity ?? quants[0]?.available_quantity ?? 0);
  const nextQuantity = currentQuantity + quantity;
  const quantValues: Record<string, unknown> = {
    inventory_quantity: nextQuantity,
  };

  if (quantFields.has("inventory_quantity_set")) {
    quantValues.inventory_quantity_set = true;
  }

  let quantId = quants[0]?.id;
  if (quantId) {
    await executeKw<boolean>(config, uid, "stock.quant", "write", [[quantId], quantValues]);
  } else {
    quantId = await executeKw<number>(config, uid, "stock.quant", "create", [
      {
        product_id: productId,
        location_id: location.id,
        ...quantValues,
      },
    ]);
  }

  await executeKw<boolean | unknown[]>(config, uid, "stock.quant", "action_apply_inventory", [[quantId]]);

  return {
    previous_quantity: currentQuantity,
    location: {
      id: location.id,
      name: location.complete_name ?? location.name ?? "Stock",
    },
  };
}

async function receiveStockWithPartner(
  config: OdooConfig,
  uid: number,
  productId: number,
  input: {
    quantity: number;
    unit_cost?: number | null;
    note?: string | null;
    partner_id: number;
  },
) {
  const pickingType = await getIncomingPickingType(config, uid);
  if (!pickingType) {
    throw new KassServerError("stock_receive_failed", "Odoo incoming receipt type олдсонгүй.", 502);
  }

  const productFields = await getFieldNames(config, uid, "product.product");
  const productReadFields = ["id", "name", "display_name", "uom_id"].filter((field) => productFields.has(field));
  const products = await executeKw<OdooProductRecord[]>(
    config,
    uid,
    "product.product",
    "read",
    [[productId], productReadFields],
  );
  const product = products[0];
  const uomId = Array.isArray(product?.uom_id) ? product.uom_id[0] : null;

  if (!product || !uomId) {
    throw new KassServerError("product_not_found", "Барааны хэмжих нэгж олдсонгүй.", 404);
  }

  const stockLocation = await getDefaultStockLocation(config, uid);
  const supplierLocation = await getSupplierLocation(config, uid);
  const sourceLocationId = Array.isArray(pickingType.default_location_src_id)
    ? pickingType.default_location_src_id[0]
    : supplierLocation?.id;
  const destinationLocationId = Array.isArray(pickingType.default_location_dest_id)
    ? pickingType.default_location_dest_id[0]
    : stockLocation.id;

  if (!sourceLocationId || !destinationLocationId) {
    throw new KassServerError("stock_location_not_found", "Орлогын эхлэх эсвэл очих агуулахын байршил олдсонгүй.", 502);
  }

  const moveFields = await getFieldNames(config, uid, "stock.move");
  const moveValues: Record<string, unknown> = {
    name: product.display_name ?? product.name ?? `Product ${productId}`,
    product_id: productId,
    product_uom_qty: input.quantity,
    product_uom: uomId,
    location_id: sourceLocationId,
    location_dest_id: destinationLocationId,
  };

  if (moveFields.has("quantity")) moveValues.quantity = input.quantity;
  if (moveFields.has("price_unit") && Number(input.unit_cost ?? 0) > 0) moveValues.price_unit = input.unit_cost;

  const pickingValues: Record<string, unknown> = {
    picking_type_id: pickingType.id,
    partner_id: input.partner_id,
    location_id: sourceLocationId,
    location_dest_id: destinationLocationId,
    origin: "Cozy Coffee Kass",
    move_ids: [[0, 0, moveValues]],
  };

  const note = cleanOptionalText(input.note);
  if (note) pickingValues.note = `<p>${escapeHtml(note)}</p>`;

  const pickingId = await executeKw<number>(config, uid, "stock.picking", "create", [pickingValues]);
  await executeKw<boolean | unknown[]>(config, uid, "stock.picking", "action_confirm", [[pickingId]]);

  const pickingRecords = await executeKw<OdooPickingRecord[]>(
    config,
    uid,
    "stock.picking",
    "read",
    [[pickingId], ["id", "name", "state", "move_ids"]],
  );
  const picking = pickingRecords[0];
  const moveId = Array.isArray(picking?.move_ids) ? picking.move_ids[0] : null;

  if (moveId) {
    const moveLineFields = await getFieldNames(config, uid, "stock.move.line");
    const lineValues: Record<string, unknown> = {
      picking_id: pickingId,
      move_id: moveId,
      product_id: productId,
      product_uom_id: uomId,
      location_id: sourceLocationId,
      location_dest_id: destinationLocationId,
    };

    if (moveLineFields.has("quantity")) lineValues.quantity = input.quantity;

    const existingLines = await executeKw<Array<{ id: number }>>(
      config,
      uid,
      "stock.move.line",
      "search_read",
      [[["move_id", "=", moveId]]],
      { fields: ["id"], limit: 1 },
    );

    if (existingLines[0]?.id) {
      await executeKw<boolean>(config, uid, "stock.move.line", "write", [[existingLines[0].id], lineValues]);
    } else {
      await executeKw<number>(config, uid, "stock.move.line", "create", [lineValues]);
    }

    if (moveFields.has("picked")) {
      await executeKw<boolean>(config, uid, "stock.move", "write", [[moveId], { picked: true }]);
    }
  }

  await executeKw<boolean | unknown[]>(config, uid, "stock.picking", "button_validate", [[pickingId]]);

  const donePicking = await executeKw<OdooPickingRecord[]>(
    config,
    uid,
    "stock.picking",
    "read",
    [[pickingId], ["id", "name", "state"]],
  );

  return {
    id: pickingId,
    name: donePicking[0]?.name ?? null,
    state: donePicking[0]?.state ?? null,
  };
}

export async function archiveOdooProduct(productId: number) {
  const config = getOdooConfig();
  const uid = await authenticate(config);
  const modules = await getModuleStates(config, uid);
  assertModuleInstalled(modules, "product");

  try {
    const templateId = await getProductTemplateId(config, uid, productId);
    const templateFields = await getFieldNames(config, uid, "product.template");
    const productFields = await getFieldNames(config, uid, "product.product");
    const templateValues: Record<string, unknown> = {};

    if (templateFields.has("active")) templateValues.active = false;
    if (templateFields.has("sale_ok")) templateValues.sale_ok = false;
    if (templateFields.has("available_in_pos")) templateValues.available_in_pos = false;

    if (Object.keys(templateValues).length > 0) {
      await executeKw<boolean>(config, uid, "product.template", "write", [[templateId], templateValues]);
    }

    if (productFields.has("active")) {
      await executeKw<boolean>(config, uid, "product.product", "write", [[productId], { active: false }]);
    }

    return { ok: true, product_id: productId, archived: true };
  } catch (error) {
    if (error instanceof KassServerError) throw error;
    throw new KassServerError("product_delete_failed", "Odoo дээр бараа хасахад алдаа гарлаа.", 502);
  }
}

async function ensureProductsExist(config: OdooConfig, uid: number, productIds: number[]) {
  const records = await executeKw<Array<{ id: number }>>(
    config,
    uid,
    "product.product",
    "search_read",
    [[["id", "in", productIds]]],
    { fields: ["id"], limit: productIds.length },
  );
  const foundIds = new Set(records.map((record) => record.id));
  const missing = productIds.filter((productId) => !foundIds.has(productId));

  if (missing.length > 0) {
    throw new KassServerError("product_not_found", `Product not found: ${missing.join(", ")}`, 404);
  }
}

function formatOdooDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new KassServerError("validation_error", "Тайлангийн огноо буруу байна.", 400);
  }

  return date.toISOString().slice(0, 19).replace("T", " ");
}

function parseKassPaymentMethod(note: string | false | undefined) {
  const value = typeof note === "string" ? note.toLowerCase() : "";
  if (value.includes("payment method: cash")) return "cash";
  if (value.includes("payment method: card")) return "card";
  if (value.includes("payment method: qpay")) return "qpay";
  return "other";
}

function normalizeOdooDateTime(value: string | false | undefined) {
  if (typeof value !== "string" || !value) return null;
  return `${value.replace(" ", "T")}Z`;
}

export async function getOdooSalesReport(startIso: string, endIso: string) {
  const config = getOdooConfig();
  const uid = await authenticate(config);
  const modules = await getModuleStates(config, uid);
  assertModuleInstalled(modules, "sale");

  const start = new Date(startIso);
  const end = new Date(endIso);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start >= end) {
    throw new KassServerError("validation_error", "Тайлангийн эхлэх болон дуусах огноо буруу байна.", 400);
  }

  const saleOrderFields = await getFieldNames(config, uid, "sale.order");
  const fields = ["id", "name", "date_order", "amount_total", "note", "state"].filter((field) =>
    saleOrderFields.has(field),
  );

  const records = await executeKw<OdooSaleOrderRecord[]>(
    config,
    uid,
    "sale.order",
    "search_read",
    [
      [
        ["date_order", ">=", formatOdooDateTime(startIso)],
        ["date_order", "<", formatOdooDateTime(endIso)],
        ["state", "!=", "cancel"],
      ],
    ],
    {
      fields,
      limit: 1000,
      order: "date_order desc",
    },
  );

  const orders = records.map((record) => {
    const paymentMethod = parseKassPaymentMethod(record.note);

    return {
      order_id: record.id,
      receipt_number: record.name ?? `SO-${record.id}`,
      payment_method: paymentMethod,
      total: Number(record.amount_total ?? 0),
      created_at: normalizeOdooDateTime(record.date_order),
      state: record.state || null,
    };
  });

  const totals = orders.reduce(
    (sum, order) => {
      sum.total_sales += order.total;
      sum.orders_count += 1;
      if (order.payment_method === "cash") sum.cash_total += order.total;
      else if (order.payment_method === "card") sum.card_total += order.total;
      else if (order.payment_method === "qpay") sum.qpay_total += order.total;
      else sum.other_total += order.total;
      return sum;
    },
    {
      total_sales: 0,
      cash_total: 0,
      card_total: 0,
      qpay_total: 0,
      other_total: 0,
      orders_count: 0,
    },
  );

  return {
    start: startIso,
    end: endIso,
    ...totals,
    average_order: totals.orders_count > 0 ? totals.total_sales / totals.orders_count : 0,
    orders,
  };
}

function qpayString(value: string | false | undefined) {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function normalizeQpayError(
  error: unknown,
  code: "qpay_invoice_failed" | "qpay_check_failed",
  fallbackMessage: string,
) {
  if (error instanceof KassServerError) {
    const message = error.message;

    if (
      message.includes("You are not allowed") ||
      message.includes("Access Denied") ||
      message.includes("QPay") && message.includes("records")
    ) {
      return new KassServerError(
        code,
        "Odoo QPay эрх дутуу байна. API хэрэглэгчийг QPay Хэрэглэгч эсвэл QPay Менежер group-д нэмнэ үү.",
        403,
      );
    }

    if (message.includes("qpay_transaction") && (message.includes("column") || message.includes("does not exist"))) {
      return new KassServerError(
        code,
        "Odoo QPay addon-ийн database schema дутуу байна. payment_qpay_custom module upgrade хийнэ үү.",
        502,
      );
    }

    if (error.code === "odoo_connection_failed") {
      return new KassServerError(code, message, error.status);
    }

    return error;
  }

  return new KassServerError(code, fallbackMessage, 502);
}

async function readQpayTransaction(config: OdooConfig, uid: number, transactionId: number) {
  const fields = await getFieldNames(config, uid, "qpay.transaction");
  const readFields = [
    "id",
    "name",
    "amount",
    "state",
    "qpay_invoice_id",
    "qr_text",
    "qr_image",
    "qpay_short_url",
    "qpay_payment_id",
    "error_message",
  ].filter((field) => fields.has(field));
  const records = await executeKw<OdooQpayTransactionRecord[]>(
    config,
    uid,
    "qpay.transaction",
    "read",
    [[transactionId], readFields],
  );
  const record = records[0];

  if (!record) {
    throw new KassServerError("qpay_invoice_failed", "QPay transaction олдсонгүй.", 404);
  }

  return {
    transaction_id: record.id,
    name: qpayString(record.name),
    amount: Number(record.amount ?? 0),
    state: qpayString(record.state),
    paid: record.state === "paid",
    qpay_invoice_id: qpayString(record.qpay_invoice_id),
    qr_text: qpayString(record.qr_text),
    qr_image: qpayString(record.qr_image),
    qpay_short_url: qpayString(record.qpay_short_url),
    qpay_payment_id: qpayString(record.qpay_payment_id),
    error_message: qpayString(record.error_message),
  };
}

export async function createOdooQpayInvoice(lines: Array<{ product_id: number; quantity: number; price: number }>) {
  const config = getOdooConfig();
  const uid = await authenticate(config);
  const modules = await getModuleStates(config, uid);
  assertModuleInstalled(modules, "product");
  assertModuleInstalled(modules, "payment_qpay_custom");

  try {
    await ensureProductsExist(
      config,
      uid,
      lines.map((line) => line.product_id),
    );

    const amount = lines.reduce((sum, line) => sum + line.quantity * line.price, 0);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new KassServerError("validation_error", "QPay төлбөрийн дүн 0-ээс их байх ёстой.", 400);
    }

    const fields = await getFieldNames(config, uid, "qpay.transaction");
    const values: Record<string, unknown> = {
      amount,
      partner_id: config.defaultPartnerId,
    };

    if (fields.has("description")) {
      values.description = `Cozy Coffee Kass ${new Date().toISOString()}`;
    }

    const transactionId = await executeKw<number>(config, uid, "qpay.transaction", "create", [values]);
    await executeKw<unknown>(config, uid, "qpay.transaction", "action_create_qpay_invoice", [[transactionId]]);

    const transaction = await readQpayTransaction(config, uid, transactionId);
    if (transaction.error_message) {
      throw new KassServerError("qpay_invoice_failed", transaction.error_message, 502);
    }

    if (!transaction.qr_image && !transaction.qr_text && !transaction.qpay_short_url) {
      throw new KassServerError("qpay_invoice_failed", "QPay QR мэдээлэл Odoo-оос ирсэнгүй.", 502);
    }

    return {
      ok: true,
      ...transaction,
    };
  } catch (error) {
    throw normalizeQpayError(error, "qpay_invoice_failed", "QPay QR үүсгэхэд алдаа гарлаа.");
  }
}

export async function checkOdooQpayPayment(transactionId: number) {
  const config = getOdooConfig();
  const uid = await authenticate(config);
  const modules = await getModuleStates(config, uid);
  assertModuleInstalled(modules, "payment_qpay_custom");

  try {
    await executeKw<unknown>(config, uid, "qpay.transaction", "action_check_payment", [[transactionId]]);
    const transaction = await readQpayTransaction(config, uid, transactionId);

    return {
      ok: true,
      transaction_id: transaction.transaction_id,
      state: transaction.state,
      paid: transaction.paid,
      qpay_payment_id: transaction.qpay_payment_id,
      error_message: transaction.error_message,
    };
  } catch (error) {
    throw normalizeQpayError(error, "qpay_check_failed", "QPay төлбөр шалгахад алдаа гарлаа.");
  }
}

export async function linkOdooQpayTransactionToSaleOrder(transactionId: number, saleOrderId: number) {
  const config = getOdooConfig();
  const uid = await authenticate(config);
  const modules = await getModuleStates(config, uid);
  assertModuleInstalled(modules, "payment_qpay_custom");

  try {
    await executeKw<boolean>(config, uid, "qpay.transaction", "write", [[transactionId], { sale_order_id: saleOrderId }]);
    return true;
  } catch {
    return false;
  }
}

export async function createOdooSaleOrder(
  lines: Array<{ product_id: number; quantity: number; price: number }>,
  paymentMethod: string,
) {
  const config = getOdooConfig();
  const uid = await authenticate(config);
  const modules = await getModuleStates(config, uid);
  assertModuleInstalled(modules, "product");
  assertModuleInstalled(modules, "sale");

  try {
    await ensureProductsExist(
      config,
      uid,
      lines.map((line) => line.product_id),
    );

    const orderId = await executeKw<number>(config, uid, "sale.order", "create", [
      {
        partner_id: config.defaultPartnerId,
        note: `Kass payment method: ${paymentMethod}`,
        order_line: lines.map((line) => [
          0,
          0,
          {
            product_id: line.product_id,
            product_uom_qty: line.quantity,
            price_unit: line.price,
          },
        ]),
      },
    ]);

    return orderId;
  } catch (error) {
    if (error instanceof KassServerError) {
      throw error;
    }

    throw new KassServerError("order_create_failed", "Could not create Odoo sale order", 502);
  }
}

export async function consumeOdooRecipeStock(lines: Array<{ product_id: number; quantity: number; price: number }>) {
  const config = getOdooConfig();
  const uid = await authenticate(config);
  const modules = await getModuleStates(config, uid);
  assertModuleInstalled(modules, "product");
  assertModuleInstalled(modules, "stock");

  const location = await getDefaultStockLocation(config, uid);
  const consumption = new Map<number, number>();

  try {
    for (const line of lines) {
      const soldQuantity = Number(line.quantity);
      if (!Number.isFinite(soldQuantity) || soldQuantity <= 0) continue;

      const product = await readProductForRecipe(config, uid, line.product_id);
      const templateId = relationId(product.product_tmpl_id);
      if (!templateId) {
        throw new KassServerError("product_not_found", "Барааны template олдсонгүй.", 404);
      }

      let bom: OdooBomRecord | null = null;
      let bomLines: OdooBomLineRecord[] = [];

      if (modules.mrp === "installed") {
        bom = await readPrimaryBom(config, uid, line.product_id, templateId);
        bomLines = bom ? await readBomLines(config, uid, bom.id) : [];
      }

      if (bomLines.length > 0) {
        for (const bomLine of bomLines) {
          const componentId = relationId(bomLine.product_id);
          const componentQuantity = Number(bomLine.product_qty ?? 0);
          if (!componentId || !Number.isFinite(componentQuantity) || componentQuantity <= 0) continue;

          consumption.set(componentId, Number(consumption.get(componentId) ?? 0) + componentQuantity * soldQuantity);
        }
        continue;
      }

      const isStorable = product.is_storable === true || product.type === "product";
      if (isStorable) {
        consumption.set(line.product_id, Number(consumption.get(line.product_id) ?? 0) + soldQuantity);
      }
    }

    for (const [productId, quantity] of consumption.entries()) {
      await consumeOdooProductStock(config, uid, location, productId, quantity);
    }
  } catch (error) {
    if (error instanceof KassServerError) throw error;
    throw new KassServerError("validation_error", "Агуулахын үлдэгдлээс орц хасахад алдаа гарлаа.", 502);
  }
}

async function consumeOdooProductStock(
  config: OdooConfig,
  uid: number,
  location: OdooStockLocationRecord,
  productId: number,
  quantity: number,
) {
  if (!Number.isFinite(quantity) || quantity <= 0) return;

  const productFields = await getFieldNames(config, uid, "product.product");
  const productReadFields = ["id", "name", "display_name", "uom_id"].filter((field) => productFields.has(field));
  const products = await executeKw<OdooProductRecord[]>(config, uid, "product.product", "read", [
    [productId],
    productReadFields,
  ]);
  const product = products[0];

  if (!product) {
    throw new KassServerError("product_not_found", "Орцын бараа олдсонгүй.", 404);
  }

  const quantFields = await getFieldNames(config, uid, "stock.quant");
  const quantReadFields = ["id", "quantity", "available_quantity", "inventory_quantity", "inventory_diff_quantity"].filter(
    (field) => quantFields.has(field),
  );
  const quants = await executeKw<OdooStockQuantRecord[]>(
    config,
    uid,
    "stock.quant",
    "search_read",
    [[["product_id", "=", productId], ["location_id", "=", location.id]]],
    { fields: quantReadFields, limit: 1 },
  );
  const currentQuantity = Number(quants[0]?.quantity ?? quants[0]?.available_quantity ?? 0);

  if (currentQuantity < quantity) {
    const productName = product.display_name ?? product.name ?? `Product ${productId}`;
    throw new KassServerError(
      "validation_error",
      `${productName} үлдэгдэл хүрэлцэхгүй байна. Байгаа: ${currentQuantity}, хэрэгтэй: ${quantity}.`,
      409,
    );
  }

  const quantValues: Record<string, unknown> = {
    inventory_quantity: currentQuantity - quantity,
  };

  if (quantFields.has("inventory_diff_quantity")) {
    quantValues.inventory_diff_quantity = -quantity;
  }

  const quantId = quants[0]?.id;
  if (!quantId) {
    const productName = product.display_name ?? product.name ?? `Product ${productId}`;
    throw new KassServerError("validation_error", `${productName} агуулахын үлдэгдэл олдсонгүй.`, 409);
  }

  await executeKw<boolean>(config, uid, "stock.quant", "write", [[quantId], quantValues]);
  await executeKw<boolean | unknown[]>(config, uid, "stock.quant", "action_apply_inventory", [[quantId]]);
}
