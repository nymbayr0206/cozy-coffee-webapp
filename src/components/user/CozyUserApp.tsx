"use client";

import {
  Bell,
  Check,
  ChevronRight,
  Coffee,
  Gift,
  Heart,
  Home,
  LockKeyhole,
  LogOut,
  Phone,
  QrCode,
  RotateCcw,
  Settings,
  Ticket,
  User,
  UserRound,
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";

type AuthMode = "login" | "register";
type TabKey = "home" | "coupons" | "profile";

interface CozyUserProfile {
  member_id?: number;
  partner_id?: number;
  name: string;
  phone: string;
}

interface CozyUserCoupon {
  id: number;
  code: string;
  state: string;
  reward_product_name?: string | null;
  expires_at?: string | null;
}

interface CozyUserWallet {
  member: {
    id: number;
    partner_id: number;
    name: string;
    phone: string;
    stamp_count: number;
  };
  coupons: CozyUserCoupon[];
}

const PROFILE_KEY = "cozy.user.profile";
const STAMP_TARGET = 9;
const INITIAL_STAMPS = 0;

function readProfile() {
  if (typeof window === "undefined") return null;

  const stored = window.localStorage.getItem(PROFILE_KEY);
  if (!stored) return null;

  try {
    return JSON.parse(stored) as CozyUserProfile;
  } catch {
    return null;
  }
}

async function userLoyaltyRequest<T>(path: string, init?: RequestInit) {
  const response = await fetch(`/api/user/loyalty${path}`, {
    ...init,
    cache: "no-store",
    headers: {
      Accept: "application/json",
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  const payload = (await response.json().catch(() => null)) as { error?: { message?: string; code?: string } } | null;

  if (!response.ok) {
    const message = payload?.error?.message ?? "Odoo loyalty request failed.";
    const code = payload?.error?.code ? ` (${payload.error.code})` : "";
    throw new Error(`${message}${code}`);
  }

  return payload as T;
}

function profileFromWallet(wallet: CozyUserWallet): CozyUserProfile {
  return {
    member_id: wallet.member.id,
    partner_id: wallet.member.partner_id,
    name: wallet.member.name,
    phone: wallet.member.phone,
  };
}

function StampRow({ count, compact = false }: { count: number; compact?: boolean }) {
  return (
    <div className={compact ? "user-stamps compact" : "user-stamps"} aria-label={`${count} / ${STAMP_TARGET} тамга`}>
      {Array.from({ length: STAMP_TARGET }).map((_, index) => {
        const filled = index < count;
        return (
          <span key={index} className={filled ? "stamp-dot filled" : "stamp-dot"}>
            {filled ? <Coffee size={compact ? 10 : 12} strokeWidth={2.5} aria-hidden="true" /> : null}
          </span>
        );
      })}
    </div>
  );
}

export function CozyUserApp() {
  const [hydrated, setHydrated] = useState(false);
  const [authMode, setAuthMode] = useState<AuthMode>("register");
  const [activeTab, setActiveTab] = useState<TabKey>("home");
  const [profile, setProfile] = useState<CozyUserProfile | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [stamps, setStamps] = useState(INITIAL_STAMPS);
  const [coupons, setCoupons] = useState<CozyUserCoupon[]>([]);
  const [authLoading, setAuthLoading] = useState(false);
  const [qrLoadingCouponId, setQrLoadingCouponId] = useState<number | null>(null);
  const [couponQr, setCouponQr] = useState<{ couponId: number; image: string; token: string } | null>(null);
  const [message, setMessage] = useState("");

  const remaining = Math.max(STAMP_TARGET - stamps, 0);
  const progress = useMemo(() => (stamps / STAMP_TARGET) * 100, [stamps]);
  const activeCoupons = useMemo(() => coupons.filter((coupon) => coupon.state === "available"), [coupons]);

  useEffect(() => {
    window.localStorage.removeItem("cozy.user.stamps");
    const storedProfile = readProfile();
    setProfile(storedProfile);
    setStamps(INITIAL_STAMPS);
    if (storedProfile) {
      setName(storedProfile.name);
      setPhone(storedProfile.phone);
      setAuthMode("login");
      if (storedProfile.member_id) {
        void userLoyaltyRequest<{ ok: boolean } & CozyUserWallet>(`/wallet?member_id=${encodeURIComponent(storedProfile.member_id)}`)
          .then((wallet) => {
            const nextProfile = profileFromWallet(wallet);
            setProfile(nextProfile);
            setStamps(wallet.member.stamp_count);
            setCoupons(wallet.coupons ?? []);
            window.localStorage.setItem(PROFILE_KEY, JSON.stringify(nextProfile));
          })
          .catch((error: unknown) => {
            setMessage(error instanceof Error ? error.message : "Odoo loyalty wallet уншиж чадсангүй.");
          });
      }
    }
    setHydrated(true);
  }, []);

  async function handleAuthSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAuthLoading(true);
    setMessage("");

    try {
      const wallet = await userLoyaltyRequest<{ ok: boolean } & CozyUserWallet>("/auth", {
        method: "POST",
        body: JSON.stringify({
          mode: authMode,
          name: name.trim(),
          phone: phone.trim(),
          pin: password,
        }),
      });
      const nextProfile = profileFromWallet(wallet);

      window.localStorage.setItem(PROFILE_KEY, JSON.stringify(nextProfile));
      setProfile(nextProfile);
      setName(nextProfile.name);
      setPhone(nextProfile.phone);
      setStamps(wallet.member.stamp_count);
      setCoupons(wallet.coupons ?? []);
      setCouponQr(null);
      setMessage(authMode === "register" ? "Бүртгэл амжилттай. Таны loyalty карт Odoo дээр үүслээ." : "Тавтай морил.");
      setPassword("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Odoo loyalty нэвтрэлт амжилтгүй боллоо.");
    } finally {
      setAuthLoading(false);
    }
  }

  function handleRedeem() {
    setActiveTab("coupons");
    setMessage("Идэвхтэй купоноос QR үүсгээд касс дээр уншуулна уу.");
  }

  function handleRefreshWallet() {
    if (!profile?.member_id) return;
    void userLoyaltyRequest<{ ok: boolean } & CozyUserWallet>(`/wallet?member_id=${encodeURIComponent(profile.member_id)}`)
      .then((wallet) => {
        setStamps(wallet.member.stamp_count);
        setCoupons(wallet.coupons ?? []);
        setMessage("Odoo wallet дахин уншигдлаа.");
      })
      .catch((error: unknown) => {
        setMessage(error instanceof Error ? error.message : "Odoo wallet дахин уншиж чадсангүй.");
      });
  }

  function handleLogout() {
    setProfile(null);
    setAuthMode("login");
    setMessage("");
  }

  async function handleCreateCouponQr(couponId: number) {
    if (!profile?.member_id) return;

    setQrLoadingCouponId(couponId);
    setCouponQr(null);
    setMessage("");

    try {
      const result = await userLoyaltyRequest<{
        ok: boolean;
        qr_token: string;
        qr_image: string;
      }>("/coupon-qr", {
        method: "POST",
        body: JSON.stringify({
          member_id: profile.member_id,
          coupon_id: couponId,
        }),
      });
      setCouponQr({ couponId, image: result.qr_image, token: result.qr_token });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Купоны QR үүсгэж чадсангүй.");
    } finally {
      setQrLoadingCouponId(null);
    }
  }

  if (!hydrated) {
    return <main className="cozy-user-app loading" aria-label="Cozy Coffee user app" />;
  }

  if (!profile) {
    const isRegister = authMode === "register";

    return (
      <main className="cozy-user-app auth">
        <section className="auth-phone" aria-label="Cozy Coffee бүртгэл">
          <div className="auth-brand">
            <img src="/cozy-user-icon.png" alt="Cozy Coffee" />
            <img src="/cozy-coffee-logo.jpg" alt="Cozy Coffee logo" />
          </div>

          <div className="auth-copy">
            <h1>{isRegister ? "Cozy Coffee-д бүртгүүлэх" : "Cozy Coffee-д нэвтрэх"}</h1>
            <p>9 кофе авбал 1 үнэгүй кофе авах loyalty картаа утасны дугаараар нээгээрэй.</p>
          </div>

          <div className="auth-switch" role="tablist" aria-label="Бүртгэл болон нэвтрэх">
            <button className={isRegister ? "active" : ""} type="button" onClick={() => setAuthMode("register")}>
              Бүртгүүлэх
            </button>
            <button className={!isRegister ? "active" : ""} type="button" onClick={() => setAuthMode("login")}>
              Нэвтрэх
            </button>
          </div>

          <form className="user-auth-form" onSubmit={handleAuthSubmit}>
            {isRegister ? (
              <label>
                <span>Нэр</span>
                <div className="user-input">
                  <UserRound size={18} aria-hidden="true" />
                  <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Нэрээ оруулна уу" />
                </div>
              </label>
            ) : null}

            <label>
              <span>Утасны дугаар</span>
              <div className="user-input">
                <Phone size={18} aria-hidden="true" />
                <input
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                  placeholder="Утасны дугаар"
                  inputMode="tel"
                />
              </div>
            </label>

            <label>
              <span>Нууц үг</span>
              <div className="user-input">
                <LockKeyhole size={18} aria-hidden="true" />
                <input
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="••••••••"
                  type="password"
                  autoComplete={isRegister ? "new-password" : "current-password"}
                />
              </div>
            </label>

            <button className="user-primary-button" type="submit" disabled={authLoading}>
              {authLoading ? "Odoo холбогдож байна" : isRegister ? "Бүртгүүлэх" : "Нэвтрэх"}
            </button>
          </form>

          {message ? <p className="user-message auth-message">{message}</p> : null}

          <div className="auth-loyalty-preview">
            <div>
              <strong>9 кофе = 1 үнэгүй кофе</strong>
              <span>Бүртгүүлмэгц таны тамганы карт автоматаар үүснэ.</span>
            </div>
            <Gift size={22} aria-hidden="true" />
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="cozy-user-app">
      <section className="user-phone-shell" aria-label="Cozy Coffee хэрэглэгчийн app">
        {activeTab === "home" ? (
          <>
            <header className="user-home-header">
              <img src="/cozy-coffee-logo.jpg" alt="Cozy Coffee" />
              <button className="round-icon-button" type="button" aria-label="Мэдэгдэл">
                <Bell size={19} aria-hidden="true" />
              </button>
            </header>

            <section className="loyalty-card">
              <div className="loyalty-heading">
                <h1>9 кофе авбал 1 үнэгүй кофе авна уу!</h1>
                <button className="round-icon-button small" type="button" aria-label="Бэлэг">
                  <Gift size={17} aria-hidden="true" />
                </button>
              </div>
              <StampRow count={stamps} />
              <div className="loyalty-meta">
                <strong>{stamps} / {STAMP_TARGET}</strong>
                <span>{activeCoupons.length > 0 ? `${activeCoupons.length} купон бэлэн байна` : `${remaining} тамга дутуу байна`}</span>
              </div>
              <div className="loyalty-track" aria-hidden="true">
                <span style={{ width: `${progress}%` }} />
              </div>
              <div className="loyalty-actions">
                <div className="loyalty-source-note">Тамга зөвхөн кассын худалдан авалтаар нэмэгдэнэ.</div>
                <button className="user-primary-button compact" type="button" onClick={handleRedeem} disabled={activeCoupons.length === 0}>
                  <Check size={16} aria-hidden="true" />
                  Купон QR авах
                </button>
              </div>
              {message ? <p className="user-message">{message}</p> : null}
            </section>

          </>
        ) : null}

        {activeTab === "coupons" ? (
          <section className="coupon-screen">
            <h1>Миний купонууд</h1>
            <div className="coupon-tabs" role="tablist" aria-label="Купон төлөв">
              <button className="active" type="button">Идэвхтэй ({activeCoupons.length})</button>
              <button type="button">Бүгд ({coupons.length})</button>
            </div>
            {activeCoupons.length === 0 ? (
              <div className="user-message">Одоогоор идэвхтэй купон алга. 9 тамга цуглуулахад Odoo дээр купон автоматаар үүснэ.</div>
            ) : null}
            {activeCoupons.map((coupon) => (
              <article className="ticket-card featured" key={coupon.id}>
                <div className="ticket-side">
                  <Coffee size={34} aria-hidden="true" />
                  <strong>1 үнэгүй кофе</strong>
                </div>
                <div className="ticket-body">
                  <h2>{coupon.reward_product_name ?? "9 кофе авбал 1 үнэгүй кофе"}</h2>
                  <p>Код: {coupon.code}. Касс дээр QR уншуулж, гүйлгээний нууц үгээ хийнэ.</p>
                  <span>{coupon.expires_at ? `${coupon.expires_at.slice(0, 10)} хүртэл` : "Хугацаагүй"}</span>
                  <button
                    className="user-secondary-button"
                    type="button"
                    onClick={() => void handleCreateCouponQr(coupon.id)}
                    disabled={qrLoadingCouponId === coupon.id}
                  >
                    <QrCode size={16} aria-hidden="true" />
                    {qrLoadingCouponId === coupon.id ? "QR үүсгэж байна" : "QR үүсгэх"}
                  </button>
                  {couponQr?.couponId === coupon.id ? (
                    <div className="coupon-qr-box">
                      <img src={couponQr.image} alt="Cozy coupon QR" />
                      <code>{couponQr.token}</code>
                    </div>
                  ) : null}
                </div>
              </article>
            ))}
          </section>
        ) : null}

        {activeTab === "profile" ? (
          <section className="profile-screen">
            <header className="profile-top">
              <span />
              <h1>Профайл</h1>
              <button className="round-icon-button" type="button" aria-label="Тохиргоо">
                <Settings size={18} aria-hidden="true" />
              </button>
            </header>

            <article className="profile-card">
              <img src="/cozy-user-icon.png" alt="" />
              <div>
                <strong>{profile.name}</strong>
                <span>{profile.phone}</span>
              </div>
              <ChevronRight size={18} aria-hidden="true" />
            </article>

            <article className="profile-stamp-card">
              <div>
                <h2>Таны тамга</h2>
                <strong>{stamps} / {STAMP_TARGET}</strong>
              </div>
              <StampRow count={stamps} compact />
              <p>{remaining === 0 ? "Та 1 үнэгүй кофе авахад бэлэн байна." : `${remaining} тамга дутуу байна. Та 1 үнэгүй кофе авахад ойрхон байна!`}</p>
              <button className="user-secondary-button" type="button" onClick={handleRefreshWallet}>
                <RotateCcw size={16} aria-hidden="true" />
                Odoo wallet сэргээх
              </button>
            </article>

            <div className="profile-menu">
              {[
                ["Миний купонууд", Ticket],
                ["Захиалгын түүх", Coffee],
                ["Хадгалсан бүтээгдэхүүн", Heart],
                ["Миний мэдээлэл", User],
              ].map(([label, Icon]) => {
                const MenuIcon = Icon as typeof Ticket;
                return (
                  <button key={label as string} type="button">
                    <MenuIcon size={19} aria-hidden="true" />
                    <span>{label as string}</span>
                    <ChevronRight size={18} aria-hidden="true" />
                  </button>
                );
              })}
              <button type="button" onClick={handleLogout}>
                <LogOut size={19} aria-hidden="true" />
                <span>Гарах</span>
                <ChevronRight size={18} aria-hidden="true" />
              </button>
            </div>
          </section>
        ) : null}

        <nav className="user-bottom-nav" aria-label="User app menu">
          {[
            ["home", "Нүүр", Home],
            ["coupons", "Купон", Ticket],
            ["profile", "Профайл", User],
          ].map(([key, label, Icon]) => {
            const NavIcon = Icon as typeof Home;
            const tabKey = key as TabKey;
            return (
              <button
                key={tabKey}
                className={activeTab === tabKey ? "active" : ""}
                type="button"
                onClick={() => setActiveTab(tabKey)}
              >
                <NavIcon size={21} aria-hidden="true" />
                <span>{label as string}</span>
              </button>
            );
          })}
        </nav>
      </section>
    </main>
  );
}
