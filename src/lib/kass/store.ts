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
import type { PaymentMethod } from "./client-types";

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
  payment_method: PaymentMethod;
  total: number;
  lines: Array<{
    product_id: number;
    quantity: number;
    price: number;
  }>;
  created_at: string;
}

export interface KassSessionEvent {
  event_id: string;
  session_id: string;
  type: "session_opened" | "order_created" | "session_closed";
  cashier_name?: string;
  order_id?: string | number;
  receipt_number?: string;
  payment_method?: PaymentMethod;
  amount?: number;
  opening_cash?: number;
  closing_cash?: number;
  expected_cash?: number;
  cash_difference?: number;
  created_at: string;
}

interface KassStoreState {
  sessions: Map<string, KassSessionRecord>;
  orders: Map<string, KassOrderRecord[]>;
  events: KassSessionEvent[];
  receiptCounter: number;
}

interface SerializedKassStoreState {
  version: 1;
  sessions: KassSessionRecord[];
  orders: Record<string, KassOrderRecord[]>;
  events: KassSessionEvent[];
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
    receiptCounter: 0,
  };
}

function serializeState(state: KassStoreState): SerializedKassStoreState {
  return {
    version: 1,
    sessions: Array.from(state.sessions.values()),
    orders: Object.fromEntries(Array.from(state.orders.entries())),
    events: state.events,
    receiptCounter: state.receiptCounter,
  };
}

function deserializeState(parsed: Partial<SerializedKassStoreState>): KassStoreState {
  const sessions = Array.isArray(parsed.sessions) ? parsed.sessions : [];
  const orders = parsed.orders && typeof parsed.orders === "object" ? parsed.orders : {};
  const events = Array.isArray(parsed.events) ? parsed.events : [];

  return {
    sessions: new Map(sessions.map((session) => [session.session_id, session])),
    orders: new Map(Object.entries(orders)),
    events,
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

function calculateReport(session: KassSessionRecord, orders: KassOrderRecord[]) {
  const cash_total = orders
    .filter((order) => order.payment_method === "cash")
    .reduce((sum, order) => sum + order.total, 0);
  const card_total = orders
    .filter((order) => order.payment_method === "card")
    .reduce((sum, order) => sum + order.total, 0);
  const qpay_total = orders
    .filter((order) => order.payment_method === "qpay")
    .reduce((sum, order) => sum + order.total, 0);
  const total_sales = cash_total + card_total + qpay_total;
  const expected_cash = session.opening_cash + cash_total;

  return {
    ...session,
    total_sales,
    cash_total,
    card_total,
    qpay_total,
    orders_count: orders.length,
    expected_cash,
    cash_difference: session.closing_cash === undefined ? undefined : session.closing_cash - expected_cash,
    orders,
  };
}

export function openSession(cashierName: string, openingCash: number) {
  return withLockedState((state) => {
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
    orders.push(order);
    state.orders.set(order.session_id, orders);
    pushEvent(state, {
      session_id: order.session_id,
      type: "order_created",
      order_id: order.order_id,
      receipt_number: order.receipt_number,
      payment_method: order.payment_method,
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
