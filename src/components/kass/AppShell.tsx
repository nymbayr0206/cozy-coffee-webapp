"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Boxes,
  DoorOpen,
  LayoutDashboard,
  LogIn,
  LogOut,
  ReceiptText,
  Settings,
  ShoppingCart,
  Square,
  Users,
  Warehouse,
  X,
} from "lucide-react";
import {
  createContext,
  FormEvent,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  KassApiError,
  closeKassSession,
  formatMoney,
  getKassSessions,
  getReadableError,
  getSessionReport,
  loginOdooCashier,
  normalizeReport,
  openKassSession,
} from "@/lib/kass/client-api";
import type { CloseSessionResponse, KassReport, OpenSessionResponse } from "@/lib/kass/client-types";
import { LoginModal, type LoginPayload } from "./LoginModal";
import { SessionModal, type OpenSessionPayload } from "./SessionModal";
import { SessionSummary } from "./SessionSummary";

interface KassSessionContextValue {
  sessionId: string | null;
  cashierName: string | null;
  userName: string | null;
  isAuthenticated: boolean;
  report: KassReport | null;
  reportLoading: boolean;
  reportError: string | null;
  refreshReport: () => Promise<void>;
  openSessionPrompt: () => void;
}

const KassSessionContext = createContext<KassSessionContextValue | null>(null);

const SESSION_ID_KEY = "kass.session_id";
const CASHIER_NAME_KEY = "kass.cashier_name";
const ODOO_USER_ID_KEY = "kass.odoo_user_id";
const ODOO_LOGIN_KEY = "kass.odoo_login";
const ODOO_USER_NAME_KEY = "kass.odoo_user_name";

const navItems = [
  { href: "/pos", label: "Касс", icon: ShoppingCart },
  { href: "/dashboard", label: "Хянах самбар", icon: LayoutDashboard },
  { href: "/products", label: "Бүтээгдэхүүн", icon: Boxes },
  { href: "/warehouse", label: "Агуулах", icon: Warehouse },
  { href: "/partners", label: "Харилцагч", icon: Users },
  { href: "/sales", label: "Борлуулалт", icon: ReceiptText },
  { href: "/reports", label: "Тайлан", icon: BarChart3 },
  { href: "/settings", label: "Тохиргоо", icon: Settings },
];

function extractSessionId(response: OpenSessionResponse) {
  return response.session_id ?? response.session?.session_id ?? response.session?.id ?? null;
}

export function useKassSession() {
  const context = useContext(KassSessionContext);

  if (!context) {
    throw new Error("useKassSession must be used inside AppShell");
  }

  return context;
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [hydrated, setHydrated] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [cashierName, setCashierName] = useState<string | null>(null);
  const [userName, setUserName] = useState<string | null>(null);
  const [userLogin, setUserLogin] = useState<string | null>(null);
  const [odooUserId, setOdooUserId] = useState<string | null>(null);
  const [report, setReport] = useState<KassReport | null>(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);
  const [loginModalOpen, setLoginModalOpen] = useState(false);
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [sessionModalOpen, setSessionModalOpen] = useState(false);
  const [sessionLoading, setSessionLoading] = useState(false);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [closeModalOpen, setCloseModalOpen] = useState(false);
  const [closingCash, setClosingCash] = useState("");
  const [closeLoading, setCloseLoading] = useState(false);
  const [closeError, setCloseError] = useState<string | null>(null);
  const [closeResult, setCloseResult] = useState<CloseSessionResponse | null>(null);

  const normalizedReport = normalizeReport(report);
  const isAuthenticated = Boolean(userName && userLogin && odooUserId);
  const isPosRoute = pathname === "/pos";
  const activeCashierName = cashierName ?? userName;

  const clearStoredSession = useCallback(() => {
    window.localStorage.removeItem(SESSION_ID_KEY);
    window.localStorage.removeItem(CASHIER_NAME_KEY);
    setSessionId(null);
    setCashierName(null);
    setReport(null);
  }, []);

  const clearStoredAuth = useCallback(() => {
    clearStoredSession();
    window.localStorage.removeItem(ODOO_USER_ID_KEY);
    window.localStorage.removeItem(ODOO_LOGIN_KEY);
    window.localStorage.removeItem(ODOO_USER_NAME_KEY);
    setUserName(null);
    setUserLogin(null);
    setOdooUserId(null);
    setLoginError(null);
    setSessionError(null);
    setCloseResult(null);
  }, [clearStoredSession]);

  const adoptActiveSession = useCallback((activeSession: KassReport | null | undefined) => {
    const activeSessionId = activeSession?.session_id;

    if (!activeSessionId || activeSession.closed_at) return false;

    const activeCashier = activeSession.cashier_name ?? "Кассир";
    window.localStorage.setItem(SESSION_ID_KEY, activeSessionId);
    window.localStorage.setItem(CASHIER_NAME_KEY, activeCashier);
    setSessionId(activeSessionId);
    setCashierName(activeCashier);
    setReport(activeSession);
    setReportError(null);
    setSessionModalOpen(false);
    return true;
  }, []);

  const syncActiveSession = useCallback(async () => {
    try {
      const response = await getKassSessions({ status: "open", limit: 1 });
      const activeSession = response.active_session ?? response.sessions[0] ?? null;

      if (adoptActiveSession(activeSession)) {
        return activeSession;
      }

      if (sessionId) {
        clearStoredSession();
      }

      return null;
    } catch {
      return null;
    }
  }, [adoptActiveSession, clearStoredSession, sessionId]);

  const refreshReport = useCallback(
    async (overrideSessionId?: string) => {
      const activeSessionId = overrideSessionId ?? sessionId;
      if (!activeSessionId) return;

      setReportLoading(true);
      setReportError(null);

      try {
        const nextReport = await getSessionReport(activeSessionId);
        const nextNormalizedReport = normalizeReport(nextReport);

        if (nextNormalizedReport?.closed_at) {
          clearStoredSession();
          setReportError("Ээлж хаагдсан байна. Шинэ ээлж нээнэ үү.");
          return;
        }

        setReport(nextReport);
      } catch (error) {
        if (error instanceof KassApiError && (error.code === "session_not_found" || error.code === "session_closed")) {
          clearStoredSession();
          setSessionModalOpen(false);
          setLoginModalOpen(!userName);
        }

        setReportError(getReadableError(error));
      } finally {
        setReportLoading(false);
      }
    },
    [clearStoredSession, sessionId, userName],
  );

  useEffect(() => {
    const storedSessionId = window.localStorage.getItem(SESSION_ID_KEY);
    const storedCashierName = window.localStorage.getItem(CASHIER_NAME_KEY);
    const storedUserId = window.localStorage.getItem(ODOO_USER_ID_KEY);
    const storedLogin = window.localStorage.getItem(ODOO_LOGIN_KEY);
    const storedUserName = window.localStorage.getItem(ODOO_USER_NAME_KEY) ?? storedCashierName;
    const hasAuth = Boolean(storedUserId && storedLogin && storedUserName);

    setSessionId(storedSessionId);
    setCashierName(storedCashierName);
    setOdooUserId(storedUserId);
    setUserLogin(storedLogin);
    setUserName(storedUserName);
    setLoginModalOpen(!hasAuth);
    setSessionModalOpen(false);
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;

    syncActiveSession();
    const interval = window.setInterval(() => syncActiveSession(), 15000);

    return () => window.clearInterval(interval);
  }, [hydrated, syncActiveSession]);

  useEffect(() => {
    if (isPosRoute) return;

    setSessionModalOpen(false);
    setCloseModalOpen(false);
  }, [isPosRoute]);

  useEffect(() => {
    if (!sessionId) return;

    refreshReport(sessionId);
    const interval = window.setInterval(() => refreshReport(sessionId), 30000);

    return () => window.clearInterval(interval);
  }, [refreshReport, sessionId]);

  async function handleLogin(payload: LoginPayload) {
    setLoginLoading(true);
    setLoginError(null);

    try {
      const login = await loginOdooCashier({
        username: payload.username,
        password: payload.password,
      });
      const nextUserName = login.user.name || login.user.login || payload.username;

      window.localStorage.setItem(ODOO_USER_ID_KEY, String(login.user.user_id));
      window.localStorage.setItem(ODOO_LOGIN_KEY, login.user.login);
      window.localStorage.setItem(ODOO_USER_NAME_KEY, nextUserName);
      setOdooUserId(String(login.user.user_id));
      setUserLogin(login.user.login);
      setUserName(nextUserName);
      setLoginModalOpen(false);
      setSessionModalOpen(false);
      setCloseResult(null);
      await syncActiveSession();
    } catch (error) {
      setLoginError(getReadableError(error));
    } finally {
      setLoginLoading(false);
    }
  }

  async function handleOpenSession(payload: OpenSessionPayload) {
    const nextCashierName = userName ?? userLogin;

    if (!nextCashierName) {
      setSessionModalOpen(false);
      setLoginModalOpen(true);
      return;
    }

    setSessionLoading(true);
    setSessionError(null);

    try {
      const response = await openKassSession({
        cashier_name: nextCashierName,
        opening_cash: payload.openingCash,
      });
      const nextSessionId = extractSessionId(response);

      if (!nextSessionId) {
        throw new Error("Session ID API response-д ирсэнгүй.");
      }

      window.localStorage.setItem(SESSION_ID_KEY, nextSessionId);
      window.localStorage.setItem(CASHIER_NAME_KEY, nextCashierName);
      setSessionId(nextSessionId);
      setCashierName(nextCashierName);
      setSessionModalOpen(false);
      setCloseResult(null);
      await refreshReport(nextSessionId);
    } catch (error) {
      if (error instanceof KassApiError && error.code === "session_already_open") {
        const activeSession = await syncActiveSession();
        if (activeSession) {
          setSessionModalOpen(false);
          return;
        }
      }

      setSessionError(getReadableError(error));
    } finally {
      setSessionLoading(false);
    }
  }

  function handleLogout() {
    const ok =
      !sessionId ||
      window.confirm("Идэвхтэй ээлж байна. Гарах үед ээлж автоматаар хаагдахгүй. Үргэлжлүүлэх үү?");

    if (!ok) return;

    clearStoredAuth();
    setLoginModalOpen(true);
    setSessionModalOpen(false);
  }

  async function handleCloseShift(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!sessionId) return;

    const cash = Number(closingCash);
    if (!Number.isFinite(cash) || cash < 0) {
      setCloseError("Хаалтын бэлэн мөнгөн дүн 0 эсвэл түүнээс их байх ёстой.");
      return;
    }

    setCloseLoading(true);
    setCloseError(null);
    const closingSessionId = sessionId;
    const reportTab = window.open("", "_blank");
    if (reportTab) {
      reportTab.document.title = "Ээлжийн тайлан";
      reportTab.document.body.innerHTML = "<p style=\"font-family: sans-serif; padding: 24px;\">Ээлжийн тайлан бэлдэж байна...</p>";
    }

    try {
      const response = await closeKassSession({
        session_id: closingSessionId,
        closing_cash: cash,
      });

      setCloseResult(response);
      setCloseModalOpen(false);
      setClosingCash("");
      clearStoredSession();
      if (reportTab) {
        reportTab.location.href = `/sales?session_id=${encodeURIComponent(closingSessionId)}`;
      }
    } catch (error) {
      if (reportTab) reportTab.close();
      setCloseError(getReadableError(error));
    } finally {
      setCloseLoading(false);
    }
  }

  const openSessionPrompt = useCallback(() => {
    if (!isPosRoute) return;

    if (!isAuthenticated) {
      setLoginModalOpen(true);
      return;
    }

    if (sessionId) return;

    setSessionError(null);
    setSessionModalOpen(true);
  }, [isAuthenticated, isPosRoute, sessionId]);

  const contextValue = useMemo<KassSessionContextValue>(
    () => ({
      sessionId,
      cashierName: activeCashierName,
      userName,
      isAuthenticated,
      report: normalizedReport,
      reportLoading,
      reportError,
      refreshReport: () => refreshReport(),
      openSessionPrompt,
    }),
    [
      activeCashierName,
      isAuthenticated,
      normalizedReport,
      openSessionPrompt,
      refreshReport,
      reportError,
      reportLoading,
      sessionId,
      userName,
    ],
  );

  const expectedCash =
    normalizedReport?.expected_cash ??
    Number(normalizedReport?.opening_cash ?? 0) + Number(normalizedReport?.cash_total ?? 0);
  const shouldShowLoginModal = hydrated && loginModalOpen && !closeResult;
  const shouldShowSessionModal = hydrated && isPosRoute && isAuthenticated && sessionModalOpen && !closeResult;
  const topbarStatusLabel = isAuthenticated ? "Нэвтэрсэн" : "Нэвтрэх шаардлагатай";
  const topbarStatusClass = isAuthenticated ? "status-pill success" : "status-pill muted";

  return (
    <KassSessionContext.Provider value={contextValue}>
      <div className="app-shell">
        <aside className="sidebar">
          <div className="brand-block">
            <img className="brand-logo" src="/cozy-coffee-logo.jpg" alt="Cozy Coffee" />
            <div className="brand-copy">
              <strong>Cozy Coffee Kass</strong>
              <span>Odoo касс</span>
            </div>
          </div>

          <nav className="side-nav" aria-label="Үндсэн цэс">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = pathname === item.href;

              return (
                <Link key={item.href} className={active ? "nav-link active" : "nav-link"} href={item.href}>
                  <Icon size={18} aria-hidden="true" />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>

          {isPosRoute ? (
            <SessionSummary
              cashierName={activeCashierName}
              sessionId={sessionId}
              openedAt={normalizedReport?.opened_at ?? null}
              error={reportError}
              compact
              loggedIn={isAuthenticated}
              onOpenShift={openSessionPrompt}
              onCloseShift={() => {
                setClosingCash(String(expectedCash || ""));
                setCloseError(null);
                setCloseModalOpen(true);
              }}
            />
          ) : null}
        </aside>

        <div className="main-shell">
          <header className="topbar">
            <div>
              <p className="eyebrow">Касс систем</p>
              <h1>{navItems.find((item) => item.href === pathname)?.label ?? "Касс"}</h1>
            </div>
            <div className="topbar-actions">
              <span className={topbarStatusClass}>{topbarStatusLabel}</span>
              {!isAuthenticated ? (
                <button className="secondary-button" type="button" onClick={() => setLoginModalOpen(true)}>
                  <LogIn size={16} aria-hidden="true" />
                  <span>Нэвтрэх</span>
                </button>
              ) : null}
              {isAuthenticated ? (
                <button className="secondary-button" type="button" onClick={handleLogout}>
                  <LogOut size={16} aria-hidden="true" />
                  <span>Гарах</span>
                </button>
              ) : null}
            </div>
          </header>

          {isPosRoute ? (
            <div className="mobile-shift-strip" data-testid="mobile-shift-strip">
              <div>
                <span className={sessionId ? "status-dot open" : isAuthenticated ? "status-dot warning" : "status-dot muted"} />
                <div>
                  <strong>{sessionId ? "Ээлж нээлттэй" : isAuthenticated ? "Ээлж нээгээгүй" : "Нэвтрэх хэрэгтэй"}</strong>
                  <small>{sessionId ? `Нээсэн: ${activeCashierName ?? "Кассир"}` : activeCashierName ?? "Odoo хэрэглэгчээр нэвтэрнэ үү"}</small>
                </div>
              </div>
              {!sessionId && isAuthenticated ? (
                <button className="primary-button" type="button" onClick={openSessionPrompt}>
                  <DoorOpen size={16} aria-hidden="true" />
                  <span>Нээх</span>
                </button>
              ) : null}
              {sessionId && isAuthenticated ? (
                <button
                  className="danger-button"
                  type="button"
                  onClick={() => {
                    setClosingCash(String(expectedCash || ""));
                    setCloseError(null);
                    setCloseModalOpen(true);
                  }}
                >
                  <Square size={15} aria-hidden="true" />
                  <span>Хаах</span>
                </button>
              ) : null}
            </div>
          ) : null}

          <main className="content-area">{children}</main>
        </div>
      </div>

      <LoginModal open={shouldShowLoginModal} loading={loginLoading} error={loginError} onLogin={handleLogin} />

      <SessionModal
        open={shouldShowSessionModal}
        cashierName={activeCashierName}
        loading={sessionLoading}
        error={sessionError}
        onOpenSession={handleOpenSession}
        onCancel={() => {
          setSessionError(null);
          setSessionModalOpen(false);
        }}
      />

      {isPosRoute && closeModalOpen ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="close-shift-title">
          <form className="modal-card narrow-modal" onSubmit={handleCloseShift}>
            <button
              className="icon-button modal-close"
              type="button"
              aria-label="Хаах"
              onClick={() => setCloseModalOpen(false)}
            >
              <X size={18} aria-hidden="true" />
            </button>
            <p className="eyebrow">Ээлж хаах</p>
            <h2 id="close-shift-title">Ээлж хаах</h2>
            <p className="muted-text">Хүлээгдэж буй касс: {formatMoney(expectedCash)}</p>
            <label className="field">
              <span>Хаалтын бэлэн мөнгө</span>
              <input
                type="number"
                min="0"
                inputMode="numeric"
                value={closingCash}
                onChange={(event) => setClosingCash(event.target.value)}
              />
            </label>
            {closeError ? <div className="form-error">{closeError}</div> : null}
            <button className="danger-button full-width" type="submit" disabled={closeLoading}>
              <span>{closeLoading ? "Хааж байна" : "Ээлж хаах"}</span>
            </button>
          </form>
        </div>
      ) : null}

      {isPosRoute && closeResult ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="close-result-title">
          <div className="modal-card">
            <p className="eyebrow">Ээлжийн тайлан</p>
            <h2 id="close-result-title">Ээлж хаагдлаа</h2>
            <div className="summary-grid">
              <div className="metric">
                <span>Нийт борлуулалт</span>
                <strong>{formatMoney(closeResult.total_sales ?? closeResult.report?.total_sales)}</strong>
              </div>
              <div className="metric">
                <span>Бэлэн</span>
                <strong>{formatMoney(closeResult.cash_total ?? closeResult.report?.cash_total)}</strong>
              </div>
              <div className="metric">
                <span>Карт</span>
                <strong>{formatMoney(closeResult.card_total ?? closeResult.report?.card_total)}</strong>
              </div>
              <div className="metric">
                <span>QPay</span>
                <strong>{formatMoney(closeResult.qpay_total ?? closeResult.report?.qpay_total)}</strong>
              </div>
              <div className="metric">
                <span>Дансаар</span>
                <strong>{formatMoney(closeResult.bank_total ?? closeResult.report?.bank_total)}</strong>
              </div>
              <div className="metric">
                <span>Хүлээгдэж буй бэлэн мөнгө</span>
                <strong>{formatMoney(closeResult.expected_cash ?? closeResult.report?.expected_cash)}</strong>
              </div>
              <div className="metric">
                <span>Бэлэн мөнгөний зөрүү</span>
                <strong>{formatMoney(closeResult.cash_difference)}</strong>
              </div>
            </div>
            <button
              className="primary-button full-width"
              type="button"
              onClick={() => {
                setCloseResult(null);
                openSessionPrompt();
              }}
            >
              <span>Шинэ ээлж нээх</span>
            </button>
          </div>
        </div>
      ) : null}
    </KassSessionContext.Provider>
  );
}
