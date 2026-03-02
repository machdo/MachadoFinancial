import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import {
  API_BASE,
  authHeaders,
  dateLabel,
  money,
  monthKeyLabel,
  ymd,
} from "../lib/finance";
import FancyDateInput from "../components/FancyDateInput";

function monthKey(dateValue) {
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function parseMoneyInput(raw) {
  const cleaned = String(raw ?? "")
    .replace(/\s/g, "")
    .replace(/\./g, "")
    .replace(",", ".");
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : NaN;
}

function parseTagInput(raw) {
  const unique = new Map();
  for (const item of String(raw ?? "").split(",")) {
    const value = String(item ?? "").trim();
    if (!value) continue;
    const key = value.toLowerCase();
    if (unique.has(key)) continue;
    unique.set(key, value);
  }
  return [...unique.values()];
}

function apiErrorMessage(requestError, fallback) {
  return requestError?.response?.data?.error || fallback;
}

export default function Transactions({
  transactions = [],
  categories = [],
  accounts = [],
  onTransactionCreated,
  onTransactionUpdated,
  onTransactionDeleted,
}) {
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [monthFilter, setMonthFilter] = useState("all");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [rowBusyId, setRowBusyId] = useState(null);

  const [editingId, setEditingId] = useState(null);
  const [editType, setEditType] = useState("expense");
  const [editValueRaw, setEditValueRaw] = useState("");
  const [editDate, setEditDate] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editAccountId, setEditAccountId] = useState("");
  const [editCategoryId, setEditCategoryId] = useState("");
  const [editTagsRaw, setEditTagsRaw] = useState("");
  const [editAttachmentFile, setEditAttachmentFile] = useState(null);

  const [tags, setTags] = useState([]);
  const [newTagName, setNewTagName] = useState("");
  const [recurringCount, setRecurringCount] = useState(0);
  const [auditCount, setAuditCount] = useState(0);
  const [reconPendingCount, setReconPendingCount] = useState(0);
  const [duplicatesCount, setDuplicatesCount] = useState(0);

  const [recType, setRecType] = useState("expense");
  const [recValueRaw, setRecValueRaw] = useState("");
  const [recAccountId, setRecAccountId] = useState("");
  const [recCategoryId, setRecCategoryId] = useState("");
  const [recFrequency, setRecFrequency] = useState("monthly");
  const [recInterval, setRecInterval] = useState("1");
  const [recStartDate, setRecStartDate] = useState(ymd(new Date()));

  const [installTotalRaw, setInstallTotalRaw] = useState("");
  const [installCountRaw, setInstallCountRaw] = useState("2");
  const [installAccountId, setInstallAccountId] = useState("");
  const [installCategoryId, setInstallCategoryId] = useState("");

  const [csvFile, setCsvFile] = useState(null);
  const [ofxFile, setOfxFile] = useState(null);

  const editableCategories = useMemo(
    () =>
      categories.filter(
        (category) => String(category.type || "expense") === String(editType),
      ),
    [categories, editType],
  );

  const months = useMemo(() => {
    const values = new Set(transactions.map((transaction) => monthKey(transaction.date)));
    return Array.from(values).filter(Boolean).sort((a, b) => (a > b ? -1 : 1));
  }, [transactions]);

  const filtered = useMemo(() => {
    return transactions
      .filter((transaction) => {
        if (typeFilter !== "all" && transaction.type !== typeFilter) return false;
        if (monthFilter !== "all" && monthKey(transaction.date) !== monthFilter) return false;
        if (!query.trim()) return true;

        const category = categories.find((item) => item.id === transaction.categoryId);
        const account = accounts.find((item) => item.id === transaction.accountId);
        const tagsText = (transaction.tags || []).map((tag) => tag.name).join(" ");
        const haystack = [
          transaction.description,
          category?.name,
          account?.name,
          tagsText,
          dateLabel(transaction.date),
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

  useEffect(() => {
    async function loadAdvanced() {
      try {
        const [tagsRes, recurringRes, reconRes, auditRes] = await Promise.all([
          axios.get(`${API_BASE}/tags`, { headers: authHeaders() }),
          axios.get(`${API_BASE}/transactions/recurring`, { headers: authHeaders() }),
          axios.get(`${API_BASE}/reconciliation/entries?limit=50`, { headers: authHeaders() }),
          axios.get(`${API_BASE}/audit-logs?limit=50`, { headers: authHeaders() }),
        ]);
        setTags(tagsRes.data || []);
        setRecurringCount((recurringRes.data || []).length);
        setReconPendingCount(
          (reconRes.data || []).filter((item) => item.status === "pending").length,
        );
        setAuditCount((auditRes.data || []).length);
      } catch {}
    }
    loadAdvanced();
  }, []);

  useEffect(() => {
    if (!recAccountId && accounts[0]?.id) setRecAccountId(String(accounts[0].id));
    if (!installAccountId && accounts[0]?.id) setInstallAccountId(String(accounts[0].id));
  }, [accounts, recAccountId, installAccountId]);

  useEffect(() => {
    if (!recCategoryId) {
      const first = categories.find((item) => item.type === recType);
      if (first?.id) setRecCategoryId(String(first.id));
    }
    if (!installCategoryId) {
      const firstExpense = categories.find((item) => item.type === "expense");
      if (firstExpense?.id) setInstallCategoryId(String(firstExpense.id));
    }
  }, [categories, recType, recCategoryId, installCategoryId]);

  function categoryName(id) {
    return categories.find((item) => item.id === id)?.name ?? "Sem categoria";
  }

  function accountName(id) {
    return accounts.find((item) => item.id === id)?.name ?? "Sem conta";
  }

  function startEdit(transaction) {
    setEditingId(transaction.id);
    setEditType(transaction.type);
    setEditValueRaw(String(transaction.value ?? "").replace(".", ","));
    setEditDate(ymd(transaction.date));
    setEditDescription(transaction.description || "");
    setEditAccountId(String(transaction.accountId ?? ""));
    setEditCategoryId(String(transaction.categoryId ?? ""));
    setEditTagsRaw((transaction.tags || []).map((tag) => tag.name).join(", "));
    setEditAttachmentFile(null);
  }

  async function handleSaveEdit(transactionId) {
    const value = parseMoneyInput(editValueRaw);
    if (!Number.isFinite(value) || value <= 0) return setError("Valor invalido.");
    if (!editDate || !editAccountId || !editCategoryId) return setError("Preencha os campos.");
    setRowBusyId(transactionId);
    setError("");
    setSuccess("");
    try {
      const updated = (
        await axios.put(
          `${API_BASE}/transactions/${transactionId}`,
          {
            type: editType,
            value,
            date: editDate,
            description: editDescription.trim(),
            accountId: Number(editAccountId),
            categoryId: Number(editCategoryId),
            tags: parseTagInput(editTagsRaw),
          },
          { headers: authHeaders() },
        )
      ).data;
      if (editAttachmentFile) {
        const contentBase64 = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result || ""));
          reader.onerror = () => reject(new Error("Falha ao ler arquivo."));
          reader.readAsDataURL(editAttachmentFile);
        });
        await axios.post(
          `${API_BASE}/transactions/${transactionId}/attachments`,
          {
            fileName: editAttachmentFile.name,
            mimeType: editAttachmentFile.type || "application/octet-stream",
            contentBase64,
          },
          { headers: authHeaders() },
        );
      }
      onTransactionUpdated?.(updated);
      setSuccess("Transacao atualizada.");
      setEditingId(null);
    } catch (requestError) {
      setError(apiErrorMessage(requestError, "Nao foi possivel atualizar."));
    } finally {
      setRowBusyId(null);
    }
  }

  async function handleDelete(transactionId) {
    if (!window.confirm("Deseja excluir esta transacao?")) return;
    setRowBusyId(transactionId);
    try {
      await axios.delete(`${API_BASE}/transactions/${transactionId}`, { headers: authHeaders() });
      onTransactionDeleted?.(transactionId);
    } catch (requestError) {
      setError(apiErrorMessage(requestError, "Nao foi possivel excluir."));
    } finally {
      setRowBusyId(null);
    }
  }

  async function createTag(event) {
    event.preventDefault();
    if (!newTagName.trim()) return;
    try {
      const created = (
        await axios.post(
          `${API_BASE}/tags`,
          { name: newTagName.trim() },
          { headers: authHeaders() },
        )
      ).data;
      setTags((previous) => [...previous, created]);
      setNewTagName("");
      setSuccess("Tag criada.");
    } catch (requestError) {
      setError(apiErrorMessage(requestError, "Falha ao criar tag."));
    }
  }

  async function createRecurring(event) {
    event.preventDefault();
    const value = parseMoneyInput(recValueRaw);
    if (!Number.isFinite(value) || value <= 0) return setError("Valor invalido.");
    await axios.post(
      `${API_BASE}/transactions/recurring`,
      {
        type: recType,
        value,
        accountId: Number(recAccountId),
        categoryId: Number(recCategoryId),
        frequency: recFrequency,
        interval: Number(recInterval || 1),
        startDate: recStartDate,
      },
      { headers: authHeaders() },
    );
    setRecurringCount((previous) => previous + 1);
    setRecValueRaw("");
    setSuccess("Recorrencia criada.");
  }

  async function createInstallments(event) {
    event.preventDefault();
    const totalAmount = parseMoneyInput(installTotalRaw);
    const installments = Number(installCountRaw);
    const response = await axios.post(
      `${API_BASE}/transactions/installments`,
      {
        type: "expense",
        totalAmount,
        installments,
        accountId: Number(installAccountId),
        categoryId: Number(installCategoryId),
        startDate: ymd(new Date()),
      },
      { headers: authHeaders() },
    );
    for (const transaction of response?.data?.transactions || []) {
      onTransactionCreated?.(transaction);
    }
    setSuccess("Parcelas geradas.");
  }

  async function importFile(kind) {
    const file = kind === "csv" ? csvFile : ofxFile;
    if (!file) return;
    const content = await file.text();
    await axios.post(
      `${API_BASE}/imports/${kind}`,
      { fileName: file.name, content },
      { headers: authHeaders() },
    );
    setSuccess(`${kind.toUpperCase()} importado.`);
  }

  async function detectDuplicates() {
    const response = await axios.get(`${API_BASE}/transactions/duplicates?days=365`, {
      headers: authHeaders(),
    });
    setDuplicateGroups(response?.data?.groups || []);
    setDuplicatesCount((response?.data?.groups || []).length);
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-3">
        <SummaryCard title="Receitas" value={money(totals.income)} tone="emerald" icon={<ArrowUpRight size={16} />} />
        <SummaryCard title="Despesas" value={money(totals.expense)} tone="rose" icon={<ArrowDownRight size={16} />} />
        <SummaryCard title="Saldo" value={money(totals.balance)} tone="blue" />
      </div>

      {error && <div className="text-sm text-rose-600">{error}</div>}
      {success && <div className="text-sm text-emerald-600">{success}</div>}

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950">
        <div className="grid gap-2 md:grid-cols-5">
          <input className="rounded border border-slate-200 px-2 py-1 text-sm dark:border-slate-700 dark:bg-slate-950" placeholder="Buscar..." value={query} onChange={(event) => setQuery(event.target.value)} />
          <select className="rounded border border-slate-200 px-2 py-1 text-sm dark:border-slate-700 dark:bg-slate-950" value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}><option value="all">Todos</option><option value="income">Receitas</option><option value="expense">Despesas</option></select>
          <select className="rounded border border-slate-200 px-2 py-1 text-sm dark:border-slate-700 dark:bg-slate-950" value={monthFilter} onChange={(event) => setMonthFilter(event.target.value)}><option value="all">Todos os meses</option>{months.map((month) => <option key={month} value={month}>{monthKeyLabel(month)}</option>)}</select>
          <select className="rounded border border-slate-200 px-2 py-1 text-sm dark:border-slate-700 dark:bg-slate-950" value={tagFilter} onChange={(event) => setTagFilter(event.target.value)}><option value="all">Todas as tags</option>{availableTags.map((tag) => <option key={tag.id} value={String(tag.id)}>{tag.name}</option>)}</select>
          <div className="rounded border border-slate-200 bg-slate-50 px-2 py-1 text-sm dark:border-slate-700 dark:bg-slate-900">{filtered.length} transacoes</div>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950">
        <div className="overflow-x-auto">
          <table className="min-w-[920px] text-left text-sm">
            <thead><tr className="border-b border-slate-200 text-xs uppercase text-slate-500 dark:border-slate-800"><th className="px-2 py-2">Data</th><th className="px-2 py-2">Descricao</th><th className="px-2 py-2">Conta</th><th className="px-2 py-2">Categoria</th><th className="px-2 py-2">Tags</th><th className="px-2 py-2">Anexos</th><th className="px-2 py-2">Tipo</th><th className="px-2 py-2 text-right">Valor</th><th className="px-2 py-2 text-right">Acoes</th></tr></thead>
            <tbody>
              {filtered.map((transaction) => {
                const isEditing = editingId === transaction.id;
                const isBusy = rowBusyId === transaction.id;
                return (
                  <tr key={transaction.id} className="border-b border-slate-100 dark:border-slate-900">
                    <td className="px-2 py-2">{dateLabel(transaction.date)}</td>
                    <td className="px-2 py-2">{transaction.description || "(sem descricao)"}</td>
                    <td className="px-2 py-2">{accountName(transaction.accountId)}</td>
                    <td className="px-2 py-2">{categoryName(transaction.categoryId)}</td>
                    <td className="px-2 py-2 text-xs">{(transaction.tags || []).map((tag) => tag.name).join(", ") || "-"}</td>
                    <td className="px-2 py-2 text-xs">{transaction.attachments?.length || 0}</td>
                    <td className="px-2 py-2">{transaction.type === "income" ? "Receita" : "Despesa"}</td>
                    <td className="px-2 py-2 text-right">{money(transaction.value)}</td>
                    <td className="px-2 py-2 text-right">
                      {!isEditing && (
                        <div className="flex justify-end gap-2">
                          <button
                            className="rounded border border-slate-200 px-2 py-1 text-xs dark:border-slate-700"
                            onClick={() => startEdit(transaction)}
                            disabled={isBusy}
                          >
                            Editar
                          </button>
                          <button
                            className="rounded border border-rose-200 px-2 py-1 text-xs text-rose-600 dark:border-rose-900"
                            onClick={() => handleDelete(transaction.id)}
                            disabled={isBusy}
                          >
                            Excluir
                          </button>
                        </div>
                      )}

                      {isEditing && (
                        <div className="grid gap-2 rounded border border-slate-200 p-2 text-left dark:border-slate-800">
                          <div className="grid gap-2 md:grid-cols-2">
                            <select
                              className="rounded border border-slate-200 px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-950"
                              value={editType}
                              onChange={(event) => {
                                const nextType = event.target.value;
                                setEditType(nextType);
                                const nextCategory = categories.find(
                                  (item) => String(item.type) === String(nextType),
                                );
                                if (nextCategory?.id) {
                                  setEditCategoryId(String(nextCategory.id));
                                }
                              }}
                            >
                              <option value="expense">Despesa</option>
                              <option value="income">Receita</option>
                            </select>
                            <input
                              className="rounded border border-slate-200 px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-950"
                              value={editValueRaw}
                              onChange={(event) => setEditValueRaw(event.target.value)}
                            />
                            <FancyDateInput compact value={editDate} onChange={setEditDate} />
                            <input
                              className="rounded border border-slate-200 px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-950"
                              value={editDescription}
                              onChange={(event) => setEditDescription(event.target.value)}
                            />
                            <select
                              className="rounded border border-slate-200 px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-950"
                              value={editAccountId}
                              onChange={(event) => setEditAccountId(event.target.value)}
                            >
                              {accounts.map((account) => (
                                <option key={account.id} value={String(account.id)}>
                                  {account.name}
                                </option>
                              ))}
                            </select>
                            <select
                              className="rounded border border-slate-200 px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-950"
                              value={editCategoryId}
                              onChange={(event) => setEditCategoryId(event.target.value)}
                            >
                              {editableCategories.map((category) => (
                                <option key={category.id} value={String(category.id)}>
                                  {category.name}
                                </option>
                              ))}
                            </select>
                            <input
                              className="rounded border border-slate-200 px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-950 md:col-span-2"
                              placeholder="Tags separadas por virgula"
                              value={editTagsRaw}
                              onChange={(event) => setEditTagsRaw(event.target.value)}
                            />
                            <input
                              className="rounded border border-slate-200 px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-950 md:col-span-2"
                              type="file"
                              accept=".pdf,image/*"
                              onChange={(event) =>
                                setEditAttachmentFile(event.target.files?.[0] ?? null)
                              }
                            />
                          </div>
                          <div className="flex justify-end gap-2">
                            <button
                              className="rounded bg-blue-600 px-2 py-1 text-xs text-white"
                              onClick={() => handleSaveEdit(transaction.id)}
                              disabled={isBusy}
                            >
                              Salvar
                            </button>
                            <button
                              className="rounded border border-slate-200 px-2 py-1 text-xs dark:border-slate-700"
                              onClick={() => setEditingId(null)}
                              disabled={isBusy}
                            >
                              Cancelar
                            </button>
                            <button
                              className="rounded border border-rose-200 px-2 py-1 text-xs text-rose-600 dark:border-rose-900"
                              onClick={() => handleDelete(transaction.id)}
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
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950">
          <div className="text-sm font-semibold">Tags personalizadas</div>
          <form className="mt-2 flex gap-2" onSubmit={createTag}>
            <input className="flex-1 rounded border border-slate-200 px-2 py-1 text-sm dark:border-slate-700 dark:bg-slate-950" value={newTagName} onChange={(event) => setNewTagName(event.target.value)} />
            <button className="rounded bg-blue-600 px-3 py-1 text-xs text-white">Criar</button>
          </form>
          <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">{tags.length} tag(s).</div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950">
          <div className="text-sm font-semibold">Transacoes recorrentes automaticas</div>
          <form className="mt-2 grid gap-2 md:grid-cols-2" onSubmit={createRecurring}>
            <select className="rounded border border-slate-200 px-2 py-1 text-sm dark:border-slate-700 dark:bg-slate-950" value={recType} onChange={(event) => setRecType(event.target.value)}><option value="expense">Despesa</option><option value="income">Receita</option></select>
            <input className="rounded border border-slate-200 px-2 py-1 text-sm dark:border-slate-700 dark:bg-slate-950" value={recValueRaw} onChange={(event) => setRecValueRaw(event.target.value)} />
            <select className="rounded border border-slate-200 px-2 py-1 text-sm dark:border-slate-700 dark:bg-slate-950" value={recAccountId} onChange={(event) => setRecAccountId(event.target.value)}>{accounts.map((account) => <option key={account.id} value={String(account.id)}>{account.name}</option>)}</select>
            <select className="rounded border border-slate-200 px-2 py-1 text-sm dark:border-slate-700 dark:bg-slate-950" value={recCategoryId} onChange={(event) => setRecCategoryId(event.target.value)}>{categories.filter((item) => item.type === recType).map((category) => <option key={category.id} value={String(category.id)}>{category.name}</option>)}</select>
            <select className="rounded border border-slate-200 px-2 py-1 text-sm dark:border-slate-700 dark:bg-slate-950" value={recFrequency} onChange={(event) => setRecFrequency(event.target.value)}><option value="daily">Diaria</option><option value="weekly">Semanal</option><option value="monthly">Mensal</option><option value="yearly">Anual</option></select>
            <input className="rounded border border-slate-200 px-2 py-1 text-sm dark:border-slate-700 dark:bg-slate-950" type="number" min={1} max={120} value={recInterval} onChange={(event) => setRecInterval(event.target.value)} />
            <input className="rounded border border-slate-200 px-2 py-1 text-sm dark:border-slate-700 dark:bg-slate-950 md:col-span-2" type="date" value={recStartDate} onChange={(event) => setRecStartDate(event.target.value)} />
            <button className="rounded bg-indigo-600 px-3 py-1 text-xs text-white md:col-span-2">Salvar recorrencia</button>
          </form>
          <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">{recurringCount} regra(s).</div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950">
          <div className="text-sm font-semibold">Parcelamento automatico</div>
          <form className="mt-2 grid gap-2 md:grid-cols-2" onSubmit={createInstallments}>
            <input className="rounded border border-slate-200 px-2 py-1 text-sm dark:border-slate-700 dark:bg-slate-950" value={installTotalRaw} onChange={(event) => setInstallTotalRaw(event.target.value)} />
            <input className="rounded border border-slate-200 px-2 py-1 text-sm dark:border-slate-700 dark:bg-slate-950" type="number" min={2} max={120} value={installCountRaw} onChange={(event) => setInstallCountRaw(event.target.value)} />
            <select className="rounded border border-slate-200 px-2 py-1 text-sm dark:border-slate-700 dark:bg-slate-950" value={installAccountId} onChange={(event) => setInstallAccountId(event.target.value)}>{accounts.map((account) => <option key={account.id} value={String(account.id)}>{account.name}</option>)}</select>
            <select className="rounded border border-slate-200 px-2 py-1 text-sm dark:border-slate-700 dark:bg-slate-950" value={installCategoryId} onChange={(event) => setInstallCategoryId(event.target.value)}>{categories.filter((item) => item.type === "expense").map((category) => <option key={category.id} value={String(category.id)}>{category.name}</option>)}</select>
            <button className="rounded bg-blue-600 px-3 py-1 text-xs text-white md:col-span-2">Gerar parcelas</button>
          </form>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950">
          <div className="text-sm font-semibold">Importacao CSV / OFX</div>
          <div className="mt-2 space-y-2">
            <div className="flex gap-2"><input className="flex-1 rounded border border-slate-200 px-2 py-1 text-sm dark:border-slate-700 dark:bg-slate-950" type="file" accept=".csv,text/csv" onChange={(event) => setCsvFile(event.target.files?.[0] ?? null)} /><button type="button" className="rounded bg-blue-600 px-3 py-1 text-xs text-white" onClick={() => importFile("csv")}>CSV</button></div>
            <div className="flex gap-2"><input className="flex-1 rounded border border-slate-200 px-2 py-1 text-sm dark:border-slate-700 dark:bg-slate-950" type="file" accept=".ofx" onChange={(event) => setOfxFile(event.target.files?.[0] ?? null)} /><button type="button" className="rounded bg-indigo-600 px-3 py-1 text-xs text-white" onClick={() => importFile("ofx")}>OFX</button></div>
            <div className="text-xs text-slate-500 dark:text-slate-400">Pendentes para conciliacao: {reconPendingCount}</div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950">
          <div className="mb-2 flex items-center justify-between">
            <div className="text-sm font-semibold">Deteccao de duplicidade</div>
            <button type="button" className="rounded border border-slate-200 px-2 py-1 text-xs dark:border-slate-700" onClick={detectDuplicates}>Detectar</button>
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400">Grupos detectados: {duplicatesCount || duplicateGroups.length}</div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950">
          <div className="text-sm font-semibold">Historico de alteracoes (audit log)</div>
          <div className="text-xs text-slate-500 dark:text-slate-400">Eventos recentes: {auditCount || auditLogs.length}</div>
        </div>
      </section>
    </div>
  );
}

function SummaryCard({ title, value, icon, tone }) {
  const tones = {
    emerald: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-200",
    rose: "bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-200",
    blue: "bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-200",
  };
  return (
    <div className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-xs text-slate-500 dark:text-slate-400">{title}</div>
          <div className="mt-1 break-words text-lg font-semibold sm:text-xl">{value}</div>
        </div>
        {icon && <div className={["rounded-xl px-2 py-2", tones[tone] ?? tones.blue].join(" ")}>{icon}</div>}
      </div>
    </div>
  );
}
