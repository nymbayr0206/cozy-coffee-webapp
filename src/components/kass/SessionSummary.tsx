"use client";

import { DoorOpen, Square } from "lucide-react";

interface SessionSummaryProps {
  cashierName: string | null;
  sessionId: string | null;
  openedAt?: string | null;
  error?: string | null;
  compact?: boolean;
  loggedIn?: boolean;
  onOpenShift?: () => void;
  onCloseShift?: () => void;
}

export function SessionSummary({
  cashierName,
  sessionId,
  openedAt,
  error,
  compact,
  loggedIn,
  onOpenShift,
  onCloseShift,
}: SessionSummaryProps) {
  const displayName = cashierName || "Хэрэглэгч сонгоогүй";
  const openedLabel = openedAt
    ? new Intl.DateTimeFormat("mn-MN", {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(openedAt))
    : null;

  return (
    <section className={compact ? "session-summary compact shift-control-card" : "session-summary shift-control-card"}>
      <div className="section-heading-row">
        <div>
          <p className="eyebrow">Ээлж</p>
          <h2>{displayName}</h2>
        </div>
        <span className={sessionId ? "status-pill success" : loggedIn ? "status-pill warning" : "status-pill muted"}>
          {sessionId ? "Нээлттэй" : loggedIn ? "Нээх хэрэгтэй" : "Нэвтрээгүй"}
        </span>
      </div>

      {sessionId ? (
        <p className="muted-text small">
          Нээсэн: {displayName}
          {openedLabel ? ` · ${openedLabel}` : ""} · {sessionId.slice(-8)}
        </p>
      ) : (
        <p className="muted-text small">
          {loggedIn ? "Касс дээр борлуулалт хийхийн өмнө ээлж нээнэ үү." : "Эхлээд Odoo хэрэглэгчээр нэвтэрнэ үү."}
        </p>
      )}

      {error ? <div className="inline-error">{error}</div> : null}

      <div className="summary-actions shift-actions-only">
        {!sessionId && loggedIn ? (
          <button className="primary-button" type="button" onClick={onOpenShift} data-testid="summary-open-shift">
            <DoorOpen size={16} aria-hidden="true" />
            <span>Ээлж нээх</span>
          </button>
        ) : null}
        {sessionId && loggedIn ? (
          <button className="danger-button" type="button" onClick={onCloseShift} data-testid="summary-close-shift">
            <Square size={15} aria-hidden="true" />
            <span>Ээлж хаах</span>
          </button>
        ) : null}
        {!loggedIn ? (
          <div className="mini-note">
            <span>Нэвтэрсний дараа ээлж нээх боломжтой.</span>
          </div>
        ) : null}
      </div>
    </section>
  );
}
