"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  Building2,
  CreditCard,
  Edit3,
  Mail,
  Phone,
  Plus,
  RefreshCcw,
  Save,
  Search,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { createPartner, deletePartner, getPartners, getReadableError, updatePartner } from "@/lib/kass/client-api";
import type { KassPartner, PartnerFormRequest } from "@/lib/kass/client-types";

interface PartnerFormState {
  name: string;
  phone: string;
  email: string;
  company_register: string;
  bank_account: string;
  is_supplier: boolean;
  is_customer: boolean;
}

const emptyPartnerForm: PartnerFormState = {
  name: "",
  phone: "",
  email: "",
  company_register: "",
  bank_account: "",
  is_supplier: true,
  is_customer: false,
};

function partnerToForm(partner: KassPartner): PartnerFormState {
  return {
    name: partner.name ?? "",
    phone: partner.phone ?? "",
    email: partner.email ?? "",
    company_register: partner.company_register ?? "",
    bank_account: partner.bank_account ?? "",
    is_supplier: Number(partner.supplier_rank ?? 0) > 0,
    is_customer: Number(partner.customer_rank ?? 0) > 0,
  };
}

function partnerTypeLabel(partner: KassPartner) {
  const isSupplier = Number(partner.supplier_rank ?? 0) > 0;
  const isCustomer = Number(partner.customer_rank ?? 0) > 0;

  if (isSupplier && isCustomer) return "Нийлүүлэгч, хэрэглэгч";
  if (isSupplier) return "Нийлүүлэгч";
  if (isCustomer) return "Хэрэглэгч";
  return "Ерөнхий";
}

export default function PartnersPage() {
  const [partners, setPartners] = useState<KassPartner[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingPartner, setEditingPartner] = useState<KassPartner | null>(null);
  const [form, setForm] = useState<PartnerFormState>(emptyPartnerForm);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
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
      [
        partner.name,
        partner.phone,
        partner.email,
        partner.company_register,
        partner.bank_account,
        partnerTypeLabel(partner),
      ]
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery),
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
    setEditingPartner(null);
    setForm(emptyPartnerForm);
    setFormError(null);
    setModalOpen(true);
  }

  function openEditModal(partner: KassPartner) {
    setEditingPartner(partner);
    setForm(partnerToForm(partner));
    setFormError(null);
    setModalOpen(true);
  }

  function resetModal() {
    setModalOpen(false);
    setEditingPartner(null);
    setForm(emptyPartnerForm);
    setFormError(null);
  }

  function closeModal() {
    if (saving) return;
    resetModal();
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
        company_register: form.company_register.trim() || null,
        bank_account: form.bank_account.trim() || null,
        is_supplier: form.is_supplier,
        is_customer: form.is_customer,
      };
      const response = editingPartner
        ? await updatePartner(editingPartner.id, body)
        : await createPartner(body);

      setPartners((current) => {
        if (editingPartner) {
          return current.map((partner) => (partner.id === response.partner.id ? response.partner : partner));
        }

        return [response.partner, ...current];
      });
      resetModal();
      await loadPartners();
    } catch (saveError) {
      setFormError(getReadableError(saveError));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(partner: KassPartner) {
    const confirmed = window.confirm(`${partner.name} харилцагчийг устгах уу?`);
    if (!confirmed) return;

    setDeletingId(partner.id);
    setError(null);

    try {
      await deletePartner(partner.id);
      setPartners((current) => current.filter((item) => item.id !== partner.id));
      await loadPartners();
    } catch (deleteError) {
      setError(getReadableError(deleteError));
    } finally {
      setDeletingId(null);
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
            placeholder="Нэр, утас, имэйл, регистр, дансаар хайх"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>

        {error ? (
          <div className="state-box error-state">
            <strong>Харилцагчийн үйлдэл амжилтгүй боллоо</strong>
            <p>{error}</p>
          </div>
        ) : null}

        <div className="table-wrap partner-table-wrap">
          <table className="data-table partner-table">
            <thead>
              <tr>
                <th>Нэр</th>
                <th>Утас</th>
                <th>Имэйл</th>
                <th>Регистр</th>
                <th>Данс</th>
                <th>Төрөл</th>
                <th>Үйлдэл</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 6 }).map((_, index) => (
                  <tr key={index}>
                    <td colSpan={7}>
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
                    <td>{partner.company_register || "Регистргүй"}</td>
                    <td>{partner.bank_account || "Дансгүй"}</td>
                    <td>
                      <div className="partner-tags">
                        {Number(partner.supplier_rank ?? 0) > 0 ? <span className="soft-pill">Нийлүүлэгч</span> : null}
                        {Number(partner.customer_rank ?? 0) > 0 ? <span className="soft-pill">Хэрэглэгч</span> : null}
                        {Number(partner.supplier_rank ?? 0) <= 0 && Number(partner.customer_rank ?? 0) <= 0 ? (
                          <span className="soft-pill">Ерөнхий</span>
                        ) : null}
                      </div>
                    </td>
                    <td>
                      <div className="table-actions partner-actions">
                        <button
                          className="icon-button"
                          type="button"
                          aria-label={`${partner.name} засах`}
                          title="Засах"
                          onClick={() => openEditModal(partner)}
                          data-testid="partner-edit-button"
                        >
                          <Edit3 size={16} aria-hidden="true" />
                        </button>
                        <button
                          className="icon-button danger"
                          type="button"
                          aria-label={`${partner.name} устгах`}
                          title="Устгах"
                          onClick={() => void handleDelete(partner)}
                          disabled={deletingId === partner.id}
                          data-testid="partner-delete-button"
                        >
                          <Trash2 size={16} aria-hidden="true" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7}>Харилцагч олдсонгүй.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="partner-card-list">
          {loading ? (
            Array.from({ length: 4 }).map((_, index) => <div className="row-skeleton" key={index} />)
          ) : filtered.length > 0 ? (
            filtered.map((partner) => (
              <article className="partner-card" key={partner.id}>
                <div>
                  <strong>{partner.name}</strong>
                  <span>{partnerTypeLabel(partner)}</span>
                </div>
                <div className="partner-card-meta">
                  <span>Утас: {partner.phone || "Утасгүй"}</span>
                  <span>Имэйл: {partner.email || "Имэйлгүй"}</span>
                  <span>Регистр: {partner.company_register || "Регистргүй"}</span>
                  <span>Данс: {partner.bank_account || "Дансгүй"}</span>
                </div>
                <div className="partner-card-actions">
                  <button className="secondary-button" type="button" onClick={() => openEditModal(partner)}>
                    <Edit3 size={16} aria-hidden="true" />
                    <span>Засах</span>
                  </button>
                  <button
                    className="danger-button"
                    type="button"
                    onClick={() => void handleDelete(partner)}
                    disabled={deletingId === partner.id}
                  >
                    <Trash2 size={16} aria-hidden="true" />
                    <span>Устгах</span>
                  </button>
                </div>
              </article>
            ))
          ) : (
            <div className="compact-empty">Харилцагч олдсонгүй.</div>
          )}
        </div>
      </section>

      {modalOpen ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="partner-form-title">
          <form className="modal-card partner-modal-card" onSubmit={handleSubmit} data-testid="partner-modal">
            <button
              className="icon-button modal-close"
              type="button"
              aria-label="Хаах"
              onClick={closeModal}
              disabled={saving}
            >
              <X size={18} aria-hidden="true" />
            </button>
            <p className="eyebrow">Odoo харилцагч</p>
            <h2 id="partner-form-title">{editingPartner ? "Харилцагч засах" : "Харилцагч нэмэх"}</h2>

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

            <div className="form-grid two-columns">
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
            </div>

            <div className="form-grid two-columns">
              <label className="field">
                <span>Байгууллагын регистр</span>
                <div className="input-with-icon">
                  <Building2 size={16} aria-hidden="true" />
                  <input
                    value={form.company_register}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, company_register: event.target.value }))
                    }
                    placeholder="Жишээ: 1234567"
                    data-testid="partner-register"
                  />
                </div>
              </label>

              <label className="field">
                <span>Дансны дугаар</span>
                <div className="input-with-icon">
                  <CreditCard size={16} aria-hidden="true" />
                  <input
                    value={form.bank_account}
                    onChange={(event) => setForm((current) => ({ ...current, bank_account: event.target.value }))}
                    placeholder="Жишээ: MN123... эсвэл 5000..."
                    data-testid="partner-bank-account"
                  />
                </div>
              </label>
            </div>

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
              <button className="secondary-button" type="button" onClick={closeModal} disabled={saving}>
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
