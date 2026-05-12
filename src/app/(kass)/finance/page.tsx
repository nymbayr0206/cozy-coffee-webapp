"use client";

import { RefreshCcw, Save, TrendingDown, TrendingUp, X } from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  createFinanceSettlement,
  formatMoney,
  getFinanceSettlements,
  getKassSessions,
  getReadableError,
  getStockReceipts,
} from "@/lib/kass/client-api";
import type { FinanceSettlement, FinanceSettlementType, KassReport, KassStockReceipt } from "@/lib/kass/client-types";

interface BalanceRow {
  partnerName: string;
  total: number;
  paid: number;
  settled: number;
  credit: number;
  outstanding: number;
  count: number;
}

const emptySettlementForm = {
  partner_name: "",
  amount: "",
  note: "",
};

function formatDateTime(value?: string | null) {
  if (!value) return "Байхгүй";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("mn-MN", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function receiptCreditAmount(receipt: KassStockReceipt) {
  if (receipt.status === "returned") return 0;
  return Number(receipt.credit_amount ?? 0);
}

function receiptPaidAmount(receipt: KassStockReceipt) {
  if (receipt.status === "returned") return 0;
  if (receipt.paid_amount !== undefined) return Number(receipt.paid_amount ?? 0);
  return receipt.payment_method ? 0 : Number(receipt.total_cost ?? 0);
}

function settlementLabel(type: FinanceSettlementType) {
  return type === "payable" ? "Өглөг төлсөн" : "Авлага авсан";
}

function makeSettlementMap(settlements: FinanceSettlement[], type: FinanceSettlementType) {
  const byPartner = new Map<string, number>();

  settlements
    .filter((settlement) => settlement.type === type)
    .forEach((settlement) => {
      byPartner.set(settlement.partner_name, Number(byPartner.get(settlement.partner_name) ?? 0) + Number(settlement.amount ?? 0));
    });

  return byPartner;
}

function applySettlements(rows: BalanceRow[], settlements: Map<string, number>) {
  return rows
    .map((row) => {
      const settled = Number(settlements.get(row.partnerName) ?? 0);
      return {
        ...row,
        settled,
        outstanding: Math.max(0, row.credit - settled),
      };
    })
    .sort((a, b) => b.outstanding - a.outstanding || b.credit - a.credit);
}

export default function FinancePage() {
  const [receipts, setReceipts] = useState<KassStockReceipt[]>([]);
  const [sessions, setSessions] = useState<KassReport[]>([]);
  const [settlements, setSettlements] = useState<FinanceSettlement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [settlementType, setSettlementType] = useState<FinanceSettlementType | null>(null);
  const [settlementForm, setSettlementForm] = useState(emptySettlementForm);
  const [settlementSaving, setSettlementSaving] = useState(false);
  const [settlementError, setSettlementError] = useState<string | null>(null);

  async function loadFinance() {
    setLoading(true);
    setError(null);

    try {
      const [receiptResponse, sessionResponse, settlementResponse] = await Promise.all([
        getStockReceipts({ status: "all" }),
        getKassSessions({ limit: 100 }),
        getFinanceSettlements(),
      ]);
      setReceipts(receiptResponse.receipts ?? []);
      setSessions(sessionResponse.sessions ?? []);
      setSettlements(settlementResponse.settlements ?? []);
    } catch (loadError) {
      setError(getReadableError(loadError));
      setReceipts([]);
      setSessions([]);
      setSettlements([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadFinance();
  }, []);

  const payableRows = useMemo(() => {
    const rows = receipts
      .map((receipt) => ({
        id: receipt.receipt_id,
        partnerName: receipt.partner_name || "Харилцагчгүй",
        label: receipt.product_name,
        createdAt: receipt.created_at,
        total: Number(receipt.total_cost ?? 0),
        paid: receiptPaidAmount(receipt),
        credit: receiptCreditAmount(receipt),
      }))
      .filter((row) => row.credit > 0);

    return rows.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [receipts]);

  const payableByPartner = useMemo(() => {
    const byPartner = new Map<string, BalanceRow>();

    payableRows.forEach((row) => {
      const current =
        byPartner.get(row.partnerName) ??
        {
          partnerName: row.partnerName,
          total: 0,
          paid: 0,
          settled: 0,
          credit: 0,
          outstanding: 0,
          count: 0,
        };
      current.total += row.total;
      current.paid += row.paid;
      current.credit += row.credit;
      current.count += 1;
      byPartner.set(row.partnerName, current);
    });

    return applySettlements(Array.from(byPartner.values()), makeSettlementMap(settlements, "payable"));
  }, [payableRows, settlements]);

  const receivableRows = useMemo(() => {
    return sessions
      .flatMap((session) =>
        (session.orders ?? []).map((order) => {
          const credit = (order.payment_parts ?? [])
            .filter((payment) => payment.method === "credit")
            .reduce((sum, payment) => sum + Number(payment.amount ?? 0), 0);

          return {
            id: String(order.receipt_number ?? order.order_id ?? `${session.session_id}-${order.created_at}`),
            label: order.receipt_number ?? `#${order.order_id ?? "Борлуулалт"}`,
            partnerName: order.partner_name || "Кассын харилцагч",
            createdAt: order.created_at ?? order.date ?? session.opened_at,
            total: Number(order.total ?? credit),
            credit,
          };
        }),
      )
      .filter((row) => row.credit > 0)
      .sort((a, b) => new Date(b.createdAt ?? "").getTime() - new Date(a.createdAt ?? "").getTime());
  }, [sessions]);

  const receivableByPartner = useMemo(() => {
    const byPartner = new Map<string, BalanceRow>();

    receivableRows.forEach((row) => {
      const current =
        byPartner.get(row.partnerName) ??
        {
          partnerName: row.partnerName,
          total: 0,
          paid: 0,
          settled: 0,
          credit: 0,
          outstanding: 0,
          count: 0,
        };
      current.total += row.total;
      current.credit += row.credit;
      current.count += 1;
      byPartner.set(row.partnerName, current);
    });

    return applySettlements(Array.from(byPartner.values()), makeSettlementMap(settlements, "receivable"));
  }, [receivableRows, settlements]);

  const activePayableByPartner = useMemo(
    () => payableByPartner.filter((row) => row.outstanding > 0),
    [payableByPartner],
  );

  const activeReceivableByPartner = useMemo(
    () => receivableByPartner.filter((row) => row.outstanding > 0),
    [receivableByPartner],
  );

  const totals = useMemo(
    () => ({
      payable: payableByPartner.reduce((sum, row) => sum + row.outstanding, 0),
      receivable: receivableByPartner.reduce((sum, row) => sum + row.outstanding, 0),
    }),
    [payableByPartner, receivableByPartner],
  );

  const settlementOptions = settlementType === "payable" ? activePayableByPartner : activeReceivableByPartner;
  const selectedBalance = settlementOptions.find((row) => row.partnerName === settlementForm.partner_name) ?? null;

  function openSettlementModal(type: FinanceSettlementType, row?: BalanceRow) {
    setSettlementType(type);
    setSettlementForm({
      partner_name: row?.partnerName ?? "",
      amount: row?.outstanding ? String(row.outstanding) : "",
      note: "",
    });
    setSettlementError(null);
  }

  function closeSettlementModal() {
    if (settlementSaving) return;
    setSettlementType(null);
    setSettlementForm(emptySettlementForm);
    setSettlementError(null);
  }

  async function handleSettlementSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!settlementType) return;

    const amount = Number(settlementForm.amount);

    if (!settlementForm.partner_name) {
      setSettlementError("Харилцагч сонгоно уу.");
      return;
    }

    if (!Number.isFinite(amount) || amount <= 0) {
      setSettlementError("Дүн 0-ээс их байх ёстой.");
      return;
    }

    if (selectedBalance && amount - selectedBalance.outstanding > 0.01) {
      setSettlementError("Төлөх/авах дүн үлдэгдлээс их байна.");
      return;
    }

    setSettlementSaving(true);
    setSettlementError(null);

    try {
      const response = await createFinanceSettlement({
        type: settlementType,
        partner_name: settlementForm.partner_name,
        amount,
        note: settlementForm.note.trim() || null,
      });
      setSettlements((current) => [response.settlement, ...current]);
      closeSettlementModal();
    } catch (saveError) {
      setSettlementError(getReadableError(saveError));
    } finally {
      setSettlementSaving(false);
    }
  }

  return (
    <div className="page-stack" data-testid="finance-page">
      <section className="content-panel">
        <div className="panel-toolbar">
          <div>
            <p className="eyebrow">Санхүү</p>
            <h2>Өглөг / Авлага</h2>
            <p className="muted-text small">Агуулахын зээлээр авсан орлого болон кассын зээлээр хийсэн борлуулалтыг нэгтгэнэ.</p>
          </div>
          <div className="toolbar-actions">
            <button className="secondary-button" type="button" onClick={() => openSettlementModal("payable")}>
              <TrendingDown size={16} aria-hidden="true" />
              <span>Өглөг төлөх</span>
            </button>
            <button className="secondary-button" type="button" onClick={() => openSettlementModal("receivable")}>
              <TrendingUp size={16} aria-hidden="true" />
              <span>Авлага авах</span>
            </button>
            <button className="secondary-button" type="button" onClick={loadFinance} disabled={loading}>
              <RefreshCcw size={16} aria-hidden="true" />
              <span>{loading ? "Уншиж байна" : "Шинэчлэх"}</span>
            </button>
          </div>
        </div>

        {error ? <div className="inline-error">{error}</div> : null}

        <div className="report-kpi-grid">
          <div className="metric strong-metric">
            <TrendingDown size={22} aria-hidden="true" />
            <span>Өглөгийн үлдэгдэл</span>
            <strong>{formatMoney(totals.payable)}</strong>
          </div>
          <div className="metric">
            <TrendingUp size={22} aria-hidden="true" />
            <span>Авлагын үлдэгдэл</span>
            <strong>{formatMoney(totals.receivable)}</strong>
          </div>
        </div>
      </section>

      <section className="dashboard-layout lower finance-balance-layout">
        <div className="content-panel">
          <div className="panel-toolbar">
            <div>
              <p className="eyebrow">Өглөг</p>
              <h2>Харилцагчаар</h2>
            </div>
            <span className="soft-pill">{activePayableByPartner.length} мөр</span>
          </div>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Харилцагч</th>
                  <th>Нийт орлого</th>
                  <th>Бэлэн</th>
                  <th>Төлсөн</th>
                  <th>Үлдэгдэл</th>
                  <th>Үйлдэл</th>
                </tr>
              </thead>
              <tbody>
                {activePayableByPartner.length > 0 ? (
                  activePayableByPartner.map((row) => (
                    <tr key={row.partnerName}>
                      <td><strong>{row.partnerName}</strong></td>
                      <td>{formatMoney(row.total)}</td>
                      <td>{formatMoney(row.paid)}</td>
                      <td>{formatMoney(row.settled)}</td>
                      <td>{formatMoney(row.outstanding)}</td>
                      <td>
                        <button
                          className="secondary-button compact-button"
                          type="button"
                          onClick={() => openSettlementModal("payable", row)}
                          disabled={row.outstanding <= 0}
                        >
                          Төлөх
                        </button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6}>{loading ? "Санхүүгийн мэдээлэл уншиж байна." : "Идэвхтэй өглөг алга байна."}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="content-panel">
          <div className="panel-toolbar">
            <div>
              <p className="eyebrow">Авлага</p>
              <h2>Зээлээр борлуулалт</h2>
            </div>
            <span className="soft-pill">{activeReceivableByPartner.length} мөр</span>
          </div>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Харилцагч</th>
                  <th>Нийт</th>
                  <th>Авсан</th>
                  <th>Үлдэгдэл</th>
                  <th>Тоо</th>
                  <th>Үйлдэл</th>
                </tr>
              </thead>
              <tbody>
                {activeReceivableByPartner.length > 0 ? (
                  activeReceivableByPartner.map((row) => (
                    <tr key={row.partnerName}>
                      <td><strong>{row.partnerName}</strong></td>
                      <td>{formatMoney(row.total)}</td>
                      <td>{formatMoney(row.settled)}</td>
                      <td>{formatMoney(row.outstanding)}</td>
                      <td>{row.count}</td>
                      <td>
                        <button
                          className="secondary-button compact-button"
                          type="button"
                          onClick={() => openSettlementModal("receivable", row)}
                          disabled={row.outstanding <= 0}
                        >
                          Авлага авах
                        </button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6}>{loading ? "Санхүүгийн мэдээлэл уншиж байна." : "Идэвхтэй авлага алга байна."}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="content-panel">
        <div className="panel-toolbar">
          <div>
            <p className="eyebrow">Төлөлт</p>
            <h2>Өглөг / авлагын төлөлтийн түүх</h2>
          </div>
          <span className="soft-pill">{settlements.length} мөр</span>
        </div>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Огноо</th>
                <th>Төрөл</th>
                <th>Харилцагч</th>
                <th>Дүн</th>
                <th>Тэмдэглэл</th>
              </tr>
            </thead>
            <tbody>
              {settlements.length > 0 ? (
                settlements.map((settlement) => (
                  <tr key={settlement.settlement_id}>
                    <td>{formatDateTime(settlement.created_at)}</td>
                    <td>{settlementLabel(settlement.type)}</td>
                    <td><strong>{settlement.partner_name}</strong></td>
                    <td>{formatMoney(settlement.amount)}</td>
                    <td>{settlement.note || "Тэмдэглэлгүй"}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5}>{loading ? "Санхүүгийн мэдээлэл уншиж байна." : "Төлөлтийн бүртгэл алга байна."}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="content-panel">
        <div className="panel-toolbar">
          <div>
            <p className="eyebrow">Дэлгэрэнгүй</p>
            <h2>Өглөг үүсгэсэн орлогууд</h2>
          </div>
          <span className="soft-pill">{payableRows.length} мөр</span>
        </div>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Огноо</th>
                <th>Бараа</th>
                <th>Харилцагч</th>
                <th>Нийт</th>
                <th>Бэлэн</th>
                <th>Өглөг</th>
              </tr>
            </thead>
            <tbody>
              {payableRows.length > 0 ? (
                payableRows.map((row) => (
                  <tr key={row.id}>
                    <td>{formatDateTime(row.createdAt)}</td>
                    <td><strong>{row.label}</strong></td>
                    <td>{row.partnerName}</td>
                    <td>{formatMoney(row.total)}</td>
                    <td>{formatMoney(row.paid)}</td>
                    <td>{formatMoney(row.credit)}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6}>{loading ? "Санхүүгийн мэдээлэл уншиж байна." : "Өглөгтэй орлого алга байна."}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {settlementType ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="settlement-title">
          <form className="modal-card narrow-modal" onSubmit={handleSettlementSubmit}>
            <button className="icon-button modal-close" type="button" onClick={closeSettlementModal} aria-label="Хаах">
              <X size={18} aria-hidden="true" />
            </button>
            <p className="eyebrow">{settlementType === "payable" ? "Өглөг" : "Авлага"}</p>
            <h2 id="settlement-title">{settlementType === "payable" ? "Өглөг төлөх" : "Авлага авах"}</h2>

            <label className="field">
              <span>Харилцагч</span>
              <select
                value={settlementForm.partner_name}
                onChange={(event) =>
                  setSettlementForm((current) => ({
                    ...current,
                    partner_name: event.target.value,
                    amount: settlementOptions.find((row) => row.partnerName === event.target.value)?.outstanding
                      ? String(settlementOptions.find((row) => row.partnerName === event.target.value)?.outstanding)
                      : current.amount,
                  }))
                }
              >
                <option value="">Сонгох</option>
                {settlementOptions
                  .filter((row) => row.outstanding > 0)
                  .map((row) => (
                    <option key={row.partnerName} value={row.partnerName}>
                      {row.partnerName} - {formatMoney(row.outstanding)}
                    </option>
                  ))}
              </select>
            </label>

            <label className="field">
              <span>Дүн</span>
              <input
                type="number"
                min="0.01"
                step="any"
                inputMode="decimal"
                value={settlementForm.amount}
                onChange={(event) => setSettlementForm((current) => ({ ...current, amount: event.target.value }))}
                placeholder="0"
              />
            </label>

            {selectedBalance ? (
              <div className="stock-cost-preview">
                <span>Үлдэгдэл</span>
                <strong>{formatMoney(selectedBalance.outstanding)}</strong>
              </div>
            ) : null}

            <label className="field">
              <span>Тэмдэглэл</span>
              <textarea
                value={settlementForm.note}
                onChange={(event) => setSettlementForm((current) => ({ ...current, note: event.target.value }))}
                placeholder={settlementType === "payable" ? "Жишээ: нийлүүлэгчид бэлнээр төлсөн" : "Жишээ: авлага бэлнээр авсан"}
              />
            </label>

            {settlementError ? <div className="form-error">{settlementError}</div> : null}

            <div className="modal-actions">
              <button className="secondary-button" type="button" onClick={closeSettlementModal} disabled={settlementSaving}>
                Болих
              </button>
              <button className="primary-button" type="submit" disabled={settlementSaving}>
                <Save size={17} aria-hidden="true" />
                <span>{settlementSaving ? "Хадгалж байна" : "Хадгалах"}</span>
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}
