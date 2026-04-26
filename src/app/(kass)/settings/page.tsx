"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Copy, RefreshCcw, ServerCog, XCircle } from "lucide-react";
import { getHealth, getReadableError } from "@/lib/kass/client-api";
import type { KassHealthResponse } from "@/lib/kass/client-types";

function resolveOdooStatus(health: KassHealthResponse | null) {
  if (!health) return "Тодорхойгүй";
  if (health.odoo?.connected === true) return "Холбогдсон";
  if (health.odoo?.status) return health.odoo.status;
  if (health.connection?.odoo) return health.connection.odoo;
  if (health.status) return health.status;
  return "API ажиллаж байна";
}

export default function SettingsPage() {
  const [health, setHealth] = useState<KassHealthResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function loadHealth() {
    setLoading(true);
    setError(null);

    try {
      const response = await getHealth();
      setHealth(response);
    } catch (healthError) {
      setError(getReadableError(healthError));
      setHealth(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadHealth();
  }, []);

  const ok = Boolean(health?.ok || health?.status === "ok" || health?.odoo?.connected);

  return (
    <div className="page-stack">
      <section className="content-panel">
        <div className="panel-toolbar">
          <div>
            <p className="eyebrow">Тохиргоо</p>
            <h2>API ба Odoo холболт</h2>
          </div>
          <button className="secondary-button" type="button" onClick={loadHealth} disabled={loading}>
            <RefreshCcw size={16} aria-hidden="true" />
            <span>{loading ? "Шалгаж байна" : "Холболт шалгах"}</span>
          </button>
        </div>

        {error ? (
          <div className="state-box error-state">
            <strong>Холболт шалгахад алдаа гарлаа</strong>
            <p>{error}</p>
          </div>
        ) : null}

        <div className="settings-grid">
          <div className="settings-card">
            <div className={ok ? "settings-icon success" : "settings-icon warning"}>
              {ok ? <CheckCircle2 size={24} aria-hidden="true" /> : <XCircle size={24} aria-hidden="true" />}
            </div>
            <div>
              <span>API төлөв</span>
              <strong>{loading ? "Шалгаж байна" : ok ? "Хэвийн" : "Анхаарах"}</strong>
            </div>
          </div>

          <div className="settings-card">
            <div className="settings-icon">
              <ServerCog size={24} aria-hidden="true" />
            </div>
            <div>
              <span>Odoo холболт</span>
              <strong>{loading ? "Шалгаж байна" : resolveOdooStatus(health)}</strong>
            </div>
          </div>
        </div>

        <div className="env-note">
          <Copy size={18} aria-hidden="true" />
          <div>
            <strong>.env файл байхгүй бол</strong>
            <p>PowerShell дээр `Copy-Item .env.example .env` ажиллуулаад Odoo тохиргоогоо сервер талд хадгална.</p>
            <p>`NEXT_PUBLIC_ODOO_*` үүсгэхгүй. Хөтөч тал зөвхөн `/api/kass/*` API замыг дуудна.</p>
          </div>
        </div>

        {health?.odoo?.db ? (
          <div className="env-note">
            <ServerCog size={18} aria-hidden="true" />
            <div>
              <strong>Ашиглаж буй Odoo бааз</strong>
              <p>{health.odoo.db}</p>
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}
