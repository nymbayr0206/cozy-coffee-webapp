"use client";

import {
  Bell,
  Camera,
  CheckCheck,
  ChevronRight,
  Coffee,
  Eye,
  EyeOff,
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
  X,
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";

type AuthMode = "login" | "register";
type TabKey = "home" | "scan" | "coupons" | "profile";

interface CozyUserProfile {
  member_id?: number;
  partner_id?: number;
  name: string;
  phone: string;
  marketing_opt_in?: boolean;
  push_enabled?: boolean;
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
    marketing_opt_in?: boolean;
    last_purchase_at?: string | null;
    push_enabled?: boolean;
  };
  coupons: CozyUserCoupon[];
}

interface CozyNotificationMessage {
  id: number;
  campaign_id?: number | null;
  title: string;
  message: string;
  image?: string | null;
  send_time?: string | null;
  read_at?: string | null;
  status: string;
}

interface CozyNotificationInbox {
  unread_count: number;
  marketing_opt_in?: boolean;
  messages: CozyNotificationMessage[];
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

async function cozyNotificationRequest<T>(path: string, init?: RequestInit) {
  const response = await fetch(`/api/cozy/notifications${path}`, {
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
    const message = payload?.error?.message ?? "Notification request failed.";
    const code = payload?.error?.code ? ` (${payload.error.code})` : "";
    throw new Error(`${message}${code}`);
  }

  return payload as T;
}

async function cozyPushRequest<T>(path: string, init?: RequestInit) {
  const response = await fetch(`/api/cozy/push${path}`, {
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
    const message = payload?.error?.message ?? "Push notification request failed.";
    const code = payload?.error?.code ? ` (${payload.error.code})` : "";
    throw new Error(`${message}${code}`);
  }

  return payload as T;
}

function friendlyUserError(error: unknown, fallback: string) {
  if (!(error instanceof Error)) return fallback;
  const technicalWords = ["odoo", "loyalty", "wallet", "notification", "cozy.loyalty", "module", "server", "connection", "rpc"];
  const lower = error.message.toLowerCase();
  if (technicalWords.some((word) => lower.includes(word))) return fallback;
  return error.message;
}

function profileFromWallet(wallet: CozyUserWallet): CozyUserProfile {
  return {
    member_id: wallet.member.id,
    partner_id: wallet.member.partner_id,
    name: wallet.member.name,
    phone: wallet.member.phone,
    marketing_opt_in: wallet.member.marketing_opt_in ?? true,
    push_enabled: wallet.member.push_enabled ?? false,
  };
}

function urlBase64ToUint8Array(value: string) {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
}

function formatNotificationTime(value?: string | null) {
  if (!value) return "";
  const normalized = value.includes("T") ? value : `${value.replace(" ", "T")}Z`;
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("mn-MN", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
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
  const [authMode, setAuthMode] = useState<AuthMode>("login");
  const [activeTab, setActiveTab] = useState<TabKey>("home");
  const [profile, setProfile] = useState<CozyUserProfile | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [stamps, setStamps] = useState(INITIAL_STAMPS);
  const [coupons, setCoupons] = useState<CozyUserCoupon[]>([]);
  const [authLoading, setAuthLoading] = useState(false);
  const [message, setMessage] = useState("");
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const scanFrameRef = useRef<number | null>(null);
  const [scanActive, setScanActive] = useState(false);
  const [scanCode, setScanCode] = useState("");
  const [manualScanCode, setManualScanCode] = useState("");
  const [scanNotice, setScanNotice] = useState("");
  const [notifications, setNotifications] = useState<CozyNotificationMessage[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [notificationLoading, setNotificationLoading] = useState(false);
  const [notificationNotice, setNotificationNotice] = useState("");
  const [marketingUpdating, setMarketingUpdating] = useState(false);
  const [pushSupported, setPushSupported] = useState(false);
  const [pushPermission, setPushPermission] = useState<NotificationPermission>("default");
  const [pushUpdating, setPushUpdating] = useState(false);

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
            setMessage(friendlyUserError(error, "Картын мэдээлэл түр уншигдсангүй. Дахин оролдоно уу."));
          });
      }
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const supported = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
    setPushSupported(supported);
    if (supported) setPushPermission(Notification.permission);
  }, []);

  useEffect(() => {
    return () => {
      stopCashierScan();
    };
  }, []);

  useEffect(() => {
    if (!profile?.member_id) return;

    void refreshNotifications(profile.member_id, { quiet: true });
    const intervalId = window.setInterval(() => {
      void refreshNotifications(profile.member_id, { quiet: true });
    }, 60000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [profile?.member_id]);

  async function handleAuthSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");

    if (authMode === "register" && password !== confirmPassword) {
      setMessage("Нууц үг давталт таарахгүй байна.");
      return;
    }

    setAuthLoading(true);

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
      setMessage(authMode === "register" ? "Бүртгэл амжилттай. Таны урамшууллын карт бэлэн боллоо." : "Тавтай морил.");
      setPassword("");
      setConfirmPassword("");
    } catch (error) {
      setMessage(friendlyUserError(error, "Нэвтрэхэд алдаа гарлаа. Утасны дугаар болон нууц үгээ шалгана уу."));
    } finally {
      setAuthLoading(false);
    }
  }

  function handleRefreshWallet() {
    if (!profile?.member_id) return;
    void userLoyaltyRequest<{ ok: boolean } & CozyUserWallet>(`/wallet?member_id=${encodeURIComponent(profile.member_id)}`)
      .then((wallet) => {
        const nextProfile = profileFromWallet(wallet);
        setProfile(nextProfile);
        setStamps(wallet.member.stamp_count);
        setCoupons(wallet.coupons ?? []);
        window.localStorage.setItem(PROFILE_KEY, JSON.stringify(nextProfile));
        setMessage("Картын мэдээлэл шинэчлэгдлээ.");
      })
      .catch((error: unknown) => {
        setMessage(friendlyUserError(error, "Картын мэдээлэл шинэчилж чадсангүй. Дахин оролдоно уу."));
      });
  }

  function handleLogout() {
    setProfile(null);
    setAuthMode("login");
    setMessage("");
    setNotifications([]);
    setUnreadCount(0);
    setNotificationOpen(false);
    window.localStorage.removeItem(PROFILE_KEY);
  }

  function handleProfileAction(action: "coupons" | "orders" | "saved" | "info" | "settings") {
    if (action === "coupons") {
      setMessage("");
      setActiveTab("coupons");
      return;
    }

    if (action === "info") {
      setMessage(`Нэр: ${profile?.name ?? "-"}. Утас: ${profile?.phone ?? "-"}`);
      return;
    }

    if (action === "orders") {
      setMessage("Захиалгын түүх удахгүй нэмэгдэнэ.");
      return;
    }

    if (action === "saved") {
      setMessage("Хадгалсан бүтээгдэхүүний хэсэг удахгүй нэмэгдэнэ.");
      return;
    }

    setMessage("Тохиргооны хэсэг удахгүй нэмэгдэнэ.");
  }

  function stopCashierScan() {
    if (scanFrameRef.current !== null) {
      window.cancelAnimationFrame(scanFrameRef.current);
      scanFrameRef.current = null;
    }

    const stream = videoRef.current?.srcObject;
    if (stream instanceof MediaStream) {
      stream.getTracks().forEach((track) => track.stop());
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setScanActive(false);
  }

  async function startCashierScan() {
    setScanNotice("");
    setScanCode("");

    const BarcodeDetectorCtor = (window as unknown as { BarcodeDetector?: new (options?: unknown) => { detect: (source: HTMLVideoElement) => Promise<Array<{ rawValue?: string }>> } }).BarcodeDetector;
    if (!BarcodeDetectorCtor) {
      setScanNotice("Таны browser камераар код унших боломжгүй байна. Доорх талбарт кодоо оруулна уу.");
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setScanNotice("Камер ашиглах боломжгүй байна. Доорх талбарт кодоо оруулна уу.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });

      if (!videoRef.current) return;
      videoRef.current.srcObject = stream;
      await videoRef.current.play();
      setScanActive(true);

      const detector = new BarcodeDetectorCtor({ formats: ["qr_code"] });
      const tick = async () => {
        const video = videoRef.current;
        if (!video || video.readyState < 2) {
          scanFrameRef.current = window.requestAnimationFrame(tick);
          return;
        }

        try {
          const codes = await detector.detect(video);
          const rawValue = codes[0]?.rawValue?.trim();
          if (rawValue) {
            setScanCode(rawValue);
            setScanNotice("Код уншигдлаа. Касс дээр баталгаажуулна уу.");
            stopCashierScan();
            return;
          }
        } catch {
          setScanNotice("Код уншихад алдаа гарлаа. Дахин ойртуулж үзнэ үү.");
        }

        scanFrameRef.current = window.requestAnimationFrame(tick);
      };

      scanFrameRef.current = window.requestAnimationFrame(tick);
    } catch {
      setScanNotice("Камер нээж чадсангүй. Зөвшөөрөл өгөөд дахин оролдоно уу.");
    }
  }

  function handleManualScanSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const code = manualScanCode.trim();
    if (!code) {
      setScanNotice("Кодоо оруулна уу.");
      return;
    }
    setScanCode(code);
    setScanNotice("Код бүртгэгдлээ. Касс дээр баталгаажуулна уу.");
  }

  function applyNotificationInbox(inbox: CozyNotificationInbox) {
    setNotifications(inbox.messages ?? []);
    setUnreadCount(inbox.unread_count ?? 0);
    if (profile && inbox.marketing_opt_in !== undefined) {
      const nextProfile = { ...profile, marketing_opt_in: inbox.marketing_opt_in };
      setProfile(nextProfile);
      window.localStorage.setItem(PROFILE_KEY, JSON.stringify(nextProfile));
    }
  }

  async function refreshNotifications(memberId = profile?.member_id, options?: { quiet?: boolean }) {
    if (!memberId) return;
    if (!options?.quiet) {
      setNotificationLoading(true);
      setNotificationNotice("");
    }

    try {
      const inbox = await cozyNotificationRequest<{ ok: boolean } & CozyNotificationInbox>(`?member_id=${encodeURIComponent(memberId)}&limit=40`);
      applyNotificationInbox(inbox);
    } catch (error) {
      if (!options?.quiet) {
        setNotificationNotice(friendlyUserError(error, "Мэдэгдэл түр уншигдсангүй. Дахин оролдоно уу."));
      }
    } finally {
      if (!options?.quiet) setNotificationLoading(false);
    }
  }

  async function markNotificationsRead(messageIds?: number[]) {
    if (!profile?.member_id) return;
    setNotificationLoading(true);
    setNotificationNotice("");

    try {
      const inbox = await cozyNotificationRequest<{ ok: boolean } & CozyNotificationInbox>("/read", {
        method: "POST",
        body: JSON.stringify({
          member_id: profile.member_id,
          all: !messageIds,
          message_ids: messageIds ?? [],
        }),
      });
      applyNotificationInbox(inbox);
    } catch (error) {
      setNotificationNotice(friendlyUserError(error, "Мэдэгдэл шинэчилж чадсангүй."));
    } finally {
      setNotificationLoading(false);
    }
  }

  async function toggleMarketingOptIn() {
    if (!profile?.member_id) return;
    const nextValue = !(profile.marketing_opt_in ?? true);
    setMarketingUpdating(true);
    setMessage("");

    try {
      const wallet = await cozyNotificationRequest<{ ok: boolean } & CozyUserWallet>("/settings", {
        method: "POST",
        body: JSON.stringify({
          member_id: profile.member_id,
          marketing_opt_in: nextValue,
        }),
      });
      const nextProfile = profileFromWallet(wallet);
      setProfile(nextProfile);
      setStamps(wallet.member.stamp_count);
      setCoupons(wallet.coupons ?? []);
      window.localStorage.setItem(PROFILE_KEY, JSON.stringify(nextProfile));
      setMessage(nextValue ? "Маркетинг мэдэгдэл идэвхжлээ." : "Маркетинг мэдэгдэл унтарлаа.");
      void refreshNotifications(profile.member_id, { quiet: true });
    } catch (error) {
      setMessage(friendlyUserError(error, "Тохиргоо хадгалж чадсангүй. Дахин оролдоно уу."));
    } finally {
      setMarketingUpdating(false);
    }
  }

  async function enablePhonePush() {
    if (!profile?.member_id) return;
    setPushUpdating(true);
    setMessage("");

    try {
      if (!pushSupported) {
        setMessage("Таны browser утасны notification дэмжихгүй байна.");
        return;
      }

      const permission = await Notification.requestPermission();
      setPushPermission(permission);
      if (permission !== "granted") {
        setMessage("Notification зөвшөөрөл өгөөгүй байна.");
        return;
      }

      const keyResponse = await cozyPushRequest<{ ok: boolean; public_key: string; configured: boolean }>("/public-key");
      if (!keyResponse.configured || !keyResponse.public_key) {
        setMessage("Push notification серверийн түлхүүр тохируулагдаагүй байна.");
        return;
      }

      const registration = await navigator.serviceWorker.register("/cozy-sw.js");
      const existing = await registration.pushManager.getSubscription();
      const subscription =
        existing ??
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(keyResponse.public_key),
        }));

      const result = await cozyPushRequest<{ ok: boolean; member: CozyUserProfile }>("/subscribe", {
        method: "POST",
        body: JSON.stringify({
          member_id: profile.member_id,
          subscription: subscription.toJSON(),
        }),
      });
      const nextProfile = { ...profile, push_enabled: result.member.push_enabled ?? true };
      setProfile(nextProfile);
      window.localStorage.setItem(PROFILE_KEY, JSON.stringify(nextProfile));
      setMessage("Утасны notification идэвхжлээ.");
    } catch (error) {
      setMessage(friendlyUserError(error, "Утасны notification идэвхжүүлж чадсангүй."));
    } finally {
      setPushUpdating(false);
    }
  }

  async function disablePhonePush() {
    if (!profile?.member_id) return;
    setPushUpdating(true);
    setMessage("");

    try {
      const registration = await navigator.serviceWorker.getRegistration("/cozy-sw.js");
      const subscription = await registration?.pushManager.getSubscription();
      await subscription?.unsubscribe();
      const result = await cozyPushRequest<{ ok: boolean; member: CozyUserProfile }>("/subscribe", {
        method: "POST",
        body: JSON.stringify({
          member_id: profile.member_id,
          enabled: false,
        }),
      });
      const nextProfile = { ...profile, push_enabled: result.member.push_enabled ?? false };
      setProfile(nextProfile);
      window.localStorage.setItem(PROFILE_KEY, JSON.stringify(nextProfile));
      setMessage("Утасны notification унтарлаа.");
    } catch (error) {
      setMessage(friendlyUserError(error, "Утасны notification унтрааж чадсангүй."));
    } finally {
      setPushUpdating(false);
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
          </div>

          <div className="auth-copy">
            <h1>{isRegister ? "Cozy Coffee-д бүртгүүлэх" : "Cozy Coffee-д нэвтрэх"}</h1>
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
              <div className="user-input password-input">
                <LockKeyhole size={18} aria-hidden="true" />
                <input
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="••••••••"
                  type={showPassword ? "text" : "password"}
                  autoComplete={isRegister ? "new-password" : "current-password"}
                />
                <button
                  className="password-eye-button"
                  type="button"
                  onClick={() => setShowPassword((current) => !current)}
                  aria-label={showPassword ? "Нууц үг нуух" : "Нууц үг харах"}
                >
                  {showPassword ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
                </button>
              </div>
            </label>

            {isRegister ? (
              <label>
                <span>Нууц үг давтах</span>
                <div className="user-input password-input">
                  <LockKeyhole size={18} aria-hidden="true" />
                  <input
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    placeholder="••••••••"
                    type={showConfirmPassword ? "text" : "password"}
                    autoComplete="new-password"
                  />
                  <button
                    className="password-eye-button"
                    type="button"
                    onClick={() => setShowConfirmPassword((current) => !current)}
                    aria-label={showConfirmPassword ? "Давтсан нууц үг нуух" : "Давтсан нууц үг харах"}
                  >
                    {showConfirmPassword ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
                  </button>
                </div>
              </label>
            ) : null}

            <button className="user-primary-button" type="submit" disabled={authLoading}>
              {authLoading ? "Мэдээлэл шалгаж байна" : isRegister ? "Бүртгүүлэх" : "Нэвтрэх"}
            </button>
          </form>

          {message ? <p className="user-message auth-message">{message}</p> : null}
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
              <div className="home-identity">
                <img src="/cozy-coffee-logo.jpg" alt="Cozy Coffee" />
                <p>
                  Сайн байна уу, <strong>{profile.name}</strong>
                </p>
              </div>
              <button
                className="round-icon-button notification-button"
                type="button"
                aria-label="Мэдэгдэл"
                onClick={() => {
                  setNotificationOpen(true);
                  void refreshNotifications(profile.member_id, { quiet: false });
                }}
              >
                <Bell size={19} aria-hidden="true" />
                {unreadCount > 0 ? <span className="notification-badge">{unreadCount > 9 ? "9+" : unreadCount}</span> : null}
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
              <div className="loyalty-guidance">
                <QrCode size={18} aria-hidden="true" />
                <div>
                  <strong>Кассын кодыг утсаараа уншуулна</strong>
                  <span>Худалдан авалтын дараа тамга автоматаар нэмэгдэнэ.</span>
                </div>
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
              <div className="user-message">Одоогоор идэвхтэй купон алга. 9 тамга цуглуулахад купон автоматаар нэмэгдэнэ.</div>
            ) : null}
            {activeCoupons.map((coupon) => (
              <article className="ticket-card featured" key={coupon.id}>
                <div className="ticket-side">
                  <Coffee size={34} aria-hidden="true" />
                  <strong>1 үнэгүй кофе</strong>
                </div>
                <div className="ticket-body">
                  <h2>{coupon.reward_product_name ?? "9 кофе авбал 1 үнэгүй кофе"}</h2>
                  <p>Код: {coupon.code}. Касс дээр купоноо уншуулж, гүйлгээний нууц үгээ хийнэ.</p>
                  <span>{coupon.expires_at ? `${coupon.expires_at.slice(0, 10)} хүртэл` : "Хугацаагүй"}</span>
                  <div className="coupon-scan-note">
                    <QrCode size={16} aria-hidden="true" />
                    <span>Касс дээр уншуулахад бэлэн</span>
                  </div>
                </div>
              </article>
            ))}
          </section>
        ) : null}

        {activeTab === "scan" ? (
          <section className="scan-screen">
            <article className="scan-card">
              <div className={scanActive ? "scan-camera-frame active" : "scan-camera-frame"}>
                <video ref={videoRef} muted playsInline aria-label="Кассын код унших камер" />
                {!scanActive ? (
                  <div className="scan-camera-idle">
                    <Camera size={64} strokeWidth={1.7} aria-hidden="true" />
                  </div>
                ) : null}
              </div>
              <div className="scan-copy">
                <strong>Кассын дэлгэц дээрх кодыг уншуулна</strong>
                <span>Худалдан авалтын дараа тамга таны карт дээр нэмэгдэнэ.</span>
              </div>
              <div className="scan-actions">
                <button className="user-primary-button" type="button" onClick={() => void startCashierScan()} disabled={scanActive}>
                  <Camera size={17} aria-hidden="true" />
                  Камер нээх
                </button>
                {scanActive ? (
                  <button className="user-secondary-button" type="button" onClick={stopCashierScan}>
                    Зогсоох
                  </button>
                ) : null}
              </div>
              <form className="manual-scan-form" onSubmit={handleManualScanSubmit}>
                <input value={manualScanCode} onChange={(event) => setManualScanCode(event.target.value)} placeholder="Код гараар оруулах" />
                <button type="submit">OK</button>
              </form>
              {scanCode ? <code className="scan-result">{scanCode}</code> : null}
              {scanNotice ? <p className="user-message scan-message">{scanNotice}</p> : null}
            </article>
          </section>
        ) : null}

        {activeTab === "profile" ? (
          <section className="profile-screen">
            <header className="profile-top">
              <span />
              <h1>Профайл</h1>
              <button className="round-icon-button" type="button" aria-label="Тохиргоо" onClick={() => handleProfileAction("settings")}>
                <Settings size={18} aria-hidden="true" />
              </button>
            </header>

            <button className="profile-card profile-card-button" type="button" onClick={() => handleProfileAction("info")}>
              <img src="/cozy-user-icon.png" alt="" />
              <div>
                <strong>{profile.name}</strong>
                <span>{profile.phone}</span>
              </div>
              <ChevronRight size={18} aria-hidden="true" />
            </button>

            <article className="profile-setting-card">
              <div>
                <strong>Маркетинг мэдэгдэл авах</strong>
                <span>Урамшуулал, купон болон тамганы сануулга.</span>
              </div>
              <button
                className={(profile.marketing_opt_in ?? true) ? "user-toggle active" : "user-toggle"}
                type="button"
                aria-pressed={profile.marketing_opt_in ?? true}
                onClick={() => void toggleMarketingOptIn()}
                disabled={marketingUpdating}
              >
                <span />
              </button>
            </article>

            <article className="profile-setting-card">
              <div>
                <strong>Утасны notification</strong>
                <span>
                  {pushSupported
                    ? profile.push_enabled
                      ? "Lock screen дээр мэдэгдэл ирнэ."
                      : "Allow өгөөд утсан дээрээ мэдэгдэл авна."
                    : "Энэ browser push notification дэмжихгүй байна."}
                </span>
              </div>
              <button
                className={profile.push_enabled ? "user-toggle active" : "user-toggle"}
                type="button"
                aria-pressed={Boolean(profile.push_enabled)}
                onClick={() => void (profile.push_enabled ? disablePhonePush() : enablePhonePush())}
                disabled={pushUpdating || !pushSupported || pushPermission === "denied"}
              >
                <span />
              </button>
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
                Картаа шинэчлэх
              </button>
            </article>

            <div className="profile-menu">
              {[
                ["coupons", "Миний купонууд", Ticket],
                ["orders", "Захиалгын түүх", Coffee],
                ["saved", "Хадгалсан бүтээгдэхүүн", Heart],
                ["info", "Миний мэдээлэл", User],
              ].map(([action, label, Icon]) => {
                const MenuIcon = Icon as typeof Ticket;
                const profileAction = action as "coupons" | "orders" | "saved" | "info";
                return (
                  <button key={action as string} type="button" onClick={() => handleProfileAction(profileAction)}>
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
            {message ? <p className="user-message profile-action-notice">{message}</p> : null}
          </section>
        ) : null}

        {notificationOpen ? (
          <div className="notification-sheet" role="dialog" aria-modal="true" aria-labelledby="notification-title">
            <div className="notification-panel">
              <header className="notification-header">
                <div>
                  <h2 id="notification-title">Мэдэгдэл</h2>
                  <span>{unreadCount > 0 ? `${unreadCount} шинэ мэдэгдэл` : "Шинэ мэдэгдэл алга"}</span>
                </div>
                <button className="round-icon-button" type="button" aria-label="Хаах" onClick={() => setNotificationOpen(false)}>
                  <X size={18} aria-hidden="true" />
                </button>
              </header>

              <div className="notification-actions">
                <button className="user-secondary-button compact" type="button" onClick={() => void refreshNotifications(undefined, { quiet: false })} disabled={notificationLoading}>
                  <RotateCcw size={15} aria-hidden="true" />
                  Шинэчлэх
                </button>
                <button
                  className="user-secondary-button compact"
                  type="button"
                  onClick={() => void markNotificationsRead()}
                  disabled={notificationLoading || unreadCount === 0}
                >
                  <CheckCheck size={15} aria-hidden="true" />
                  Бүгдийг уншсан
                </button>
              </div>

              <div className="notification-list">
                {notifications.length === 0 ? (
                  <div className="notification-empty">
                    <Bell size={28} aria-hidden="true" />
                    <strong>Одоогоор мэдэгдэл алга</strong>
                    <span>Урамшуулал болон купоны сануулга энд харагдана.</span>
                  </div>
                ) : null}

                {notifications.map((item) => {
                  const unread = item.status === "sent" && !item.read_at;
                  return (
                    <article className={unread ? "notification-item unread" : "notification-item"} key={item.id}>
                      {item.image ? <img src={`data:image/png;base64,${item.image}`} alt="" /> : null}
                      <div>
                        <div className="notification-item-top">
                          <strong>{item.title}</strong>
                          {unread ? <span>Шинэ</span> : null}
                        </div>
                        <p>{item.message}</p>
                        <footer>
                          <time>{formatNotificationTime(item.send_time)}</time>
                          {unread ? (
                            <button type="button" onClick={() => void markNotificationsRead([item.id])} disabled={notificationLoading}>
                              Уншсан
                            </button>
                          ) : null}
                        </footer>
                      </div>
                    </article>
                  );
                })}
              </div>

              {notificationNotice ? <p className="user-message notification-notice">{notificationNotice}</p> : null}
            </div>
          </div>
        ) : null}

        <nav className="user-bottom-nav" aria-label="User app menu">
          {[
            ["home", "Нүүр", Home],
            ["scan", "", QrCode],
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
