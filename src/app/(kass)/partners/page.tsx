"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { Building2, Mail, Phone, Plus, RefreshCcw, Save, Search, Users, X } from "lucide-react";
import { createPartner, getPartners, getReadableError } from "@/lib/kass/client-api";
import type { KassPartner, PartnerFormRequest } from "@/lib/kass/client-types";

const emptyPartnerForm = {
  name: "",
  phone: "",
  email: "",
  is_supplier: true,
  is_customer: false,
};

export default function PartnersPage() {
  const [partners, setPartners] = useState<KassPartner[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(emptyPartnerForm);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  async function loadPartners() {
    setLoading(true);
    setError(null);

    try {
      const response = await getPartners();
      setPartners(response.partners ?? []);
    } catch (loadError) {
      setError(getReadableError(loadError));
      setPartners([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadPartners();
  }, []);

  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return partners;

    return partners.filter((partner) =>
      `${partner.name} ${partner.phone ?? ""} ${partner.email ?? ""}`.toLowerCase().includes(normalizedQuery),
    );
  }, [partners, query]);

  const summary = useMemo(
    () => ({
      total: partners.length,
      suppliers: partners.filter((partner) => Number(partner.supplier_rank ?? 0) > 0).length,
      customers: partners.filter((partner) => Number(partner.customer_rank ?? 0) > 0).length,
    }),
    [partners],
  );

  function openCreateModal() {
    setForm(emptyPartnerForm);
    setFormError(null);
    setModalOpen(true);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = form.name.trim();

    if (!name) {
      setFormError("Харилцагчийн нэр оруулна уу.");
      return;
    }

    setSaving(true);
    setFormError(null);

    try {
      const body: PartnerFormRequest = {
        name,
        phone: form.phone.trim() || null,
        email: form.email.trim() || null,
        is_supplier: form.is_supplier,
        is_customer: form.is_customer,
      };
      const response = await createPartner(body);
      setPartners((current) => [response.partner, ...current]);
      setModalOpen(false);
      setForm(emptyPartnerForm);
      await loadPartners();
    } catch (saveError) {
      setFormError(getReadableError(saveError));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="page-stack" data-testid="partners-page">
      <section className="content-panel">
        <div className="panel-toolbar">
          <div>
            <p className="eyebrow">Odoo харилцагч</p>
            <div className="heading-line">
              <h2>Харилцагчийн жагсаалт</h2>
              {!loading ? <span className="soft-pill">{filtered.length} илэрц</span> : null}
            </div>
          </div>
          <div className="toolbar-actions">
            <button className="secondary-button" type="button" onClick={loadPartners} disabled={loading}>
              <RefreshCcw size={16} aria-hidden="true" />
              <span>{loading ? "Уншиж байна" : "Шинэчлэх"}</span>
            </button>
            <button className="primary-button" type="button" onClick={openCreateModal} data-testid="partner-create-button">
              <Plus size={16} aria-hidden="true" />
              <span>Харилцагч нэмэх</span>
            </button>
          </div>
        </div>

        <div className="report-kpi-grid partner-kpi-grid">
          <div className="metric strong-metric">
            <Users size={22} aria-hidden="true" />
            <span>Нийт харилцагч</span>
            <strong>{summary.total}</strong>
          </div>
          <div className="metric">
            <Building2 size={22} aria-hidden="true" />
            <span>Нийлүүлэгч</span>
            <strong>{summary.suppliers}</strong>
          </div>
          <div className="metric">
            <Users size={22} aria-hidden="true" />
            <span>Хэрэглэгч</span>
            <strong>{summary.customers}</strong>
          </div>
        </div>

        <label className="search-box list-search">
          <Search size={18} aria-hidden="true" />
          <input
            type="search"
            placeholder="Нэр, утас, имэйлээр хайх"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>

        {error ? (
          <div className="state-box error-state">
            <strong>Харилцагч татахад алдаа гарлаа</strong>
            <p>{error}</p>
          </div>
        ) : null}

        <div className="table-wrap">
          <table className="data-table partner-table">
            <thead>
              <tr>
                <th>Нэр</th>
                <th>Утас</th>
                <th>Имэйл</th>
                <th>Төрөл</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 6 }).map((_, index) => (
                  <tr key={index}>
                    <td colSpan={4}>
                      <div className="row-skeleton" />
                    </td>
                  </tr>
                ))
              ) : filtered.length > 0 ? (
                filtered.map((partner) => (
                  <tr key={partner.id}>
                    <td>
                      <strong>{partner.name}</strong>
                    </td>
                    <td>{partner.phone || "Утасгүй"}</td>
                    <td>{partner.email || "Имэйлгүй"}</td>
                    <td>
                      <div className="partner-tags">
                        {Number(partner.supplier_rank ?? 0) > 0 ? <span className="soft-pill">Нийлүүлэгч</span> : null}
                        {Number(partner.customer_rank ?? 0) > 0 ? <span className="soft-pill">Хэрэглэгч</span> : null}
                        {Number(partner.supplier_rank ?? 0) <= 0 && Number(partner.customer_rank ?? 0) <= 0 ? (
                          <span className="soft-pill">Ерөнхий</span>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={4}>Харилцагч олдсонгүй.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {modalOpen ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="partner-form-title">
          <form className="modal-card narrow-modal" onSubmit={handleSubmit} data-testid="partner-modal">
            <button
              className="icon-button modal-close"
              type="button"
              aria-label="Хаах"
              onClick={() => setModalOpen(false)}
              disabled={saving}
            >
              <X size={18} aria-hidden="true" />
            </button>
            <p className="eyebrow">Odoo харилцагч</p>
            <h2 id="partner-form-title">Харилцагч нэмэх</h2>

            <label className="field">
              <span>Нэр</span>
              <input
                value={form.name}
                onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                placeholder="Жишээ: Сүүний нийлүүлэгч"
                required
                data-testid="partner-name"
              />
            </label>

            <label className="field">
              <span>Утас</span>
              <div className="input-with-icon">
                <Phone size={16} aria-hidden="true" />
                <input
                  value={form.phone}
                  onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))}
                  placeholder="Заавал биш"
                />
              </div>
            </label>

            <label className="field">
              <span>Имэйл</span>
              <div className="input-with-icon">
                <Mail size={16} aria-hidden="true" />
                <input
                  type="email"
                  value={form.email}
                  onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
                  placeholder="Заавал биш"
                />
              </div>
            </label>

            <div className="form-grid two-columns">
              <label className="switch-field">
                <input
                  type="checkbox"
                  checked={form.is_supplier}
                  onChange={(event) => setForm((current) => ({ ...current, is_supplier: event.target.checked }))}
                />
                <span>Нийлүүлэгч</span>
              </label>
              <label className="switch-field">
                <input
                  type="checkbox"
                  checked={form.is_customer}
                  onChange={(event) => setForm((current) => ({ ...current, is_customer: event.target.checked }))}
                />
                <span>Хэрэглэгч</span>
              </label>
            </div>

            {formError ? <div className="form-error">{formError}</div> : null}

            <div className="modal-actions">
              <button className="secondary-button" type="button" onClick={() => setModalOpen(false)} disabled={saving}>
                Болих
              </button>
              <button className="primary-button" type="submit" disabled={saving}>
                <Save size={17} aria-hidden="true" />
                <span>{saving ? "Хадгалж байна" : "Хадгалах"}</span>
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}
