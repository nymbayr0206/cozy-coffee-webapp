"use client";

import { FormEvent, useState } from "react";
import { LogIn, LockKeyhole, UserRound } from "lucide-react";

export interface LoginPayload {
  username: string;
  password: string;
}

interface LoginModalProps {
  open: boolean;
  loading?: boolean;
  error?: string | null;
  onLogin: (payload: LoginPayload) => Promise<void>;
}

export function LoginModal({ open, loading, error, onLogin }: LoginModalProps) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  if (!open) return null;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedUsername = username.trim();

    if (!trimmedUsername) {
      setLocalError("Odoo нэвтрэх нэр оруулна уу.");
      return;
    }

    if (!password) {
      setLocalError("Odoo нууц үг оруулна уу.");
      return;
    }

    setLocalError(null);
    await onLogin({
      username: trimmedUsername,
      password,
    });
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="login-title">
      <form className="modal-card session-modal" onSubmit={handleSubmit} data-testid="login-modal">
        <img className="session-logo" src="/cozy-coffee-logo.jpg" alt="Cozy Coffee" />
        <div>
          <p className="eyebrow">Odoo нэвтрэлт</p>
          <h2 id="login-title">Нэвтрэх</h2>
          <p className="muted-text">Эхлээд Odoo хэрэглэгчээр нэвтэрнэ. Нууц үг хөтөч дээр хадгалагдахгүй.</p>
        </div>

        <label className="field with-icon">
          <span>Нэвтрэх нэр</span>
          <div className="input-with-icon">
            <UserRound size={17} aria-hidden="true" />
            <input
              type="text"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              placeholder="Жишээ: admin"
              autoComplete="username"
            />
          </div>
        </label>

        <label className="field with-icon">
          <span>Нууц үг</span>
          <div className="input-with-icon">
            <LockKeyhole size={17} aria-hidden="true" />
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Odoo нууц үг"
              autoComplete="current-password"
            />
          </div>
        </label>

        {localError || error ? <div className="form-error">{localError || error}</div> : null}

        <button className="primary-button full-width" type="submit" disabled={loading}>
          <LogIn size={18} aria-hidden="true" />
          <span>{loading ? "Нэвтэрч байна" : "Нэвтрэх"}</span>
        </button>
      </form>
    </div>
  );
}
