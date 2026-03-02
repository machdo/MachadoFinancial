import { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";
import { API_BASE, authHeaders, dateLabel, money, monthKeyLabel } from "../lib/finance";

function parseMoney(raw) {
  const value = Number(String(raw ?? "").replace(/\s/g, "").replace(/\./g, "").replace(",", "."));
  return Number.isFinite(value) ? value : NaN;
}

function parseIntSafe(raw) {
  const value = Number(raw);
  return Number.isInteger(value) ? value : NaN;
}

const EMPTY_SUMMARY = {
  cardsCount: 0,
  totalLimit: 0,
  usedLimit: 0,
  availableLimit: 0,
  openInvoiceCount: 0,
};

const EMPTY_INVOICE_SUMMARY = {
  totalAmount: 0,
  paidAmount: 0,
  outstandingAmount: 0,
};

export default function CreditCards() {
  const now = useMemo(() => new Date(), []);
  const [cards, setCards] = useState([]);
  const [summary, setSummary] = useState(EMPTY_SUMMARY);
  const [selectedCardId, setSelectedCardId] = useState("");
  const [invoices, setInvoices] = useState([]);
  const [invoiceSummary, setInvoiceSummary] = useState(EMPTY_INVOICE_SUMMARY);

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [rowBusyId, setRowBusyId] = useState(null);
  const [simBusy, setSimBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [editingCardId, setEditingCardId] = useState(null);
  const [cardName, setCardName] = useState("");
  const [cardLimitRaw, setCardLimitRaw] = useState("");
  const [cardBestDayRaw, setCardBestDayRaw] = useState("10");
  const [cardClosingDayRaw, setCardClosingDayRaw] = useState("25");
  const [cardAutoInstallments, setCardAutoInstallments] = useState(true);

  const [invoiceYearRaw, setInvoiceYearRaw] = useState(String(now.getFullYear()));
  const [invoiceMonthRaw, setInvoiceMonthRaw] = useState(String(now.getMonth() + 1));
  const [invoiceTotalRaw, setInvoiceTotalRaw] = useState("");
  const [invoicePaidRaw, setInvoicePaidRaw] = useState("0");

  const [installmentTotalRaw, setInstallmentTotalRaw] = useState("");
  const [installmentCountRaw, setInstallmentCountRaw] = useState("2");
  const [installmentStartYearRaw, setInstallmentStartYearRaw] = useState(String(now.getFullYear()));
  const [installmentStartMonthRaw, setInstallmentStartMonthRaw] = useState(
    String(now.getMonth() + 1),
  );

  const [paymentInputs, setPaymentInputs] = useState({});
  const [simulationInvoiceId, setSimulationInvoiceId] = useState("");
  const [simulationAmountRaw, setSimulationAmountRaw] = useState("");
  const [simulation, setSimulation] = useState(null);

  const selectedCard = useMemo(
    () => cards.find((card) => String(card.id) === String(selectedCardId)) ?? null,
    [cards, selectedCardId],
  );

  const loadCards = useCallback(async () => {
    const response = await axios.get(`${API_BASE}/credit-cards`, { headers: authHeaders() });
    const items = response?.data?.items ?? [];
    setCards(items);
    setSummary(response?.data?.summary ?? EMPTY_SUMMARY);
    setSelectedCardId((current) => {
      if (current && items.some((card) => String(card.id) === String(current))) return String(current);
      return items[0]?.id ? String(items[0].id) : "";
    });
  }, []);

  const loadInvoices = useCallback(async (cardId) => {
    if (!cardId) {
      setInvoices([]);
      setInvoiceSummary(EMPTY_INVOICE_SUMMARY);
      return;
    }
    const response = await axios.get(`${API_BASE}/credit-cards/${cardId}/invoices?months=24`, {
      headers: authHeaders(),
    });
    setInvoices(response?.data?.items ?? []);
    setInvoiceSummary(response?.data?.summary ?? EMPTY_INVOICE_SUMMARY);
  }, []);

  useEffect(() => {
    let active = true;
    async function run() {
      setLoading(true);
      setError("");
      try {
        await loadCards();
      } catch (requestError) {
        if (active) setError(requestError?.response?.data?.error || "Falha ao carregar cartoes.");
      } finally {
        if (active) setLoading(false);
      }
    }
    run();
    return () => {
      active = false;
    };
  }, [loadCards]);

  useEffect(() => {
    let active = true;
    async function run() {
      if (!selectedCardId) return;
      try {
        await loadInvoices(selectedCardId);
      } catch (requestError) {
        if (active) setError(requestError?.response?.data?.error || "Falha ao carregar faturas.");
      }
    }
    run();
    return () => {
      active = false;
    };
  }, [loadInvoices, selectedCardId]);

  function resetCardForm() {
    setEditingCardId(null);
    setCardName("");
    setCardLimitRaw("");
    setCardBestDayRaw("10");
    setCardClosingDayRaw("25");
    setCardAutoInstallments(true);
  }

  function editCard(card) {
    setEditingCardId(card.id);
    setCardName(card.name ?? "");
    setCardLimitRaw(String(card.totalLimit ?? ""));
    setCardBestDayRaw(String(card.bestPurchaseDay ?? 10));
    setCardClosingDayRaw(String(card.closingDay ?? 25));
    setCardAutoInstallments(Boolean(card.autoInstallments));
    setError("");
    setSuccess("");
  }

  async function saveCard(event) {
    event.preventDefault();
    if (busy) return;

    const limit = parseMoney(cardLimitRaw);
    const bestDay = parseIntSafe(cardBestDayRaw);
    const closingDay = parseIntSafe(cardClosingDayRaw);

    if (!String(cardName).trim()) return setError("Informe o nome do cartao.");
    if (!Number.isFinite(limit) || limit <= 0) return setError("Limite total invalido.");
    if (!Number.isInteger(bestDay) || bestDay < 1 || bestDay > 31) return setError("Melhor dia invalido.");
    if (!Number.isInteger(closingDay) || closingDay < 1 || closingDay > 31) return setError("Fechamento invalido.");

    setBusy(true);
    setError("");
    setSuccess("");

    try {
      const payload = {
        name: String(cardName).trim(),
        totalLimit: limit,
        bestPurchaseDay: bestDay,
        closingDay,
        autoInstallments: cardAutoInstallments,
      };
      let response;
      if (editingCardId) {
        response = await axios.put(`${API_BASE}/credit-cards/${editingCardId}`, payload, {
          headers: authHeaders(),
        });
      } else {
        response = await axios.post(`${API_BASE}/credit-cards`, payload, {
          headers: authHeaders(),
        });
      }
      await loadCards();
      if (response?.data?.id) setSelectedCardId(String(response.data.id));
      resetCardForm();
      setSuccess("Cartao salvo com sucesso.");
    } catch (requestError) {
      setError(requestError?.response?.data?.error || "Falha ao salvar cartao.");
    } finally {
      setBusy(false);
    }
  }

  async function removeCard(cardId) {
    const confirmed = window.confirm("Excluir este cartao e as faturas vinculadas?");
    if (!confirmed) return;
    setRowBusyId(cardId);
    setError("");
    setSuccess("");
    try {
      await axios.delete(`${API_BASE}/credit-cards/${cardId}`, { headers: authHeaders() });
      await loadCards();
      if (editingCardId === cardId) resetCardForm();
      if (String(selectedCardId) === String(cardId)) setSelectedCardId("");
      setSuccess("Cartao excluido.");
    } catch (requestError) {
      setError(requestError?.response?.data?.error || "Falha ao excluir cartao.");
    } finally {
      setRowBusyId(null);
    }
  }

  async function saveInvoice(event) {
    event.preventDefault();
    if (!selectedCard || busy) return;

    const year = parseIntSafe(invoiceYearRaw);
    const month = parseIntSafe(invoiceMonthRaw);
    const total = parseMoney(invoiceTotalRaw);
    const paid = parseMoney(invoicePaidRaw);

    if (!Number.isInteger(year) || year < 2000 || year > 2100) return setError("Ano invalido.");
    if (!Number.isInteger(month) || month < 1 || month > 12) return setError("Mes invalido.");
    if (!Number.isFinite(total) || total < 0) return setError("Total da fatura invalido.");
    if (!Number.isFinite(paid) || paid < 0) return setError("Valor pago invalido.");
    if (paid > total) return setError("Valor pago nao pode ser maior que total.");

    setBusy(true);
    setError("");
    setSuccess("");

    try {
      await axios.post(
        `${API_BASE}/credit-cards/${selectedCard.id}/invoices`,
        { year, month, totalAmount: total, paidAmount: paid },
        { headers: authHeaders() },
      );
      setInvoiceTotalRaw("");
      setInvoicePaidRaw("0");
      await Promise.all([loadCards(), loadInvoices(selectedCard.id)]);
      setSuccess("Fatura salva.");
    } catch (requestError) {
      setError(requestError?.response?.data?.error || "Falha ao salvar fatura.");
    } finally {
      setBusy(false);
    }
  }

  async function payInvoice(invoiceId) {
    if (!selectedCard) return;
    const amount = parseMoney(paymentInputs[invoiceId]);
    if (!Number.isFinite(amount) || amount <= 0) return setError("Informe um valor positivo para pagamento.");

    setRowBusyId(invoiceId);
    setError("");
    setSuccess("");

    try {
      const response = await axios.put(
        `${API_BASE}/credit-cards/${selectedCard.id}/invoices/${invoiceId}/payment`,
        { amount },
        { headers: authHeaders() },
      );
      setPaymentInputs((previous) => ({ ...previous, [invoiceId]: "" }));
      await Promise.all([loadCards(), loadInvoices(selectedCard.id)]);
      setSuccess(`Pagamento aplicado: ${money(response?.data?.appliedAmount ?? amount)}.`);
    } catch (requestError) {
      setError(requestError?.response?.data?.error || "Falha ao registrar pagamento.");
    } finally {
      setRowBusyId(null);
    }
  }

  async function applyInstallments(event) {
    event.preventDefault();
    if (!selectedCard || busy) return;
    if (!selectedCard.autoInstallments) return setError("Ative o parcelamento automatico deste cartao.");

    const totalAmount = parseMoney(installmentTotalRaw);
    const installments = parseIntSafe(installmentCountRaw);
    const startYear = parseIntSafe(installmentStartYearRaw);
    const startMonth = parseIntSafe(installmentStartMonthRaw);

    if (!Number.isFinite(totalAmount) || totalAmount <= 0) return setError("Valor total do parcelamento invalido.");
    if (!Number.isInteger(installments) || installments < 2 || installments > 48) return setError("Parcelas devem estar entre 2 e 48.");
    if (!Number.isInteger(startYear) || startYear < 2000 || startYear > 2100) return setError("Ano inicial invalido.");
    if (!Number.isInteger(startMonth) || startMonth < 1 || startMonth > 12) return setError("Mes inicial invalido.");

    setBusy(true);
    setError("");
    setSuccess("");

    try {
      const response = await axios.post(
        `${API_BASE}/credit-cards/${selectedCard.id}/installments`,
        { totalAmount, installments, startYear, startMonth },
        { headers: authHeaders() },
      );
      setInstallmentTotalRaw("");
      setInstallmentCountRaw("2");
      await Promise.all([loadCards(), loadInvoices(selectedCard.id)]);
      setSuccess(`Parcelamento aplicado em ${response?.data?.installments ?? installments} faturas.`);
    } catch (requestError) {
      setError(requestError?.response?.data?.error || "Falha ao aplicar parcelamento.");
    } finally {
      setBusy(false);
    }
  }

  async function simulateImpact(event) {
    event.preventDefault();
    if (!selectedCard || simBusy) return;

    const payload = { cardId: selectedCard.id };
    if (simulationInvoiceId) payload.invoiceId = Number(simulationInvoiceId);
    if (String(simulationAmountRaw).trim()) {
      const paymentAmount = parseMoney(simulationAmountRaw);
      if (!Number.isFinite(paymentAmount) || paymentAmount < 0) return setError("Pagamento simulado invalido.");
      payload.paymentAmount = paymentAmount;
    }
    if (!payload.invoiceId && payload.paymentAmount === undefined) {
      return setError("Selecione uma fatura ou informe um pagamento para simular.");
    }

    setSimBusy(true);
    setError("");
    setSuccess("");
    try {
      const response = await axios.post(`${API_BASE}/credit-cards/simulate-impact`, payload, {
        headers: authHeaders(),
      });
      setSimulation(response?.data ?? null);
    } catch (requestError) {
      setSimulation(null);
      setError(requestError?.response?.data?.error || "Falha na simulacao.");
    } finally {
      setSimBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500 shadow-sm dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400">
        Carregando cartoes...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-4">
        <Metric title="Cartoes" value={String(summary.cardsCount)} />
        <Metric title="Limite total" value={money(summary.totalLimit)} />
        <Metric title="Limite usado" value={money(summary.usedLimit)} tone="amber" />
        <Metric title="Limite disponivel" value={money(summary.availableLimit)} tone="emerald" />
      </div>

      {(error || success) && (
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950">
          {error && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300">
              {error}
            </div>
          )}
          {success && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200">
              {success}
            </div>
          )}
        </section>
      )}

      <section className="grid gap-4 xl:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950">
          <div className="mb-3 text-sm font-semibold">
            {editingCardId ? "Editar cartao de credito" : "Cadastro de cartao de credito"}
          </div>
          <form className="grid gap-2 md:grid-cols-2" onSubmit={saveCard}>
            <input
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-600/30 dark:border-slate-800 dark:bg-slate-950 md:col-span-2"
              placeholder="Nome do cartao"
              value={cardName}
              onChange={(event) => setCardName(event.target.value)}
              disabled={busy}
            />
            <input
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-600/30 dark:border-slate-800 dark:bg-slate-950"
              placeholder="Limite total"
              inputMode="decimal"
              value={cardLimitRaw}
              onChange={(event) => setCardLimitRaw(event.target.value)}
              disabled={busy}
            />
            <input
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-600/30 dark:border-slate-800 dark:bg-slate-950"
              placeholder="Melhor dia de compra"
              type="number"
              min={1}
              max={31}
              value={cardBestDayRaw}
              onChange={(event) => setCardBestDayRaw(event.target.value)}
              disabled={busy}
            />
            <input
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-600/30 dark:border-slate-800 dark:bg-slate-950"
              placeholder="Data de fechamento"
              type="number"
              min={1}
              max={31}
              value={cardClosingDayRaw}
              onChange={(event) => setCardClosingDayRaw(event.target.value)}
              disabled={busy}
            />
            <label className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm dark:border-slate-800">
              <input
                type="checkbox"
                checked={cardAutoInstallments}
                onChange={(event) => setCardAutoInstallments(event.target.checked)}
                disabled={busy}
              />
              Parcelamento automatico
            </label>

            <div className="flex gap-2 md:col-span-2">
              <button
                type="submit"
                className="rounded-xl bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
                disabled={busy}
              >
                {editingCardId ? "Salvar" : "Cadastrar"}
              </button>
              {editingCardId && (
                <button
                  type="button"
                  onClick={resetCardForm}
                  className="rounded-xl border border-slate-200 px-3 py-2 text-sm hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-900"
                  disabled={busy}
                >
                  Cancelar
                </button>
              )}
            </div>
          </form>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950">
          <div className="mb-3 text-sm font-semibold">Cartoes cadastrados</div>
          <div className="space-y-2">
            {cards.map((card) => {
              const selected = String(card.id) === String(selectedCardId);
              const rowBusy = rowBusyId === card.id;
              return (
                <div
                  key={card.id}
                  className={[
                    "rounded-xl border px-3 py-3",
                    selected
                      ? "border-blue-300 bg-blue-50/60 dark:border-blue-900 dark:bg-blue-950/20"
                      : "border-slate-200 dark:border-slate-800",
                  ].join(" ")}
                >
                  <div className="text-sm font-semibold">{card.name}</div>
                  <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    Limite total {money(card.totalLimit)} | Disponivel {money(card.availableLimit)}
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    Melhor compra dia {card.bestPurchaseDay} | Fecha dia {card.closingDay} |{" "}
                    Parcelamento {card.autoInstallments ? "ativo" : "inativo"}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setSelectedCardId(String(card.id))}
                      className={[
                        "rounded-lg px-2 py-1 text-xs",
                        selected
                          ? "bg-blue-600 text-white"
                          : "border border-slate-200 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-900",
                      ].join(" ")}
                      disabled={rowBusy}
                    >
                      {selected ? "Selecionado" : "Selecionar"}
                    </button>
                    <button
                      type="button"
                      onClick={() => editCard(card)}
                      className="rounded-lg border border-slate-200 px-2 py-1 text-xs hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-900"
                      disabled={rowBusy}
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      onClick={() => removeCard(card.id)}
                      className="rounded-lg border border-rose-200 px-2 py-1 text-xs text-rose-700 hover:bg-rose-50 dark:border-rose-900 dark:text-rose-300 dark:hover:bg-rose-950/30"
                      disabled={rowBusy}
                    >
                      Excluir
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
          {cards.length === 0 && (
            <div className="py-6 text-center text-sm text-slate-500 dark:text-slate-400">
              Nenhum cartao cadastrado.
            </div>
          )}
        </div>
      </section>

      {!selectedCard && (
        <section className="rounded-2xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500 shadow-sm dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400">
          Selecione um cartao para controlar faturas e simulacoes.
        </section>
      )}

      {selectedCard && (
        <>
          <div className="grid gap-3 md:grid-cols-3">
            <Metric title="Total faturas" value={money(invoiceSummary.totalAmount)} />
            <Metric title="Valor pago" value={money(invoiceSummary.paidAmount)} tone="emerald" />
            <Metric title="Em aberto" value={money(invoiceSummary.outstandingAmount)} tone="amber" />
          </div>

          <section className="grid gap-4 xl:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950">
              <div className="mb-3 text-sm font-semibold">Controle de fatura</div>
              <form className="grid gap-2 md:grid-cols-2" onSubmit={saveInvoice}>
                <input
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-600/30 dark:border-slate-800 dark:bg-slate-950"
                  type="number"
                  min={2000}
                  max={2100}
                  placeholder="Ano"
                  value={invoiceYearRaw}
                  onChange={(event) => setInvoiceYearRaw(event.target.value)}
                  disabled={busy}
                />
                <input
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-600/30 dark:border-slate-800 dark:bg-slate-950"
                  type="number"
                  min={1}
                  max={12}
                  placeholder="Mes"
                  value={invoiceMonthRaw}
                  onChange={(event) => setInvoiceMonthRaw(event.target.value)}
                  disabled={busy}
                />
                <input
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-600/30 dark:border-slate-800 dark:bg-slate-950"
                  placeholder="Total da fatura"
                  inputMode="decimal"
                  value={invoiceTotalRaw}
                  onChange={(event) => setInvoiceTotalRaw(event.target.value)}
                  disabled={busy}
                />
                <input
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-600/30 dark:border-slate-800 dark:bg-slate-950"
                  placeholder="Valor pago"
                  inputMode="decimal"
                  value={invoicePaidRaw}
                  onChange={(event) => setInvoicePaidRaw(event.target.value)}
                  disabled={busy}
                />
                <button
                  type="submit"
                  className="rounded-xl bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60 md:col-span-2"
                  disabled={busy}
                >
                  Salvar fatura
                </button>
              </form>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950">
              <div className="mb-3 text-sm font-semibold">Parcelamento automatico</div>
              {!selectedCard.autoInstallments && (
                <div className="mb-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
                  Ative o parcelamento automatico no cartao para usar este recurso.
                </div>
              )}
              <form className="grid gap-2 md:grid-cols-2" onSubmit={applyInstallments}>
                <input
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-600/30 dark:border-slate-800 dark:bg-slate-950"
                  placeholder="Valor total"
                  inputMode="decimal"
                  value={installmentTotalRaw}
                  onChange={(event) => setInstallmentTotalRaw(event.target.value)}
                  disabled={busy}
                />
                <input
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-600/30 dark:border-slate-800 dark:bg-slate-950"
                  type="number"
                  min={2}
                  max={48}
                  placeholder="Parcelas"
                  value={installmentCountRaw}
                  onChange={(event) => setInstallmentCountRaw(event.target.value)}
                  disabled={busy}
                />
                <input
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-600/30 dark:border-slate-800 dark:bg-slate-950"
                  type="number"
                  min={2000}
                  max={2100}
                  placeholder="Ano inicial"
                  value={installmentStartYearRaw}
                  onChange={(event) => setInstallmentStartYearRaw(event.target.value)}
                  disabled={busy}
                />
                <input
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-600/30 dark:border-slate-800 dark:bg-slate-950"
                  type="number"
                  min={1}
                  max={12}
                  placeholder="Mes inicial"
                  value={installmentStartMonthRaw}
                  onChange={(event) => setInstallmentStartMonthRaw(event.target.value)}
                  disabled={busy}
                />
                <button
                  type="submit"
                  className="rounded-xl bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60 md:col-span-2"
                  disabled={busy}
                >
                  Aplicar parcelamento
                </button>
              </form>
            </div>
          </section>

          <section className="grid gap-4 xl:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950">
              <div className="mb-3 text-sm font-semibold">Simulacao de impacto da fatura no fluxo</div>
              <form className="grid gap-2" onSubmit={simulateImpact}>
                <select
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-600/30 dark:border-slate-800 dark:bg-slate-950"
                  value={simulationInvoiceId}
                  onChange={(event) => setSimulationInvoiceId(event.target.value)}
                  disabled={simBusy}
                >
                  <option value="">Selecione uma fatura em aberto (opcional)</option>
                  {invoices
                    .filter((invoice) => invoice.outstandingAmount > 0)
                    .map((invoice) => (
                      <option key={invoice.id} value={invoice.id}>
                        {monthKeyLabel(invoice.monthKey)} - aberto {money(invoice.outstandingAmount)}
                      </option>
                    ))}
                </select>
                <input
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-600/30 dark:border-slate-800 dark:bg-slate-950"
                  placeholder="Pagamento simulado"
                  inputMode="decimal"
                  value={simulationAmountRaw}
                  onChange={(event) => setSimulationAmountRaw(event.target.value)}
                  disabled={simBusy}
                />
                <button
                  type="submit"
                  className="rounded-xl bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                  disabled={simBusy}
                >
                  {simBusy ? "Simulando..." : "Simular impacto"}
                </button>
              </form>

              {simulation && (
                <div className="mt-3 space-y-1 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs dark:border-slate-800 dark:bg-slate-900">
                  <div>Pagamento simulado: {money(simulation.paymentAmount)}</div>
                  <div>Saldo de caixa atual: {money(simulation.cashBalance)}</div>
                  <div>Saldo apos pagamento: {money(simulation.cashAfterPayment)}</div>
                  <div>
                    Impacto no caixa:{" "}
                    {simulation.impactPercent === null ? "-" : `${simulation.impactPercent.toFixed(2)}%`}
                  </div>
                  <div>Faturas abertas (antes): {money(simulation.outstandingBeforePayment)}</div>
                  <div>Faturas abertas (apos): {money(simulation.outstandingAfterPayment)}</div>
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950">
              <div className="mb-3 text-sm font-semibold">
                Faturas passadas e controle de valor pago
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-[840px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:text-slate-400">
                      <th className="px-2 py-2 font-medium">Mes</th>
                      <th className="px-2 py-2 font-medium text-right">Total</th>
                      <th className="px-2 py-2 font-medium text-right">Pago</th>
                      <th className="px-2 py-2 font-medium text-right">Aberto</th>
                      <th className="px-2 py-2 font-medium">Fechamento</th>
                      <th className="px-2 py-2 font-medium">Pagamento</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoices.map((invoice) => {
                      const rowBusy = rowBusyId === invoice.id;
                      const fullyPaid = invoice.status === "paid";
                      return (
                        <tr
                          key={invoice.id}
                          className="border-b border-slate-100 align-top dark:border-slate-900"
                        >
                          <td className="px-2 py-2">{monthKeyLabel(invoice.monthKey)}</td>
                          <td className="px-2 py-2 text-right">{money(invoice.totalAmount)}</td>
                          <td className="px-2 py-2 text-right">{money(invoice.paidAmount)}</td>
                          <td className="px-2 py-2 text-right">{money(invoice.outstandingAmount)}</td>
                          <td className="px-2 py-2 text-xs text-slate-500 dark:text-slate-400">
                            {invoice.closingDate ? dateLabel(invoice.closingDate) : "-"}
                          </td>
                          <td className="px-2 py-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <input
                                className="w-28 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs outline-none focus:ring-2 focus:ring-blue-600/30 dark:border-slate-700 dark:bg-slate-950"
                                value={paymentInputs[invoice.id] ?? ""}
                                onChange={(event) =>
                                  setPaymentInputs((previous) => ({
                                    ...previous,
                                    [invoice.id]: event.target.value,
                                  }))
                                }
                                inputMode="decimal"
                                placeholder="Valor"
                                disabled={rowBusy || fullyPaid}
                              />
                              <button
                                type="button"
                                onClick={() => payInvoice(invoice.id)}
                                className="rounded-lg bg-blue-600 px-2 py-1 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
                                disabled={rowBusy || fullyPaid}
                              >
                                Pagar
                              </button>
                              {invoice.outstandingAmount > 0 && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSimulationInvoiceId(String(invoice.id));
                                    setSimulationAmountRaw(String(invoice.outstandingAmount).replace(".", ","));
                                    setSimulation(null);
                                  }}
                                  className="rounded-lg border border-slate-200 px-2 py-1 text-xs hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-900"
                                  disabled={rowBusy}
                                >
                                  Simular
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {invoices.length === 0 && (
                  <div className="py-6 text-center text-sm text-slate-500 dark:text-slate-400">
                    Nenhuma fatura para este cartao.
                  </div>
                )}
              </div>
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function Metric({ title, value, tone = "blue" }) {
  const toneClass = {
    blue: "text-blue-700 dark:text-blue-200",
    emerald: "text-emerald-700 dark:text-emerald-200",
    amber: "text-amber-700 dark:text-amber-200",
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950">
      <div className="text-xs text-slate-500 dark:text-slate-400">{title}</div>
      <div className={["mt-1 text-lg font-semibold sm:text-xl", toneClass[tone] ?? toneClass.blue].join(" ")}>
        {value}
      </div>
    </div>
  );
}
