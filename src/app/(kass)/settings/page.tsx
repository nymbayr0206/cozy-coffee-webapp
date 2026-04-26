"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { CheckCircle2, Copy, Plus, RefreshCcw, ServerCog, Trash2, XCircle } from "lucide-react";
import {
  createProductUom,
  deleteProductUom,
  formatUnitName,
  getHealth,
  getProductUoms,
  getReadableError,
} from "@/lib/kass/client-api";
import type { KassHealthResponse, KassUom } from "@/lib/kass/client-types";

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
  const [uoms, setUoms] = useState<KassUom[]>([]);
  const [loading, setLoading] = useState(true);
  const [uomsLoading, setUomsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uomError, setUomError] = useState<string | null>(null);
  const [uomFormError, setUomFormError] = useState<string | null>(null);
  const [uomSaving, setUomSaving] = useState(false);
  const [deletingUomId, setDeletingUomId] = useState<number | null>(null);
  const [uomForm, setUomForm] = useState({
    name: "",
    category_id: "",
    uom_type: "reference" as "reference" | "bigger" | "smaller",
    factor_inv: "",
  });

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

  async function loadUoms() {
    setUomsLoading(true);
    setUomError(null);

    try {
      const response = await getProductUoms();
      setUoms(response.uoms ?? []);
    } catch (loadError) {
      setUomError(getReadableError(loadError));
      setUoms([]);
    } finally {
      setUomsLoading(false);
    }
  }

  useEffect(() => {
    loadHealth();
    loadUoms();
  }, []);

  const ok = Boolean(health?.ok || health?.status === "ok" || health?.odoo?.connected);
  const uomCategoryOptions = useMemo(() => {
    const categories = new Map<number, string>();
    uoms.forEach((uom) => {
      if (uom.category_id && uom.category_name) categories.set(uom.category_id, uom.category_name);
    });
    return Array.from(categories.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name, "mn"));
  }, [uoms]);
  const sortedUoms = useMemo(
    () =>
      uoms
        .slice()
        .sort((a, b) =>
          `${a.category_name ?? ""} ${a.display_name}`.localeCompare(
            `${b.category_name ?? ""} ${b.display_name}`,
            "mn",
          ),
        ),
    [uoms],
  );

  async function handleUomSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = uomForm.name.trim();
    const categoryId = Number(uomForm.category_id);
    const factorInv = uomForm.factor_inv.trim() ? Number(uomForm.factor_inv) : null;

    if (!name) {
      setUomFormError("Хэмжих нэгжийн нэр оруулна уу.");
      return;
    }

    if (!Number.isInteger(categoryId) || categoryId <= 0) {
      setUomFormError("Хэмжих нэгжийн ангилал сонгоно уу.");
      return;
    }

    if (factorInv !== null && (!Number.isFinite(factorInv) || factorInv <= 0)) {
      setUomFormError("Харьцаа 0-ээс их тоо байх ёстой.");
      return;
    }

    setUomSaving(true);
    setUomFormError(null);

    try {
      const response = await createProductUom({
        name,
        category_id: categoryId,
        uom_type: uomForm.uom_type,
        factor_inv: factorInv,
      });
      setUoms((current) => [...current, response.uom]);
      setUomForm({
        name: "",
        category_id: String(categoryId),
        uom_type: "reference",
        factor_inv: "",
      });
      await loadUoms();
    } catch (saveError) {
      setUomFormError(getReadableError(saveError));
    } finally {
      setUomSaving(false);
    }
  }

  async function handleUomDelete(uom: KassUom) {
    const ok = window.confirm(`${formatUnitName(uom.display_name)} хэмжих нэгжийг хасах уу?`);
    if (!ok) return;

    setDeletingUomId(uom.id);
    setUomError(null);

    try {
      await deleteProductUom(uom.id);
      setUoms((current) => current.filter((item) => item.id !== uom.id));
      await loadUoms();
    } catch (deleteError) {
      setUomError(getReadableError(deleteError));
    } finally {
      setDeletingUomId(null);
    }
  }

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

      <section className="content-panel">
        <div className="panel-toolbar">
          <div>
            <p className="eyebrow">Хэмжих нэгж</p>
            <div className="heading-line">
              <h2>Барааны хэмжих нэгж</h2>
              {!uomsLoading ? <span className="soft-pill">{uoms.length} нэгж</span> : null}
            </div>
          </div>
          <button className="secondary-button" type="button" onClick={loadUoms} disabled={uomsLoading}>
            <RefreshCcw size={16} aria-hidden="true" />
            <span>{uomsLoading ? "Уншиж байна" : "Шинэчлэх"}</span>
          </button>
        </div>

        {uomError ? (
          <div className="state-box error-state">
            <strong>Хэмжих нэгж татахад алдаа гарлаа</strong>
            <p>{uomError}</p>
          </div>
        ) : null}

        <form className="uom-form form-grid" onSubmit={handleUomSubmit}>
          <label className="field">
            <span>Нэгжийн нэр</span>
            <input
              value={uomForm.name}
              onChange={(event) => setUomForm((current) => ({ ...current, name: event.target.value }))}
              placeholder="Жишээ: кг, гр, мл"
            />
          </label>

          <label className="field">
            <span>Ангилал</span>
            <select
              value={uomForm.category_id}
              onChange={(event) => setUomForm((current) => ({ ...current, category_id: event.target.value }))}
              disabled={uomsLoading || uomCategoryOptions.length === 0}
            >
              <option value="">Ангилал сонгох</option>
              {uomCategoryOptions.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>Төрөл</span>
            <select
              value={uomForm.uom_type}
              onChange={(event) =>
                setUomForm((current) => ({
                  ...current,
                  uom_type: event.target.value as "reference" | "bigger" | "smaller",
                }))
              }
            >
              <option value="reference">Үндсэн нэгж</option>
              <option value="bigger">Үндсэн нэгжээс том</option>
              <option value="smaller">Үндсэн нэгжээс жижиг</option>
            </select>
          </label>

          <label className="field">
            <span>Харьцаа</span>
            <input
              type="number"
              min="0.000001"
              step="any"
              inputMode="decimal"
              value={uomForm.factor_inv}
              onChange={(event) => setUomForm((current) => ({ ...current, factor_inv: event.target.value }))}
              placeholder="Жишээ: 1000"
              disabled={uomForm.uom_type === "reference"}
            />
          </label>

          <button className="primary-button" type="submit" disabled={uomSaving || uomsLoading}>
            <Plus size={16} aria-hidden="true" />
            <span>{uomSaving ? "Нэмж байна" : "Хэмжих нэгж нэмэх"}</span>
          </button>
        </form>

        {uomFormError ? <div className="form-error">{uomFormError}</div> : null}

        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Хэмжих нэгж</th>
                <th>Ангилал</th>
                <th>Төрөл</th>
                <th>Үйлдэл</th>
              </tr>
            </thead>
            <tbody>
              {uomsLoading ? (
                Array.from({ length: 5 }).map((_, index) => (
                  <tr key={index}>
                    <td colSpan={4}>
                      <div className="row-skeleton" />
                    </td>
                  </tr>
                ))
              ) : sortedUoms.length > 0 ? (
                sortedUoms.map((uom) => (
                  <tr key={uom.id}>
                    <td>
                      <strong>{formatUnitName(uom.display_name)}</strong>
                      <small className="table-subtext">ID: {uom.id}</small>
                    </td>
                    <td>{uom.category_name || "Ангилалгүй"}</td>
                    <td>{uom.uom_type || "default"}</td>
                    <td>
                      <button
                        className="icon-button danger"
                        type="button"
                        onClick={() => handleUomDelete(uom)}
                        disabled={deletingUomId === uom.id}
                        aria-label="Хэмжих нэгж хасах"
                      >
                        <Trash2 size={16} aria-hidden="true" />
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={4}>Хэмжих нэгж олдсонгүй.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
