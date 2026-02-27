import { useMemo, useState } from "react";
import axios from "axios";
import { API_BASE, authHeaders, money } from "../lib/finance";
import {
  addCategoryDescriptionPreset,
  getCategoryDescriptionMap,
  getDefaultDescriptionSuggestions,
  removeCategoryDescriptionPreset,
} from "../lib/categoryDescriptions";

const COLOR_PRESETS = [
  "#0ea5e9",
  "#22c55e",
  "#f59e0b",
  "#ef4444",
  "#a855f7",
  "#06b6d4",
  "#14b8a6",
  "#84cc16",
  "#eab308",
  "#f97316",
  "#ec4899",
  "#6366f1",
  "#64748b",
  "#334155",
];

const CATEGORY_TYPES = [
  { value: "expense", label: "Despesa" },
  { value: "income", label: "Receita" },
];

function deletionErrorMessage(requestError, fallback) {
  const apiError = requestError?.response?.data;
  if (!apiError) return fallback;
  if (apiError.reason) return `${apiError.error} ${apiError.reason}`;
  return apiError.error || fallback;
}

export default function Categories({
  categories = [],
  transactions = [],
  onCategoryCreated,
  onCategoryUpdated,
  onCategoryDeleted,
}) {
  const [name, setName] = useState("");
  const [color, setColor] = useState(COLOR_PRESETS[0]);
  const [categoryType, setCategoryType] = useState("expense");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState("");
  const [editColor, setEditColor] = useState(COLOR_PRESETS[0]);
  const [editType, setEditType] = useState("expense");
  const [rowBusyId, setRowBusyId] = useState(null);
  const [descriptionMap, setDescriptionMap] = useState(() =>
    getCategoryDescriptionMap(),
  );
  const [newDescriptionByCategory, setNewDescriptionByCategory] = useState({});

  const categoryStats = useMemo(() => {
    const map = new Map();

    for (const transaction of transactions) {
      const current = map.get(transaction.categoryId) ?? {
        count: 0,
        expenseTotal: 0,
        incomeTotal: 0,
      };
      current.count += 1;
      if (transaction.type === "expense") current.expenseTotal += transaction.value;
      if (transaction.type === "income") current.incomeTotal += transaction.value;
      map.set(transaction.categoryId, current);
    }

    return map;
  }, [transactions]);

  const groupedCategories = useMemo(() => {
    const normalized = categories.map((category) => ({
      ...category,
      type: category.type || "expense",
    }));

    return {
      expense: normalized
        .filter((category) => category.type === "expense")
        .sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""))),
      income: normalized
        .filter((category) => category.type === "income")
        .sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""))),
    };
  }, [categories]);

  async function handleCreate(event) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Informe um nome de categoria.");
      return;
    }

    setError("");
    setBusy(true);

    try {
      const response = await axios.post(
        `${API_BASE}/categories`,
        { name: trimmed, color, type: categoryType },
        { headers: authHeaders() },
      );
      onCategoryCreated?.(response.data);
      setName("");
      setColor(COLOR_PRESETS[0]);
      setCategoryType("expense");
    } catch (requestError) {
      setError(requestError?.response?.data?.error || "Nao foi possivel criar categoria.");
    } finally {
      setBusy(false);
    }
  }

  function startEdit(category) {
    setError("");
    setEditingId(category.id);
    setEditName(category.name ?? "");
    setEditColor(category.color || COLOR_PRESETS[0]);
    setEditType(category.type || "expense");
  }

  function cancelEdit() {
    setEditingId(null);
    setEditName("");
    setEditColor(COLOR_PRESETS[0]);
    setEditType("expense");
  }

  async function handleSaveEdit(categoryId) {
    const trimmed = editName.trim();
    if (!trimmed) {
      setError("Informe um nome de categoria.");
      return;
    }

    setError("");
    setRowBusyId(categoryId);

    try {
      const response = await axios.put(
        `${API_BASE}/categories/${categoryId}`,
        { name: trimmed, color: editColor, type: editType },
        { headers: authHeaders() },
      );
      onCategoryUpdated?.(response.data);
      cancelEdit();
    } catch (requestError) {
      setError(requestError?.response?.data?.error || "Nao foi possivel editar categoria.");
    } finally {
      setRowBusyId(null);
    }
  }

  async function handleDelete(categoryId) {
    const confirmed = window.confirm("Deseja excluir esta categoria?");
    if (!confirmed) return;

    setError("");
    setRowBusyId(categoryId);

    try {
      await axios.delete(`${API_BASE}/categories/${categoryId}`, {
        headers: authHeaders(),
      });
      onCategoryDeleted?.(categoryId);
      if (editingId === categoryId) cancelEdit();
    } catch (requestError) {
      setError(
        deletionErrorMessage(
          requestError,
          "Nao foi possivel excluir categoria.",
        ),
      );
    } finally {
      setRowBusyId(null);
    }
  }

  function handleAddDescription(category) {
    const raw = newDescriptionByCategory[category.id] ?? "";
    const text = raw.trim();
    if (!text) {
      setError("Informe uma descricao pronta para adicionar.");
      return;
    }

    addCategoryDescriptionPreset(category.id, text);
    setDescriptionMap(getCategoryDescriptionMap());
    setNewDescriptionByCategory((previous) => ({
      ...previous,
      [category.id]: "",
    }));
    setError("");
  }

  function handleAddSuggestedDescription(category, description) {
    addCategoryDescriptionPreset(category.id, description);
    setDescriptionMap(getCategoryDescriptionMap());
    setError("");
  }

  function handleRemoveDescription(categoryId, description) {
    removeCategoryDescriptionPreset(categoryId, description);
    setDescriptionMap(getCategoryDescriptionMap());
    setError("");
  }

  return (
    <div className="space-y-4">
      <section className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950">
        <div className="text-sm font-semibold">Nova categoria</div>

        <form className="mt-3 grid gap-3 md:grid-cols-4" onSubmit={handleCreate}>
          <input
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-600/30 dark:border-slate-800 dark:bg-slate-950"
            placeholder="Ex.: Alimentacao"
            value={name}
            onChange={(event) => setName(event.target.value)}
            disabled={busy}
          />

          <select
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-600/30 dark:border-slate-800 dark:bg-slate-950"
            value={categoryType}
            onChange={(event) => setCategoryType(event.target.value)}
            disabled={busy}
          >
            {CATEGORY_TYPES.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>

          <div className="flex flex-wrap items-center gap-2">
            {COLOR_PRESETS.map((preset) => (
              <button
                key={preset}
                type="button"
                className={[
                  "h-8 w-8 rounded-full border",
                  color === preset
                    ? "border-slate-900 dark:border-white"
                    : "border-slate-200 dark:border-slate-700",
                ].join(" ")}
                style={{ backgroundColor: preset }}
                onClick={() => setColor(preset)}
                disabled={busy}
                aria-label={`Selecionar cor ${preset}`}
              />
            ))}
          </div>

          <button
            type="submit"
            className="rounded-xl bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
            disabled={busy}
          >
            Criar categoria
          </button>
        </form>

        {error && <div className="mt-3 text-sm font-medium text-rose-600">{error}</div>}
      </section>

      <section className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950">
        <div className="mb-3 text-sm font-semibold">Categorias cadastradas</div>

        <div className="space-y-5">
          {[
            {
              key: "expense",
              title: "Categorias de despesa",
              empty: "Nenhuma categoria de despesa cadastrada.",
            },
            {
              key: "income",
              title: "Categorias de receita",
              empty: "Nenhuma categoria de receita cadastrada.",
            },
          ].map((group) => {
            const list = groupedCategories[group.key] ?? [];
            return (
              <div key={group.key}>
                <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  {group.title}
                </div>

                {list.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-200 px-3 py-4 text-sm text-slate-500 dark:border-slate-800 dark:text-slate-400">
                    {group.empty}
                  </div>
                ) : (
                  <div className="space-y-2">
                    {list.map((category) => {
                      const stats = categoryStats.get(category.id) ?? {
                        count: 0,
                        expenseTotal: 0,
                        incomeTotal: 0,
                      };
                      const isEditing = editingId === category.id;
                      const isRowBusy = rowBusyId === category.id;
                      const storedDescriptions =
                        descriptionMap[String(category.id)] ?? [];
                      const suggestions = getDefaultDescriptionSuggestions(
                        category.name,
                      ).filter(
                        (item) =>
                          !storedDescriptions.some(
                            (stored) => stored.toLowerCase() === item.toLowerCase(),
                          ),
                      );
                      const typeLabel =
                        category.type === "income" ? "Receita" : "Despesa";
                      const totalValue =
                        category.type === "income"
                          ? stats.incomeTotal
                          : stats.expenseTotal;

                      return (
                        <div
                          key={category.id}
                          className="rounded-xl border border-slate-200 px-3 py-3 dark:border-slate-800"
                        >
                          {!isEditing && (
                            <div className="space-y-3">
                              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                <div className="flex min-w-0 items-center gap-3">
                                  <span
                                    className="h-3 w-3 shrink-0 rounded-full border border-slate-200 dark:border-slate-800"
                                    style={{
                                      backgroundColor: category.color || "#64748b",
                                    }}
                                  />
                                  <div className="min-w-0">
                                    <div className="flex flex-wrap items-center gap-2">
                                      <div className="truncate text-sm font-medium">
                                        {category.name}
                                      </div>
                                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                                        {typeLabel}
                                      </span>
                                    </div>
                                    <div className="text-xs text-slate-500 dark:text-slate-400">
                                      {stats.count} transacoes
                                    </div>
                                  </div>
                                </div>

                                <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                                  <div
                                    className={[
                                      "text-sm font-semibold",
                                      category.type === "income"
                                        ? "text-emerald-600"
                                        : "text-rose-600",
                                    ].join(" ")}
                                  >
                                    {money(totalValue)}
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => startEdit(category)}
                                    className="rounded-lg border border-slate-200 px-3 py-1 text-xs hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-900"
                                    disabled={isRowBusy}
                                  >
                                    Editar
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleDelete(category.id)}
                                    className="rounded-lg border border-rose-200 px-3 py-1 text-xs text-rose-700 hover:bg-rose-50 dark:border-rose-900 dark:text-rose-300 dark:hover:bg-rose-950/30"
                                    disabled={isRowBusy}
                                  >
                                    Excluir
                                  </button>
                                </div>
                              </div>

                              <div className="rounded-xl border border-slate-200 p-3 dark:border-slate-800">
                                <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
                                  Descricoes prontas
                                </div>

                                {storedDescriptions.length === 0 ? (
                                  <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                                    Nenhuma descricao pronta personalizada.
                                  </div>
                                ) : (
                                  <div className="mt-2 flex flex-wrap gap-2">
                                    {storedDescriptions.map((item) => (
                                      <button
                                        key={item}
                                        type="button"
                                        onClick={() =>
                                          handleRemoveDescription(category.id, item)
                                        }
                                        className="rounded-full border border-slate-200 px-2 py-1 text-xs hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-900"
                                        title="Remover descricao pronta"
                                      >
                                        {item} x
                                      </button>
                                    ))}
                                  </div>
                                )}

                                {suggestions.length > 0 && (
                                  <div className="mt-3">
                                    <div className="text-xs text-slate-500 dark:text-slate-400">
                                      Sugestoes
                                    </div>
                                    <div className="mt-2 flex flex-wrap gap-2">
                                      {suggestions.map((item) => (
                                        <button
                                          key={item}
                                          type="button"
                                          onClick={() =>
                                            handleAddSuggestedDescription(category, item)
                                          }
                                          className="rounded-full border border-blue-200 px-2 py-1 text-xs text-blue-700 hover:bg-blue-50 dark:border-blue-900 dark:text-blue-300 dark:hover:bg-blue-950/30"
                                        >
                                          + {item}
                                        </button>
                                      ))}
                                    </div>
                                  </div>
                                )}

                                <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                                  <input
                                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-blue-600/30 dark:border-slate-800 dark:bg-slate-950"
                                    placeholder="Nova descricao pronta"
                                    value={newDescriptionByCategory[category.id] ?? ""}
                                    onChange={(event) =>
                                      setNewDescriptionByCategory((previous) => ({
                                        ...previous,
                                        [category.id]: event.target.value,
                                      }))
                                    }
                                    onKeyDown={(event) => {
                                      if (event.key === "Enter") {
                                        event.preventDefault();
                                        handleAddDescription(category);
                                      }
                                    }}
                                    disabled={isRowBusy}
                                  />
                                  <button
                                    type="button"
                                    onClick={() => handleAddDescription(category)}
                                    className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-60 sm:w-auto"
                                    disabled={isRowBusy}
                                  >
                                    Adicionar
                                  </button>
                                </div>
                              </div>
                            </div>
                          )}

                          {isEditing && (
                            <div className="space-y-3">
                              <input
                                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-600/30 dark:border-slate-800 dark:bg-slate-950"
                                value={editName}
                                onChange={(event) => setEditName(event.target.value)}
                                disabled={isRowBusy}
                              />

                              <select
                                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-600/30 dark:border-slate-800 dark:bg-slate-950"
                                value={editType}
                                onChange={(event) => setEditType(event.target.value)}
                                disabled={isRowBusy}
                              >
                                {CATEGORY_TYPES.map((item) => (
                                  <option key={item.value} value={item.value}>
                                    {item.label}
                                  </option>
                                ))}
                              </select>

                              <div className="flex flex-wrap items-center gap-2">
                                {COLOR_PRESETS.map((preset) => (
                                  <button
                                    key={preset}
                                    type="button"
                                    className={[
                                      "h-8 w-8 rounded-full border",
                                      editColor === preset
                                        ? "border-slate-900 dark:border-white"
                                        : "border-slate-200 dark:border-slate-700",
                                    ].join(" ")}
                                    style={{ backgroundColor: preset }}
                                    onClick={() => setEditColor(preset)}
                                    disabled={isRowBusy}
                                    aria-label={`Selecionar cor ${preset}`}
                                  />
                                ))}
                              </div>

                              <div className="flex flex-wrap gap-2">
                                <button
                                  type="button"
                                  onClick={() => handleSaveEdit(category.id)}
                                  className="rounded-lg bg-blue-600 px-3 py-1 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
                                  disabled={isRowBusy}
                                >
                                  Salvar
                                </button>
                                <button
                                  type="button"
                                  onClick={cancelEdit}
                                  className="rounded-lg border border-slate-200 px-3 py-1 text-xs hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-900"
                                  disabled={isRowBusy}
                                >
                                  Cancelar
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDelete(category.id)}
                                  className="rounded-lg border border-rose-200 px-3 py-1 text-xs text-rose-700 hover:bg-rose-50 dark:border-rose-900 dark:text-rose-300 dark:hover:bg-rose-950/30"
                                  disabled={isRowBusy}
                                >
                                  Excluir
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {categories.length === 0 && (
          <div className="py-8 text-center text-sm text-slate-500 dark:text-slate-400">
            Nenhuma categoria cadastrada.
          </div>
        )}
      </section>
    </div>
  );
}
