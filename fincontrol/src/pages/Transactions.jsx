import { useMemo, useState } from "react";
import axios from "axios";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { API_BASE, authHeaders, money, ymd } from "../lib/finance";

function monthKey(dateValue) {
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

function parseMoneyInput(raw) {
  const cleaned = String(raw ?? "")
    .replace(/\s/g, "")
    .replace(/\./g, "")
    .replace(",", ".");
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : NaN;
}

function apiErrorMessage(requestError, fallback) {
  const message = requestError?.response?.data?.error;
  return message || fallback;
}

export default function Transactions({
  transactions = [],
  categories = [],
  accounts = [],
  onTransactionUpdated,
  onTransactionDeleted,
}) {
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [monthFilter, setMonthFilter] = useState("all");
  const [error, setError] = useState("");
  const [rowBusyId, setRowBusyId] = useState(null);

  const [editingId, setEditingId] = useState(null);
  const [editType, setEditType] = useState("expense");
  const [editValueRaw, setEditValueRaw] = useState("");
  const [editDate, setEditDate] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editAccountId, setEditAccountId] = useState("");
  const [editCategoryId, setEditCategoryId] = useState("");

  const months = useMemo(() => {
    const values = new Set(
      transactions.map((transaction) => monthKey(transaction.date)).filter(Boolean),
    );
    return Array.from(values).sort((a, b) => (a > b ? -1 : 1));
  }, [transactions]);

  const filtered = useMemo(() => {
    return transactions
      .filter((transaction) => {
        if (typeFilter !== "all" && transaction.type !== typeFilter) return false;
        if (monthFilter !== "all" && monthKey(transaction.date) !== monthFilter) {
          return false;
        }

        if (!query.trim()) return true;

        const category = categories.find((item) => item.id === transaction.categoryId);
        const account = accounts.find((item) => item.id === transaction.accountId);
        const haystack = [
          transaction.description,
          category?.name,
          account?.name,
          ymd(transaction.date),
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();

        return haystack.includes(query.trim().toLowerCase());
      })
      .sort((a, b) => new Date(b.date) - new Date(a.date));
  }, [transactions, categories, accounts, typeFilter, monthFilter, query]);

  const totals = useMemo(() => {
    const income = filtered
      .filter((transaction) => transaction.type === "income")
      .reduce((sum, transaction) => sum + transaction.value, 0);
    const expense = filtered
      .filter((transaction) => transaction.type === "expense")
      .reduce((sum, transaction) => sum + transaction.value, 0);
    return { income, expense, balance: income - expense };
  }, [filtered]);

  function categoryName(id) {
    return categories.find((item) => item.id === id)?.name ?? "Sem categoria";
  }

  function accountName(id) {
    return accounts.find((item) => item.id === id)?.name ?? "Sem conta";
  }

  function startEdit(transaction) {
    setError("");
    setEditingId(transaction.id);
    setEditType(transaction.type);
    setEditValueRaw(String(transaction.value ?? "").replace(".", ","));
    setEditDate(ymd(transaction.date));
    setEditDescription(transaction.description || "");
    setEditAccountId(String(transaction.accountId ?? ""));
    setEditCategoryId(String(transaction.categoryId ?? ""));
  }

  function cancelEdit() {
    setEditingId(null);
    setEditType("expense");
    setEditValueRaw("");
    setEditDate("");
    setEditDescription("");
    setEditAccountId("");
    setEditCategoryId("");
  }

  async function handleSaveEdit(transactionId) {
    const value = parseMoneyInput(editValueRaw);
    if (!Number.isFinite(value) || value <= 0) {
      setError("Informe um valor valido para a transacao.");
      return;
    }
    if (!editDate) {
      setError("Informe a data da transacao.");
      return;
    }
    if (!editAccountId || !editCategoryId) {
      setError("Selecione conta e categoria.");
      return;
    }

    setError("");
    setRowBusyId(transactionId);

    try {
      const response = await axios.put(
        `${API_BASE}/transactions/${transactionId}`,
        {
          type: editType,
          value,
          date: editDate,
          description: editDescription.trim(),
          accountId: Number(editAccountId),
          categoryId: Number(editCategoryId),
        },
        { headers: authHeaders() },
      );

      onTransactionUpdated?.(response.data);
      cancelEdit();
    } catch (requestError) {
      setError(
        apiErrorMessage(requestError, "Nao foi possivel atualizar a transacao."),
      );
    } finally {
      setRowBusyId(null);
    }
  }

  async function handleDelete(transactionId) {
    const confirmed = window.confirm("Deseja excluir esta transacao?");
    if (!confirmed) return;

    setError("");
    setRowBusyId(transactionId);

    try {
      await axios.delete(`${API_BASE}/transactions/${transactionId}`, {
        headers: authHeaders(),
      });
      onTransactionDeleted?.(transactionId);
      if (editingId === transactionId) cancelEdit();
    } catch (requestError) {
      setError(
        apiErrorMessage(requestError, "Nao foi possivel excluir a transacao."),
      );
    } finally {
      setRowBusyId(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-3">
        <SummaryCard
          title="Receitas"
          value={money(totals.income)}
          tone="emerald"
          icon={<ArrowUpRight size={16} />}
        />
        <SummaryCard
          title="Despesas"
          value={money(totals.expense)}
          tone="rose"
          icon={<ArrowDownRight size={16} />}
        />
        <SummaryCard title="Saldo" value={money(totals.balance)} tone="blue" />
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950">
        <div className="grid gap-3 md:grid-cols-4">
          <input
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-600/30 dark:border-slate-800 dark:bg-slate-950"
            placeholder="Buscar descricao, conta, categoria..."
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />

          <select
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-600/30 dark:border-slate-800 dark:bg-slate-950"
            value={typeFilter}
            onChange={(event) => setTypeFilter(event.target.value)}
          >
            <option value="all">Todos os tipos</option>
            <option value="income">Receitas</option>
            <option value="expense">Despesas</option>
          </select>

          <select
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-600/30 dark:border-slate-800 dark:bg-slate-950"
            value={monthFilter}
            onChange={(event) => setMonthFilter(event.target.value)}
          >
            <option value="all">Todos os meses</option>
            {months.map((month) => (
              <option key={month} value={month}>
                {month}
              </option>
            ))}
          </select>

          <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200">
            {filtered.length} transacoes
          </div>
        </div>

        {error && (
          <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300">
            {error}
          </div>
        )}

        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:text-slate-400">
                <th className="px-2 py-2 font-medium">Data</th>
                <th className="px-2 py-2 font-medium">Descricao</th>
                <th className="px-2 py-2 font-medium">Conta</th>
                <th className="px-2 py-2 font-medium">Categoria</th>
                <th className="px-2 py-2 font-medium">Tipo</th>
                <th className="px-2 py-2 font-medium text-right">Valor</th>
                <th className="px-2 py-2 font-medium text-right">Acoes</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((transaction) => {
                const isEditing = editingId === transaction.id;
                const isBusy = rowBusyId === transaction.id;

                return (
                  <tr
                    key={transaction.id}
                    className="border-b border-slate-100 align-top dark:border-slate-900"
                  >
                    <td className="px-2 py-3">{ymd(transaction.date)}</td>
                    <td className="px-2 py-3">
                      {transaction.description || "(sem descricao)"}
                    </td>
                    <td className="px-2 py-3">{accountName(transaction.accountId)}</td>
                    <td className="px-2 py-3">{categoryName(transaction.categoryId)}</td>
                    <td className="px-2 py-3">
                      {transaction.type === "income" ? "Receita" : "Despesa"}
                    </td>
                    <td
                      className={[
                        "px-2 py-3 text-right font-semibold",
                        transaction.type === "income"
                          ? "text-emerald-600"
                          : "text-rose-600",
                      ].join(" ")}
                    >
                      {transaction.type === "income" ? "+" : "-"}{" "}
                      {money(transaction.value)}
                    </td>
                    <td className="px-2 py-3 text-right">
                      {!isEditing && (
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => startEdit(transaction)}
                            className="rounded-lg border border-slate-200 px-3 py-1 text-xs hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-900"
                            disabled={isBusy}
                          >
                            Editar
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(transaction.id)}
                            className="rounded-lg border border-rose-200 px-3 py-1 text-xs text-rose-700 hover:bg-rose-50 dark:border-rose-900 dark:text-rose-300 dark:hover:bg-rose-950/30"
                            disabled={isBusy}
                          >
                            Excluir
                          </button>
                        </div>
                      )}

                      {isEditing && (
                        <div className="grid gap-2 rounded-xl border border-slate-200 p-3 text-left dark:border-slate-800">
                          <div className="grid gap-2 md:grid-cols-2">
                            <select
                              className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs outline-none focus:ring-2 focus:ring-blue-600/30 dark:border-slate-700 dark:bg-slate-950"
                              value={editType}
                              onChange={(event) => setEditType(event.target.value)}
                              disabled={isBusy}
                            >
                              <option value="expense">Despesa</option>
                              <option value="income">Receita</option>
                            </select>
                            <input
                              className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs outline-none focus:ring-2 focus:ring-blue-600/30 dark:border-slate-700 dark:bg-slate-950"
                              value={editValueRaw}
                              onChange={(event) => setEditValueRaw(event.target.value)}
                              inputMode="decimal"
                              disabled={isBusy}
                            />
                            <input
                              type="date"
                              className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs outline-none focus:ring-2 focus:ring-blue-600/30 dark:border-slate-700 dark:bg-slate-950"
                              value={editDate}
                              onChange={(event) => setEditDate(event.target.value)}
                              disabled={isBusy}
                            />
                            <input
                              className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs outline-none focus:ring-2 focus:ring-blue-600/30 dark:border-slate-700 dark:bg-slate-950"
                              value={editDescription}
                              onChange={(event) => setEditDescription(event.target.value)}
                              placeholder="Descricao"
                              disabled={isBusy}
                            />
                            <select
                              className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs outline-none focus:ring-2 focus:ring-blue-600/30 dark:border-slate-700 dark:bg-slate-950"
                              value={editAccountId}
                              onChange={(event) => setEditAccountId(event.target.value)}
                              disabled={isBusy}
                            >
                              <option value="">Conta</option>
                              {accounts.map((account) => (
                                <option key={account.id} value={String(account.id)}>
                                  {account.name}
                                </option>
                              ))}
                            </select>
                            <select
                              className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs outline-none focus:ring-2 focus:ring-blue-600/30 dark:border-slate-700 dark:bg-slate-950"
                              value={editCategoryId}
                              onChange={(event) => setEditCategoryId(event.target.value)}
                              disabled={isBusy}
                            >
                              <option value="">Categoria</option>
                              {categories.map((category) => (
                                <option key={category.id} value={String(category.id)}>
                                  {category.name}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div className="flex justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => handleSaveEdit(transaction.id)}
                              className="rounded-lg bg-blue-600 px-3 py-1 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
                              disabled={isBusy}
                            >
                              Salvar
                            </button>
                            <button
                              type="button"
                              onClick={cancelEdit}
                              className="rounded-lg border border-slate-200 px-3 py-1 text-xs hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-900"
                              disabled={isBusy}
                            >
                              Cancelar
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDelete(transaction.id)}
                              className="rounded-lg border border-rose-200 px-3 py-1 text-xs text-rose-700 hover:bg-rose-50 dark:border-rose-900 dark:text-rose-300 dark:hover:bg-rose-950/30"
                              disabled={isBusy}
                            >
                              Excluir
                            </button>
                          </div>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <div className="py-8 text-center text-sm text-slate-500 dark:text-slate-400">
              Nenhuma transacao encontrada para os filtros aplicados.
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function SummaryCard({ title, value, icon, tone }) {
  const tones = {
    emerald:
      "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-200",
    rose: "bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-200",
    blue: "bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-200",
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-xs text-slate-500 dark:text-slate-400">{title}</div>
          <div className="mt-1 text-xl font-semibold">{value}</div>
        </div>
        {icon && (
          <div className={["rounded-xl px-2 py-2", tones[tone] ?? tones.blue].join(" ")}>
            {icon}
          </div>
        )}
      </div>
    </div>
  );
}
