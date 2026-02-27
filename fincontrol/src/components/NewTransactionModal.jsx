import { useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";
import { X, Plus } from "lucide-react";
import { getDefaultAccountId } from "../lib/accountPreferences";
import { getDescriptionSuggestionsForCategory } from "../lib/categoryDescriptions";
import { API_BASE } from "../lib/finance";
import FancyDateInput from "./FancyDateInput";

const LS_LAST_ACCOUNT = "fincontrol:lastAccountId";
const LS_LAST_CATEGORY = "fincontrol:lastCategoryId";

function money(n) {
  return (n ?? 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function todayISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function clampMoneyInput(raw) {
  const cleaned = String(raw ?? "")
    .replace(/\s/g, "")
    .replace(/\./g, "")
    .replace(",", ".");
  const n = Number(cleaned);
  if (Number.isNaN(n) || n < 0) return "";
  return cleaned;
}

const ACCOUNT_TYPES = [
  { value: "checking", label: "Conta corrente" },
  { value: "wallet", label: "Carteira" },
  { value: "savings", label: "Poupança" },
  { value: "credit", label: "Cartão de crédito" },
];

const CATEGORY_COLORS = [
  "#0ea5e9", // sky
  "#22c55e", // green
  "#f59e0b", // amber
  "#ef4444", // red
  "#a855f7", // purple
  "#06b6d4", // cyan
  "#14b8a6", // teal
  "#84cc16", // lime
  "#eab308", // yellow
  "#f97316", // orange
  "#ec4899", // pink
  "#6366f1", // indigo
  "#64748b", // slate
  "#334155", // slate dark
];

export default function NewTransactionModal({
  open,
  onClose,
  onCreated,
  onAccountCreated,
  onCategoryCreated,
  accounts = [],
  categories = [],
  apiBase = API_BASE,
  initialType = "expense",
}) {
  const hasAccounts = accounts.length > 0;
  const normalizedInitialType = initialType === "income" ? "income" : "expense";

  const [step, setStep] = useState(0); // 0 tipo/valor, 1 conta, 2 categoria, 3 detalhes, 4 revisão
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const [type, setType] = useState("expense");
  const [valueRaw, setValueRaw] = useState("");
  const [accountId, setAccountId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [date, setDate] = useState(todayISO());
  const [description, setDescription] = useState("");

  const [catQuery, setCatQuery] = useState("");

  // quick add
  const [quickMode, setQuickMode] = useState(null); // "account" | "category" | null
  const [quickName, setQuickName] = useState("");
  const [quickAccountType, setQuickAccountType] = useState("checking");
  const [quickCategoryColor, setQuickCategoryColor] = useState("#64748b");

  const focusRef = useRef(null);

  const categoriesByType = useMemo(() => {
    return categories.filter(
      (category) => String(category.type || "expense") === String(type),
    );
  }, [categories, type]);

  const hasCategoriesForType = categoriesByType.length > 0;

  const filteredCategories = useMemo(() => {
    const q = catQuery.trim().toLowerCase();
    const list = categoriesByType;
    if (!q) return list;
    return list.filter((c) =>
      String(c.name || "")
        .toLowerCase()
        .includes(q),
    );
  }, [categoriesByType, catQuery]);

  useEffect(() => {
    if (!open) return;

    setErr("");
    setBusy(false);
    setQuickMode(null);
    setQuickName("");
    setQuickAccountType("checking");
    setQuickCategoryColor("#64748b");
    setCatQuery("");

    const lastAcc = localStorage.getItem(LS_LAST_ACCOUNT) || "";
    const defaultAcc = getDefaultAccountId() || "";
    const lastCat = localStorage.getItem(LS_LAST_CATEGORY) || "";

    setType(normalizedInitialType);
    setValueRaw("");
    setDate(todayISO());
    setDescription("");

    setAccountId(
      accounts.some((a) => String(a.id) === String(defaultAcc))
        ? String(defaultAcc)
        : accounts.some((a) => String(a.id) === String(lastAcc))
        ? String(lastAcc)
        : accounts[0]?.id
          ? String(accounts[0].id)
          : "",
    );

    const categoriesForType = categories.filter(
      (c) => String(c.type || "expense") === String(normalizedInitialType),
    );

    setCategoryId(
      categoriesForType.some((c) => String(c.id) === String(lastCat))
        ? String(lastCat)
        : categoriesForType[0]?.id
          ? String(categoriesForType[0].id)
          : "",
    );

    setStep(0);

    setTimeout(() => focusRef.current?.focus?.(), 0);
  }, [open, accounts, categories, normalizedInitialType]);

  useEffect(() => {
    if (!open) return;

    if (categoriesByType.some((c) => String(c.id) === String(categoryId))) return;
    setCategoryId(categoriesByType[0]?.id ? String(categoriesByType[0].id) : "");
  }, [open, categoryId, categoriesByType]);

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        if (!busy) onClose?.();
      }
      if (e.key === "Enter") {
        const tag = (e.target?.tagName || "").toLowerCase();
        if (tag === "textarea") return;

        if (quickMode) {
          e.preventDefault();
          handleQuickAdd();
          return;
        }

        if (step < 4) {
          e.preventDefault();
          goNext();
        }
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    open,
    busy,
    step,
    quickMode,
    valueRaw,
    type,
    accountId,
    categoryId,
    date,
    description,
    quickName,
    quickAccountType,
    quickCategoryColor,
  ]);

  useEffect(() => {
    if (!open) return;
    setTimeout(() => focusRef.current?.focus?.(), 0);
  }, [open, step, quickMode]);

  function validate(s) {
    if (s === 0) {
      const n = Number(valueRaw);
      if (!valueRaw || Number.isNaN(n) || n <= 0)
        return "Informe um valor válido.";
      return "";
    }
    if (s === 1) {
      if (!hasAccounts) return "Você precisa criar uma conta.";
      if (!accountId) return "Selecione uma conta.";
      return "";
    }
    if (s === 2) {
      if (!hasCategoriesForType) {
        return type === "income"
          ? "Você precisa criar uma categoria de receita."
          : "Você precisa criar uma categoria de despesa.";
      }
      if (!categoryId) return "Selecione uma categoria.";
      return "";
    }
    if (s === 3) {
      if (!date) return "Selecione a data.";
      return "";
    }
    return "";
  }

  function goNext() {
    setErr("");
    const msg = validate(step);
    if (msg) return setErr(msg);
    setStep((p) => Math.min(4, p + 1));
  }

  function goBack() {
    setErr("");
    setQuickMode(null);
    setQuickName("");
    setStep((p) => Math.max(0, p - 1));
  }

  function authHeaders() {
    const token = localStorage.getItem("token");
    return { Authorization: `Bearer ${token}` };
  }

  async function handleQuickAdd() {
    const name = quickName.trim();
    if (!name) return setErr("Informe um nome.");

    setErr("");
    try {
      setBusy(true);

      if (quickMode === "account") {
        const res = await axios.post(
          `${apiBase}/accounts`,
          { name, type: quickAccountType, balance: 0 },
          { headers: authHeaders() },
        );
        const created = res.data;
        onAccountCreated?.(created);
        setAccountId(String(created.id));
        setQuickMode(null);
        setQuickName("");
        setStep(1);
      }

      if (quickMode === "category") {
        const res = await axios.post(
          `${apiBase}/categories`,
          { name, color: quickCategoryColor, type },
          { headers: authHeaders() },
        );
        const created = res.data;
        onCategoryCreated?.(created);
        if (created?.id) setCategoryId(String(created.id));
        setQuickMode(null);
        setQuickName("");
        setStep(2);
      }

      setBusy(false);
    } catch (e) {
      setBusy(false);
      setErr(e?.response?.data?.error || "Não foi possível criar.");
    }
  }

  async function handleSave() {
    setErr("");
    for (let s = 0; s <= 3; s++) {
      const msg = validate(s);
      if (msg) {
        setStep(s);
        return setErr(msg);
      }
    }

    try {
      setBusy(true);

      const payload = {
        type,
        value: Number(valueRaw),
        accountId: Number(accountId),
        categoryId: Number(categoryId),
        date,
        description: description?.trim() || "",
      };

      const res = await axios.post(`${apiBase}/transactions`, payload, {
        headers: authHeaders(),
      });
      const created = res.data;

      localStorage.setItem(LS_LAST_ACCOUNT, String(accountId));
      localStorage.setItem(LS_LAST_CATEGORY, String(categoryId));

      onCreated?.(created);
      setBusy(false);
      onClose?.();
    } catch (e) {
      setBusy(false);
      setErr(e?.response?.data?.error || "Não foi possível salvar.");
    }
  }

  const selectedAccount = accounts.find(
    (a) => String(a.id) === String(accountId),
  );
  const selectedCategory = categories.find(
    (c) => String(c.id) === String(categoryId),
  );
  const defaultAccountId = getDefaultAccountId();
  const descriptionSuggestions = selectedCategory
    ? getDescriptionSuggestionsForCategory(selectedCategory)
    : [];

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      {/* overlay */}
      <div
        className="absolute inset-0 bg-black/50"
        onMouseDown={(e) => {
          if (e.target === e.currentTarget && !busy) onClose?.();
        }}
      />

      {/* modal */}
      <div className="absolute left-1/2 top-1/2 mx-auto flex max-h-[92vh] w-[calc(100%-1rem)] max-w-2xl -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl sm:w-[calc(100%-2rem)] dark:border-slate-800 dark:bg-slate-950">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 dark:border-slate-800">
          <div>
            <div className="text-sm font-semibold">Nova transação</div>
            <div className="text-xs text-slate-500 dark:text-slate-400">
              Etapa {step + 1} de 5 {busy ? "- salvando..." : ""}
            </div>
          </div>
          <button
            className="rounded-lg p-2 hover:bg-slate-50 dark:hover:bg-slate-900"
            onClick={() => !busy && onClose?.()}
            aria-label="Fechar"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {/* quick add mode */}
          {quickMode && (
            <>
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-semibold">
                  {quickMode === "account" ? "Criar conta" : "Criar categoria"}
                </div>
                <button
                  className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-950 dark:hover:bg-slate-900"
                  onClick={() => {
                    setQuickMode(null);
                    setQuickName("");
                    setErr("");
                  }}
                  disabled={busy}
                >
                  Cancelar
                </button>
              </div>

              <div className="mt-3 space-y-3">
                <input
                  ref={focusRef}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-600/30 dark:border-slate-800 dark:bg-slate-950"
                  placeholder={
                    quickMode === "account" ? "Ex.: Nubank" : "Ex.: Alimentação"
                  }
                  value={quickName}
                  onChange={(e) => setQuickName(e.target.value)}
                  disabled={busy}
                />

                {quickMode === "account" && (
                  <div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">
                      Tipo da conta
                    </div>
                    <select
                      className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-600/30 dark:border-slate-800 dark:bg-slate-950"
                      value={quickAccountType}
                      onChange={(e) => setQuickAccountType(e.target.value)}
                      disabled={busy}
                    >
                      {ACCOUNT_TYPES.map((t) => (
                        <option key={t.value} value={t.value}>
                          {t.label}
                        </option>
                      ))}
                    </select>
                    <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                      Saldo inicial:{" "}
                      <span className="font-semibold">{money(0)}</span>
                    </div>
                  </div>
                )}

                {quickMode === "category" && (
                  <div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">
                      Cor da categoria
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {CATEGORY_COLORS.map((c) => (
                        <button
                          key={c}
                          type="button"
                          className={[
                            "h-8 w-8 rounded-full border",
                            quickCategoryColor === c
                              ? "border-slate-900 dark:border-white"
                              : "border-slate-200 dark:border-slate-800",
                          ].join(" ")}
                          style={{ backgroundColor: c }}
                          onClick={() => setQuickCategoryColor(c)}
                          disabled={busy}
                          aria-label={`Selecionar cor ${c}`}
                        />
                      ))}
                    </div>
                    <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                      Tipo da categoria:{" "}
                      <span className="font-semibold">
                        {type === "income" ? "receita" : "despesa"}
                      </span>
                    </div>
                    <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      Cor selecionada:{" "}
                      <span className="font-semibold">
                        {quickCategoryColor}
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {err && (
                <div className="mt-3 text-sm font-semibold text-rose-500">
                  {err}
                </div>
              )}

              <div className="mt-4 flex justify-end">
                <button
                  className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
                  onClick={handleQuickAdd}
                  disabled={busy}
                >
                  <Plus size={16} />
                  Criar
                </button>
              </div>
            </>
          )}

          {/* normal flow */}
          {!quickMode && (
            <>
              {/* STEP 0 */}
              {step === 0 && (
                <div className="space-y-3">
                  <div className="text-sm font-semibold">Valor</div>

                  <div className="grid gap-3 md:grid-cols-2">
                    <div>
                      <div className="text-xs text-slate-500 dark:text-slate-400">Tipo</div>
                      <div
                        className={[
                          "mt-2 rounded-xl border px-3 py-3",
                          type === "income"
                            ? "border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/30"
                            : "border-rose-200 bg-rose-50 dark:border-rose-900 dark:bg-rose-950/30",
                        ].join(" ")}
                      >
                        <div
                          className={[
                            "text-sm font-semibold",
                            type === "income" ? "text-emerald-700 dark:text-emerald-300" : "text-rose-700 dark:text-rose-300",
                          ].join(" ")}
                        >
                          {type === "income" ? "Receita" : "Despesa"}
                        </div>
                        <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                          Definido pelo botao que abriu este modal.
                        </div>
                      </div>
                    </div>

                    <div>
                      <div className="text-xs text-slate-500 dark:text-slate-400">
                        Valor
                      </div>
                      <input
                        ref={focusRef}
                        className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-600/30 dark:border-slate-800 dark:bg-slate-950"
                        inputMode="decimal"
                        placeholder="Ex.: 59,90"
                        value={
                          valueRaw ? String(valueRaw).replace(".", ",") : ""
                        }
                        onChange={(e) =>
                          setValueRaw(clampMoneyInput(e.target.value))
                        }
                        disabled={busy}
                      />
                      <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                        Prévia:{" "}
                        <span className="font-semibold">
                          {money(Number(valueRaw || 0))}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* STEP 1 */}
              {step === 1 && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-semibold">Conta</div>
                    <button
                      className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-950 dark:hover:bg-slate-900"
                      onClick={() => {
                        setQuickMode("account");
                        setQuickName("");
                        setErr("");
                      }}
                      disabled={busy}
                    >
                      + Criar
                    </button>
                  </div>

                  {!hasAccounts ? (
                    <div className="text-sm text-slate-500 dark:text-slate-400">
                      Você ainda não tem contas. Clique em{" "}
                      <span className="font-semibold">+ Criar</span>.
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
                      {accounts.map((a) => (
                        <button
                          key={a.id}
                          className={[
                            "flex w-full items-center justify-between px-3 py-3 text-left text-sm hover:bg-slate-50 dark:hover:bg-slate-900",
                            String(a.id) === String(accountId)
                              ? "bg-slate-50 dark:bg-slate-900"
                              : "",
                          ].join(" ")}
                          onClick={() => setAccountId(String(a.id))}
                        >
                          <span className="min-w-0">
                            <span className="block truncate font-medium">
                              {a.name}
                            </span>
                            <span className="block text-xs text-slate-500 dark:text-slate-400">
                              {a.type || "-"}
                            </span>
                          </span>
                          <span className="text-xs text-slate-500 dark:text-slate-400">
                            {String(a.id) === String(defaultAccountId) ? "padrao" : ""}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* STEP 2 */}
              {step === 2 && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-semibold">
                      Categoria {type === "income" ? "de receita" : "de despesa"}
                    </div>
                    <button
                      className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-950 dark:hover:bg-slate-900"
                      onClick={() => {
                        setQuickMode("category");
                        setQuickName("");
                        setErr("");
                      }}
                      disabled={busy}
                    >
                      + Criar
                    </button>
                  </div>

                  <input
                    ref={focusRef}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-600/30 dark:border-slate-800 dark:bg-slate-950"
                    placeholder="Buscar categoria..."
                    value={catQuery}
                    onChange={(e) => setCatQuery(e.target.value)}
                    disabled={busy || !hasCategoriesForType}
                  />

                  {!hasCategoriesForType ? (
                    <div className="text-sm text-slate-500 dark:text-slate-400">
                      Você ainda não tem categorias de{" "}
                      <span className="font-semibold">
                        {type === "income" ? "receita" : "despesa"}
                      </span>
                      . Clique em{" "}
                      <span className="font-semibold">+ Criar</span>.
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
                      {filteredCategories.length === 0 ? (
                        <div className="px-3 py-4 text-sm text-slate-500 dark:text-slate-400">
                          Nenhuma categoria encontrada.
                        </div>
                      ) : (
                        filteredCategories.map((c) => (
                          <button
                            key={c.id}
                            className={[
                              "flex w-full items-center justify-between px-3 py-3 text-left text-sm hover:bg-slate-50 dark:hover:bg-slate-900",
                              String(c.id) === String(categoryId)
                                ? "bg-slate-50 dark:bg-slate-900"
                                : "",
                            ].join(" ")}
                            onClick={() => setCategoryId(String(c.id))}
                          >
                            <span className="flex min-w-0 items-center gap-2">
                              <span
                                className="h-3 w-3 rounded-full border border-slate-200 dark:border-slate-800"
                                style={{
                                  backgroundColor: c.color || "#64748b",
                                }}
                              />
                              <span className="truncate font-medium">
                                {c.name}
                              </span>
                            </span>
                            <span className="text-xs text-slate-500 dark:text-slate-400">
                              {c.color || ""}
                            </span>
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* STEP 3 */}
              {step === 3 && (
                <div className="space-y-3">
                  <div className="text-sm font-semibold">Detalhes</div>

                  <div className="grid gap-3 md:grid-cols-2">
                    <div>
                      <div className="text-xs text-slate-500 dark:text-slate-400">
                        Data
                      </div>
                      <FancyDateInput
                        ref={focusRef}
                        className="mt-2"
                        value={date}
                        onChange={setDate}
                        disabled={busy}
                      />
                    </div>
                    <div>
                      <div className="text-xs text-slate-500 dark:text-slate-400">
                        Descrição (opcional)
                      </div>
                      <textarea
                        className="mt-2 w-full resize-none rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-600/30 dark:border-slate-800 dark:bg-slate-950"
                        rows={3}
                        placeholder="Ex.: almoço, uber, salário..."
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        disabled={busy}
                      />

                      {descriptionSuggestions.length > 0 && (
                        <div className="mt-2">
                          <div className="text-xs text-slate-500 dark:text-slate-400">
                            Descricoes prontas
                          </div>
                          <div className="mt-2 flex flex-wrap gap-2">
                            {descriptionSuggestions.map((item) => (
                              <button
                                key={item}
                                type="button"
                                onClick={() => setDescription(item)}
                                className="rounded-full border border-slate-200 px-2 py-1 text-xs hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-900"
                              >
                                {item}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* STEP 4 */}
              {step === 4 && (
                <div className="space-y-3">
                  <div className="text-sm font-semibold">Revisão</div>

                  <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-xs text-slate-500 dark:text-slate-400">
                          Tipo
                        </div>
                        <div className="text-sm font-semibold">
                          {type === "income" ? "Receita" : "Despesa"}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs text-slate-500 dark:text-slate-400">
                          Valor
                        </div>
                        <div className="text-lg font-semibold">
                          {money(Number(valueRaw || 0))}
                        </div>
                      </div>
                    </div>

                    <div className="mt-3 grid gap-3 md:grid-cols-3">
                      <div>
                        <div className="text-xs text-slate-500 dark:text-slate-400">
                          Conta
                        </div>
                        <div className="text-sm font-semibold">
                          {selectedAccount?.name || "-"}
                        </div>
                        <div className="text-xs text-slate-500 dark:text-slate-400">
                          {selectedAccount?.type || ""}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-slate-500 dark:text-slate-400">
                          Categoria
                        </div>
                        <div className="text-sm font-semibold">
                          {selectedCategory?.name || "-"}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-slate-500 dark:text-slate-400">
                          Data
                        </div>
                        <div className="text-sm font-semibold">{date}</div>
                      </div>
                    </div>

                    {description?.trim() && (
                      <div className="mt-3">
                        <div className="text-xs text-slate-500 dark:text-slate-400">
                          Descrição
                        </div>
                        <div className="text-sm font-semibold">
                          {description.trim()}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    Dicas: Enter avança • ESC fecha • clique fora fecha
                  </div>
                </div>
              )}

              {err && (
                <div className="mt-3 text-sm font-semibold text-rose-500">
                  {err}
                </div>
              )}
            </>
          )}
        </div>

        {/* footer */}
        {!quickMode && (
          <div className="flex flex-col-reverse gap-2 border-t border-slate-100 px-4 py-3 sm:flex-row sm:items-center sm:justify-between dark:border-slate-800">
            <button
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm hover:bg-slate-50 disabled:opacity-60 sm:w-auto dark:border-slate-800 dark:bg-slate-950 dark:hover:bg-slate-900"
              onClick={goBack}
              disabled={busy || step === 0}
            >
              Voltar
            </button>

            {step < 4 ? (
              <button
                className="w-full rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60 sm:w-auto"
                onClick={goNext}
                disabled={busy}
              >
                Continuar
              </button>
            ) : (
              <button
                className="w-full rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60 sm:w-auto"
                onClick={handleSave}
                disabled={busy}
              >
                Salvar transação
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}


