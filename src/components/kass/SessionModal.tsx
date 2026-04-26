"use client";

import { FormEvent, useState } from "react";
import { DoorOpen, UserRound, WalletCards, X } from "lucide-react";
import { formatMoney } from "@/lib/kass/client-api";

export interface OpenSessionPayload {
  openingCash: number;
}

interface SessionModalProps {
  open: boolean;
  cashierName: string | null;
  loading?: boolean;
  error?: string | null;
  onOpenSession: (payload: OpenSessionPayload) => Promise<void>;
  onCancel: () => void;
}

export function SessionModal({ open, cashierName, loading, error, onOpenSession, onCancel }: SessionModalProps) {
  const [openingCash, setOpeningCash] = useState("0");
  const [localError, setLocalError] = useState<string | null>(null);

  if (!open) return null;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cash = Number(openingCash);

    if (!Number.isFinite(cash) || cash < 0) {
      setLocalError("Нээлтийн бэлэн мөнгө 0 эсвэл түүнээс их байх ёстой.");
      return;
    }

    setLocalError(null);
    await onOpenSession({ openingCash: cash });
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="session-title">
      <form className="modal-card session-modal" onSubmit={handleSubmit} data-testid="session-modal">
        <button
          className="icon-button modal-close"
          type="button"
          aria-label="Хаах"
          onClick={onCancel}
          disabled={loading}
          data-testid="session-modal-close"
        >
          <X size={18} aria-hidden="true" />
        </button>

        <img className="session-logo" src="/cozy-coffee-logo.jpg" alt="Cozy Coffee" />
        <div>
          <p className="eyebrow">Кассын ээлж</p>
          <h2 id="session-title">Ээлж нээх</h2>
          <p className="muted-text">Нэвтэрсэн хэрэглэгчээр кассын ээлж нээнэ.</p>
        </div>

        <div className="metric session-user-card">
          <span>Нэвтэрсэн хэрэглэгч</span>
          <strong>
            <UserRound size={17} aria-hidden="true" />
            {cashierName || "Хэрэглэгч тодорхойгүй"}
          </strong>
        </div>

        <label className="field">
          <span>Нээлтийн бэлэн мөнгө</span>
          <input
            type="number"
            min="0"
            inputMode="numeric"
            value={openingCash}
            onChange={(event) => setOpeningCash(event.target.value)}
          />
        </label>

        <div className="change-box">
          <span>Эхлэх касс</span>
          <strong>{formatMoney(Number(openingCash || 0))}</strong>
        </div>

        {localError || error ? <div className="form-error">{localError || error}</div> : null}

        <div className="modal-actions">
          <button
            className="secondary-button"
            type="button"
            onClick={onCancel}
            disabled={loading}
            data-testid="session-modal-cancel"
          >
            <span>Болих</span>
          </button>
          <button className="primary-button" type="submit" disabled={loading}>
            <DoorOpen size={18} aria-hidden="true" />
            <span>{loading ? "Ээлж нээж байна" : "Ээлж нээх"}</span>
          </button>
        </div>

        <div className="mini-note">
          <WalletCards size={16} aria-hidden="true" />
          <span>Ээлж нээгдсэний дараа POS checkout идэвхжинэ.</span>
        </div>
      </form>
    </div>
  );
}
