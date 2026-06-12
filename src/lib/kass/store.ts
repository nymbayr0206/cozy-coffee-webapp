import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { KassServerError } from "./errors";
import type { KassStockConsumption, OrderPaymentMethod, PaymentPart } from "./client-types";

export interface KassSessionRecord {
  session_id: string;
  cashier_name: string;
  opening_cash: number;
  opened_at: string;
  closed_at?: string;
  closing_cash?: number;
}

export interface KassOrderRecord {
  order_id: string | number;
  qpay_transaction_id?: number;
  receipt_number: string;
  session_id: string;
  payment_method: OrderPaymentMethod;
  payment_parts?: PaymentPart[];
  partner_id?: number | null;
  partner_name?: string | null;
  total: number;
  lines: Array<{
    product_id: number;
    name?: string | null;
    quantity: number;
    price: number;
  }>;
  stock_consumptions?: KassStockConsumption[];
  status?: "active" | "returned";
  created_at: string;
  payment_updated_at?: string;
  returned_at?: string;
}

export interface KassSessionEvent {
  event_id: string;
  session_id: string;
  type: "session_opened" | "order_created" | "order_returned" | "session_closed";
  cashier_name?: string;
  order_id?: string | number;
  receipt_number?: string;
  payment_method?: OrderPaymentMethod;
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

export interface KassStockReceiptRecord {
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
  payment_method?: "cash" | "credit" | "mixed";
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

export interface KassFinanceSettlementRecord {
  settlement_id: string;
  type: "payable" | "receivable";
  partner_id?: number | null;
  partner_name: string;
  amount: number;
  note?: string | null;
  created_at: string;
}

interface KassStoreState {
  sessions: Map<string, KassSessionRecord>;
  orders: Map<string, KassOrderRecord[]>;
  events: KassSessionEvent[];
  stockReceipts: KassStockReceiptRecord[];
  financeSettlements: KassFinanceSettlementRecord[];
  receiptCounter: number;
}

interface SerializedKassStoreState {
  version: 1;
  sessions: KassSessionRecord[];
  orders: Record<string, KassOrderRecord[]>;
  events: KassSessionEvent[];
  stockReceipts?: KassStockReceiptRecord[];
  financeSettlements?: KassFinanceSettlementRecord[];
  receiptCounter: number;
}

declare global {
  // eslint-disable-next-line no-var
  var __cozyCoffeeKassStore: KassStoreState | undefined;
}

const LOCK_TIMEOUT_MS = 6000;
const LOCK_RETRY_MS = 40;
const STALE_LOCK_MS = 30000;

function sleepSync(ms: number) {
  const buffer = new SharedArrayBuffer(4);
  const view = new Int32Array(buffer);
  Atomics.wait(view, 0, 0, ms);
}

function getStorePath() {
  const configuredPath = process.env.KASS_STORE_PATH?.trim() || "data/kass-store.json";
  return path.isAbsolute(configuredPath) ? configuredPath : path.join(process.cwd(), configuredPath);
}

function emptyState(): KassStoreState {
  return {
    sessions: new Map(),
    orders: new Map(),
    events: [],
    stockReceipts: [],
    financeSettlements: [],
    receiptCounter: 0,
  };
}

function serializeState(state: KassStoreState): SerializedKassStoreState {
  return {
    version: 1,
    sessions: Array.from(state.sessions.values()),
    orders: Object.fromEntries(Array.from(state.orders.entries())),
    events: state.events,
    stockReceipts: state.stockReceipts,
    financeSettlements: state.financeSettlements,
    receiptCounter: state.receiptCounter,
  };
}

function deserializeState(parsed: Partial<SerializedKassStoreState>): KassStoreState {
  const sessions = Array.isArray(parsed.sessions) ? parsed.sessions : [];
  const orders = parsed.orders && typeof parsed.orders === "object" ? parsed.orders : {};
  const events = Array.isArray(parsed.events) ? parsed.events : [];
  const stockReceipts = Array.isArray(parsed.stockReceipts) ? parsed.stockReceipts : [];
  const financeSettlements = Array.isArray(parsed.financeSettlements) ? parsed.financeSettlements : [];

  return {
    sessions: new Map(sessions.map((session) => [session.session_id, session])),
    orders: new Map(Object.entries(orders)),
    events,
    stockReceipts,
    financeSettlements,
    receiptCounter: Number.isInteger(parsed.receiptCounter) ? Number(parsed.receiptCounter) : 0,
  };
}

function loadStateFromDisk(): KassStoreState {
  const storePath = getStorePath();

  if (!existsSync(storePath)) return emptyState();

  try {
    return deserializeState(JSON.parse(readFileSync(storePath, "utf8")) as Partial<SerializedKassStoreState>);
  } catch {
    throw new KassServerError(
      "validation_error",
      `Kass бүртгэлийн файл уншиж чадсангүй: ${storePath}. JSON эвдэрсэн эсэхийг шалгана уу.`,
      500,
    );
  }
}

function persistState(state: KassStoreState) {
  const storePath = getStorePath();
  const directory = path.dirname(storePath);
  mkdirSync(directory, { recursive: true });

  const tempPath = `${storePath}.${process.pid}.tmp`;
  writeFileSync(tempPath, `${JSON.stringify(serializeState(state), null, 2)}\n`, "utf8");
  renameSync(tempPath, storePath);
  globalThis.__cozyCoffeeKassStore = state;
}

function readState() {
  const state = loadStateFromDisk();
  globalThis.__cozyCoffeeKassStore = state;
  return state;
}

function acquireStoreLock() {
  const storePath = getStorePath();
  const lockPath = `${storePath}.lock`;
  mkdirSync(path.dirname(lockPath), { recursive: true });
  const deadline = Date.now() + LOCK_TIMEOUT_MS;

  while (true) {
    try {
      const fd = openSync(lockPath, "wx");
      writeFileSync(fd, `${process.pid}\n${new Date().toISOString()}\n`, "utf8");

      return () => {
        closeSync(fd);
        rmSync(lockPath, { force: true });
      };
    } catch (error) {
      const code = error instanceof Error && "code" in error ? String(error.code) : "";

      if (code !== "EEXIST") {
        throw new KassServerError("validation_error", `Kass store lock үүсгэж чадсангүй: ${lockPath}`, 500);
      }

      try {
        const ageMs = Date.now() - statSync(lockPath).mtimeMs;
        if (ageMs > STALE_LOCK_MS) {
          rmSync(lockPath, { force: true });
          continue;
        }
      } catch {
        continue;
      }

      if (Date.now() >= deadline) {
        throw new KassServerError(
          "validation_error",
          "Kass бүртгэлийн файл түр түгжээтэй байна. Хэдэн секундийн дараа дахин оролдоно уу.",
          503,
        );
      }

      sleepSync(LOCK_RETRY_MS);
    }
  }
}

function withLockedState<T>(mutate: (state: KassStoreState) => T) {
  const release = acquireStoreLock();

  try {
    const state = loadStateFromDisk();
    const result = mutate(state);
    persistState(state);
    return result;
  } finally {
    release();
  }
}

function nextId(prefix: string) {
  const random = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${Date.now().toString(36)}_${random}`;
}

function findStockReceipt(state: KassStoreState, receiptId: string) {
  const receipt = state.stockReceipts.find((item) => item.receipt_id === receiptId);

  if (!receipt) {
    throw new KassServerError("stock_receipt_not_found", "Орлогын бүртгэл олдсонгүй.", 404);
  }

  return receipt;
}

function pushEvent(
  state: KassStoreState,
  event: Omit<KassSessionEvent, "event_id" | "created_at"> & { created_at?: string },
) {
  state.events.push({
    event_id: nextId("ke"),
    created_at: event.created_at ?? new Date().toISOString(),
    ...event,
  });
}

function getSessionFromState(state: KassStoreState, sessionId: string) {
  const session = state.sessions.get(sessionId);

  if (!session) {
    throw new KassServerError("session_not_found", "Session not found", 404);
  }

  return session;
}

function assertSessionOpenInState(state: KassStoreState, sessionId: string) {
  const session = getSessionFromState(state, sessionId);

  if (session.closed_at) {
    throw new KassServerError("session_closed", "Session is already closed", 409);
  }

  return session;
}

function getOpenSessionsFromState(state: KassStoreState) {
  return Array.from(state.sessions.values())
    .filter((session) => !session.closed_at)
    .sort((a, b) => new Date(b.opened_at).getTime() - new Date(a.opened_at).getTime());
}

function getActiveSessionFromState(state: KassStoreState) {
  return getOpenSessionsFromState(state)[0] ?? null;
}

function calculateReport(session: KassSessionRecord, orders: KassOrderRecord[]) {
  const activeOrders = orders.filter((order) => order.status !== "returned");
  const cash_total = activeOrders.reduce((sum, order) => sum + paymentAmount(order, "cash"), 0);
  const card_total = activeOrders.reduce((sum, order) => sum + paymentAmount(order, "card"), 0);
  const qpay_total = activeOrders.reduce((sum, order) => sum + paymentAmount(order, "qpay"), 0);
  const bank_total = activeOrders.reduce((sum, order) => sum + paymentAmount(order, "bank"), 0);
  const credit_total = activeOrders.reduce((sum, order) => sum + paymentAmount(order, "credit"), 0);
  const coupon_total = activeOrders.reduce((sum, order) => sum + paymentAmount(order, "coupon"), 0);
  const total_sales = cash_total + card_total + qpay_total + bank_total + credit_total;
  const expected_cash = session.opening_cash + cash_total;

  return {
    ...session,
    status: session.closed_at ? "closed" : "open",
    total_sales,
    cash_total,
    card_total,
    qpay_total,
    bank_total,
    credit_total,
    coupon_total,
    orders_count: activeOrders.length,
    returned_orders_count: orders.length - activeOrders.length,
    expected_cash,
    cash_difference: session.closing_cash === undefined ? undefined : session.closing_cash - expected_cash,
    orders,
  };
}

function paymentAmount(order: KassOrderRecord, method: PaymentPart["method"]) {
  if (Array.isArray(order.payment_parts) && order.payment_parts.length > 0) {
    return order.payment_parts
      .filter((payment) => payment.method === method)
      .reduce((sum, payment) => sum + Number(payment.amount ?? 0), 0);
  }

  return order.payment_method === method ? Number(order.total ?? 0) : 0;
}

export function openSession(cashierName: string, openingCash: number) {
  return withLockedState((state) => {
    const activeSession = getActiveSessionFromState(state);

    if (activeSession) {
      throw new KassServerError(
        "session_already_open",
        `Ээлж аль хэдийн нээгдсэн байна. Нээсэн: ${activeSession.cashier_name}`,
        409,
      );
    }

    const session: KassSessionRecord = {
      session_id: nextId("ks"),
      cashier_name: cashierName,
      opening_cash: openingCash,
      opened_at: new Date().toISOString(),
    };

    state.sessions.set(session.session_id, session);
    state.orders.set(session.session_id, []);
    pushEvent(state, {
      session_id: session.session_id,
      type: "session_opened",
      cashier_name: cashierName,
      opening_cash: openingCash,
      created_at: session.opened_at,
    });

    return session;
  });
}

export function getSession(sessionId: string) {
  return getSessionFromState(readState(), sessionId);
}

export function getActiveSession() {
  const state = readState();
  const session = getActiveSessionFromState(state);

  if (!session) return null;

  return calculateReport(session, state.orders.get(session.session_id) ?? []);
}

export function assertSessionOpen(sessionId: string) {
  return assertSessionOpenInState(readState(), sessionId);
}

export function nextReceiptNumber() {
  return withLockedState((state) => {
    state.receiptCounter += 1;
    return `RCPT-${String(state.receiptCounter).padStart(6, "0")}`;
  });
}

export function addOrder(order: KassOrderRecord) {
  return withLockedState((state) => {
    assertSessionOpenInState(state, order.session_id);
    const orders = state.orders.get(order.session_id) ?? [];
    orders.push({
      status: "active",
      ...order,
    });
    state.orders.set(order.session_id, orders);
    pushEvent(state, {
      session_id: order.session_id,
      type: "order_created",
      order_id: order.order_id,
      receipt_number: order.receipt_number,
      payment_method: order.payment_method,
      payment_parts: order.payment_parts,
      partner_id: order.partner_id,
      partner_name: order.partner_name,
      amount: order.total,
      created_at: order.created_at,
    });

    return order;
  });
}

export function getOrders(sessionId: string) {
  const state = readState();
  getSessionFromState(state, sessionId);
  return state.orders.get(sessionId) ?? [];
}

export function getAllOrders(options?: { start?: string; end?: string; status?: "active" | "returned" | "all" }) {
  const state = readState();
  const status = options?.status ?? "active";
  const startTime = options?.start ? new Date(options.start).getTime() : null;
  const endTime = options?.end ? new Date(options.end).getTime() : null;

  return Array.from(state.orders.values())
    .flat()
    .filter((order) => {
      if (status !== "all" && (order.status ?? "active") !== status) return false;

      const createdTime = new Date(order.created_at).getTime();
      if (startTime !== null && createdTime < startTime) return false;
      if (endTime !== null && createdTime > endTime) return false;

      return true;
    })
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
}

export function getOrderByReference(reference: string) {
  const state = readState();
  const needle = String(reference).trim();

  for (const orders of state.orders.values()) {
    const order = orders.find((item) => String(item.receipt_number) === needle || String(item.order_id) === needle);

    if (order) return order;
  }

  throw new KassServerError("order_not_found", "Борлуулалтын бүртгэл олдсонгүй.", 404);
}

export function returnOrder(reference: string) {
  return withLockedState((state) => {
    const needle = String(reference).trim();

    for (const [sessionId, orders] of state.orders.entries()) {
      const order = orders.find((item) => String(item.receipt_number) === needle || String(item.order_id) === needle);

      if (!order) continue;

      if (order.status === "returned") {
        throw new KassServerError("order_returned", "Энэ борлуулалт аль хэдийн буцаагдсан байна.", 409);
      }

      order.status = "returned";
      order.returned_at = new Date().toISOString();
      state.orders.set(sessionId, orders);
      pushEvent(state, {
        session_id: order.session_id,
        type: "order_returned",
        order_id: order.order_id,
        receipt_number: order.receipt_number,
        payment_method: order.payment_method,
        payment_parts: order.payment_parts,
        partner_id: order.partner_id,
        partner_name: order.partner_name,
        amount: -Math.abs(order.total),
        created_at: order.returned_at,
      });

      return order;
    }

    throw new KassServerError("order_not_found", "Борлуулалтын бүртгэл олдсонгүй.", 404);
  });
}

export function updateOrderPayment(reference: string, paymentMethod: OrderPaymentMethod, paymentParts: PaymentPart[]) {
  return withLockedState((state) => {
    const needle = String(reference).trim();

    for (const [sessionId, orders] of state.orders.entries()) {
      const order = orders.find((item) => String(item.receipt_number) === needle || String(item.order_id) === needle);

      if (!order) continue;

      if (order.status === "returned") {
        throw new KassServerError("order_returned", "Буцаагдсан борлуулалтын төлбөрийг засах боломжгүй.", 409);
      }

      order.payment_method = paymentMethod;
      order.payment_parts = paymentParts;
      order.payment_updated_at = new Date().toISOString();
      state.orders.set(sessionId, orders);

      state.events = state.events.map((event) =>
        event.type === "order_created" &&
        (String(event.receipt_number) === needle || String(event.order_id) === needle)
          ? {
              ...event,
              payment_method: paymentMethod,
              payment_parts: paymentParts,
            }
          : event,
      );

      return order;
    }

    throw new KassServerError("order_not_found", "Борлуулалтын бүртгэл олдсонгүй.", 404);
  });
}

export function getReport(sessionId: string) {
  const state = readState();
  const session = getSessionFromState(state, sessionId);
  const orders = state.orders.get(sessionId) ?? [];
  return calculateReport(session, orders);
}

export function getSessionHistory(options?: { status?: "open" | "closed"; limit?: number }) {
  const state = readState();
  const sessions = Array.from(state.sessions.values())
    .map((session) => calculateReport(session, state.orders.get(session.session_id) ?? []))
    .filter((session) => {
      if (options?.status === "open") return !session.closed_at;
      if (options?.status === "closed") return Boolean(session.closed_at);
      return true;
    })
    .sort((a, b) => new Date(b.opened_at).getTime() - new Date(a.opened_at).getTime());

  const limit = options?.limit;
  return Number.isInteger(limit) && Number(limit) > 0 ? sessions.slice(0, Number(limit)) : sessions;
}

export function getSessionEvents(sessionId?: string) {
  const events = readState().events;
  return (sessionId ? events.filter((event) => event.session_id === sessionId) : events).slice().sort((a, b) => {
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });
}

export function closeSession(sessionId: string, closingCash: number) {
  return withLockedState((state) => {
    const session = assertSessionOpenInState(state, sessionId);

    session.closing_cash = closingCash;
    session.closed_at = new Date().toISOString();
    state.sessions.set(sessionId, session);

    const report = calculateReport(session, state.orders.get(sessionId) ?? []);
    pushEvent(state, {
      session_id: sessionId,
      type: "session_closed",
      cashier_name: session.cashier_name,
      closing_cash: closingCash,
      expected_cash: report.expected_cash,
      cash_difference: report.cash_difference,
      amount: report.total_sales,
      created_at: session.closed_at,
    });

    return report;
  });
}

export function addStockReceipt(
  receipt: Omit<KassStockReceiptRecord, "receipt_id" | "status" | "created_at" | "updated_at"> & {
    receipt_id?: string;
    status?: KassStockReceiptRecord["status"];
    created_at?: string;
  },
) {
  return withLockedState((state) => {
    const createdAt = receipt.created_at ?? new Date().toISOString();
    const nextReceipt: KassStockReceiptRecord = {
      receipt_id: receipt.receipt_id ?? nextId("sr"),
      status: receipt.status ?? "active",
      created_at: createdAt,
      updated_at: createdAt,
      ...receipt,
    };

    state.stockReceipts.push(nextReceipt);
    return nextReceipt;
  });
}

export function getStockReceipts(options?: { start?: string; end?: string; status?: "active" | "returned" | "all" }) {
  const startTime = options?.start ? new Date(options.start).getTime() : null;
  const endTime = options?.end ? new Date(options.end).getTime() : null;
  const status = options?.status ?? "all";

  return readState()
    .stockReceipts.filter((receipt) => {
      if (status !== "all" && receipt.status !== status) return false;

      const createdTime = new Date(receipt.created_at).getTime();
      if (Number.isNaN(createdTime)) return false;
      if (startTime !== null && createdTime < startTime) return false;
      if (endTime !== null && createdTime >= endTime) return false;
      return true;
    })
    .slice()
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
}

export function addFinanceSettlement(
  settlement: Omit<KassFinanceSettlementRecord, "settlement_id" | "created_at"> & {
    settlement_id?: string;
    created_at?: string;
  },
) {
  return withLockedState((state) => {
    const nextSettlement: KassFinanceSettlementRecord = {
      settlement_id: settlement.settlement_id ?? nextId("fs"),
      created_at: settlement.created_at ?? new Date().toISOString(),
      ...settlement,
      amount: Math.round(Number(settlement.amount ?? 0) * 100) / 100,
    };

    state.financeSettlements.push(nextSettlement);
    return nextSettlement;
  });
}

export function getFinanceSettlements(options?: { type?: "payable" | "receivable" }) {
  const type = options?.type;

  return readState()
    .financeSettlements.filter((settlement) => (type ? settlement.type === type : true))
    .slice()
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
}

export function getStockReceipt(receiptId: string) {
  return findStockReceipt(readState(), receiptId);
}

export function updateStockReceipt(
  receiptId: string,
  patch: Partial<
    Pick<
      KassStockReceiptRecord,
      | "quantity"
      | "unit_cost"
      | "total_cost"
      | "stock_quantity"
      | "partner_id"
      | "partner_name"
      | "payment_method"
      | "paid_amount"
      | "credit_amount"
      | "note"
      | "location_id"
      | "location_name"
    >
  >,
) {
  return withLockedState((state) => {
    const receipt = findStockReceipt(state, receiptId);

    if (receipt.status === "returned") {
      throw new KassServerError("stock_receipt_returned", "Буцаагдсан орлогын бүртгэлийг засах боломжгүй.", 409);
    }

    Object.assign(receipt, patch, {
      total_cost: Number(patch.total_cost ?? receipt.total_cost),
      updated_at: new Date().toISOString(),
    });
    return receipt;
  });
}

export function returnStockReceipt(receiptId: string) {
  return withLockedState((state) => {
    const receipt = findStockReceipt(state, receiptId);

    if (receipt.status === "returned") {
      throw new KassServerError("stock_receipt_returned", "Энэ орлого аль хэдийн буцаагдсан байна.", 409);
    }

    receipt.status = "returned";
    receipt.returned_at = new Date().toISOString();
    receipt.updated_at = receipt.returned_at;
    return receipt;
  });
}
