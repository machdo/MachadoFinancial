import { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";
import { API_BASE, authHeaders, money, monthKeyLabel } from "../lib/finance";

function parseMoneyInput(raw) {
  const cleaned = String(raw ?? "").replace(/\s/g, "").replace(/\./g, "").replace(",", ".");
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : NaN;
}

function parsePercentInput(raw) {
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0 || value > 100) return NaN;
  return value;
}

function monthOptions(year) {
  return Array.from({ length: 12 }, (_, index) => {
    const month = index + 1;
    const key = `${year}-${String(month).padStart(2, "0")}`;
    return { value: month, label: monthKeyLabel(key) };
  });
}

export default function Budgets({ categories = [], accounts = [] }) {
  const now = useMemo(() => new Date(), []);
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [overview, setOverview] = useState(null);

  const expenseCategories = useMemo(
    () =>
      categories
        .filter((category) => String(category.type || "expense") === "expense")
        .sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""))),
    [categories],
  );

  const [categoryId, setCategoryId] = useState("");
  const [categoryAmount, setCategoryAmount] = useState("");
  const [categoryAlertPercent, setCategoryAlertPercent] = useState("80");

  const [annualAmount, setAnnualAmount] = useState("");
  const [annualAlertPercent, setAnnualAlertPercent] = useState("80");

  const [accountId, setAccountId] = useState("");
  const [accountMonthlyLimit, setAccountMonthlyLimit] = useState("");
  const [accountAlertPercent, setAccountAlertPercent] = useState("80");

  const loadOverview = useCallback(async () => {
    setError("");
    setLoading(true);
    try {
      const response = await axios.get(
        `${API_BASE}/budgets/overview?year=${year}&month=${month}&months=12`,
        { headers: authHeaders() },
      );
      const data = response.data;
      setOverview(data);
      setAnnualAmount(data?.annualComparison?.plannedAmount ? String(data.annualComparison.plannedAmount) : "");
      setAnnualAlertPercent(String(data?.annualComparison?.alertPercent ?? 80));
    } catch (requestError) {
      setError(
        requestError?.response?.data?.error ||
          "Nao foi possivel carregar os dados de orcamento.",
      );
    } finally {
      setLoading(false);
    }
  }, [month, year]);

  useEffect(() => {
    loadOverview();
  }, [loadOverview]);

  useEffect(() => {
    if (!categoryId && expenseCategories.length > 0) {
      setCategoryId(String(expenseCategories[0].id));
    }
  }, [categoryId, expenseCategories]);

  useEffect(() => {
    if (!accountId && accounts.length > 0) {
      setAccountId(String(accounts[0].id));
    }
  }, [accountId, accounts]);

  async function handleSaveCategoryBudget(event) {
    event.preventDefault();
    if (busy) return;

    const parsedAmount = parseMoneyInput(categoryAmount);
    const parsedAlert = parsePercentInput(categoryAlertPercent);
    if (!categoryId) {
      setError("Selecione uma categoria de despesa.");
      return;
    }
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setError("Informe um valor valido para o orcamento da categoria.");
      return;
    }
    if (!Number.isFinite(parsedAlert)) {
      setError("Informe um alerta entre 1 e 100.");
      return;
    }

    setError("");
    setBusy(true);
    try {
      await axios.post(
        `${API_BASE}/budgets/categories`,
        {
          categoryId: Number(categoryId),
          year,
          month,
          amount: parsedAmount,
          alertPercent: parsedAlert,
        },
        { headers: authHeaders() },
      );
      setCategoryAmount("");
      await loadOverview();
    } catch (requestError) {
      setError(
        requestError?.response?.data?.error ||
          "Nao foi possivel salvar o orcamento da categoria.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteCategoryBudget(id) {
    if (busy) return;
    const confirmed = window.confirm("Deseja excluir este orcamento de categoria?");
    if (!confirmed) return;

    setError("");
    setBusy(true);
    try {
      await axios.delete(`${API_BASE}/budgets/categories/${id}`, {
        headers: authHeaders(),
      });
      await loadOverview();
    } catch (requestError) {
      setError(
        requestError?.response?.data?.error ||
          "Nao foi possivel excluir o orcamento da categoria.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveAnnualBudget(event) {
    event.preventDefault();
    if (busy) return;

    const parsedAmount = parseMoneyInput(annualAmount);
    const parsedAlert = parsePercentInput(annualAlertPercent);

    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setError("Informe um valor valido para o orcamento anual.");
      return;
    }
    if (!Number.isFinite(parsedAlert)) {
      setError("Informe um alerta anual entre 1 e 100.");
      return;
    }

    setError("");
    setBusy(true);
    try {
      await axios.post(
        `${API_BASE}/budgets/annual`,
        { year, amount: parsedAmount, alertPercent: parsedAlert },
        { headers: authHeaders() },
      );
      await loadOverview();
    } catch (requestError) {
      setError(
        requestError?.response?.data?.error || "Nao foi possivel salvar o orcamento anual.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteAnnualBudget() {
    if (busy) return;
    const annualId = overview?.annualComparison?.id;
    if (!annualId) return;

    const confirmed = window.confirm("Deseja excluir o orcamento anual deste ano?");
    if (!confirmed) return;

    setError("");
    setBusy(true);
    try {
      await axios.delete(`${API_BASE}/budgets/annual/${annualId}`, {
        headers: authHeaders(),
      });
      setAnnualAmount("");
      setAnnualAlertPercent("80");
      await loadOverview();
    } catch (requestError) {
      setError(
        requestError?.response?.data?.error || "Nao foi possivel excluir o orcamento anual.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveAccountLimit(event) {
    event.preventDefault();
    if (busy) return;

    const parsedLimit = parseMoneyInput(accountMonthlyLimit);
    const parsedAlert = parsePercentInput(accountAlertPercent);

    if (!accountId) {
      setError("Selecione uma conta.");
      return;
    }
    if (!Number.isFinite(parsedLimit) || parsedLimit <= 0) {
      setError("Informe um limite mensal valido para a conta.");
      return;
    }
    if (!Number.isFinite(parsedAlert)) {
      setError("Informe um alerta entre 1 e 100 para o limite da conta.");
      return;
    }

    setError("");
    setBusy(true);
    try {
      await axios.post(
        `${API_BASE}/budgets/accounts`,
        {
          accountId: Number(accountId),
          monthlyLimit: parsedLimit,
          alertPercent: parsedAlert,
        },
        { headers: authHeaders() },
      );
      setAccountMonthlyLimit("");
      await loadOverview();
    } catch (requestError) {
      setError(
        requestError?.response?.data?.error || "Nao foi possivel salvar o limite da conta.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteAccountLimit(id) {
    if (busy) return;
    const confirmed = window.confirm("Deseja excluir este limite por conta?");
    if (!confirmed) return;

    setError("");
    setBusy(true);
    try {
      await axios.delete(`${API_BASE}/budgets/accounts/${id}`, {
        headers: authHeaders(),
      });
      await loadOverview();
    } catch (requestError) {
      setError(
        requestError?.response?.data?.error || "Nao foi possivel excluir o limite da conta.",
      );
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500 shadow-sm dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400">
        Carregando orcamentos...
      </div>
    );
  }

  const monthlyComparison = overview?.monthlyComparison ?? {
    plannedAmount: 0,
    realizedAmount: 0,
    differenceAmount: 0,
    progressPercent: 0,
  };
  const annualComparison = overview?.annualComparison ?? {
    id: null,
    plannedAmount: 0,
    realizedAmount: 0,
    differenceAmount: 0,
    progressPercent: 0,
    alertPercent: null,
    alertTriggered: false,
  };

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="text-sm font-semibold">Planejamento de orcamento</div>
            <div className="text-xs text-slate-500 dark:text-slate-400">
              Orcamento mensal por categoria, orcamento anual e limite por conta.
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <select
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-600/30 dark:border-slate-800 dark:bg-slate-950"
              value={month}
              onChange={(event) => setMonth(Number(event.target.value))}
              disabled={busy}
            >
              {monthOptions(year).map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>

            <input
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-600/30 dark:border-slate-800 dark:bg-slate-950"
              type="number"
              min={2000}
              max={2100}
              value={year}
              onChange={(event) => {
                const parsedYear = Number(event.target.value);
                setYear(Number.isInteger(parsedYear) ? parsedYear : now.getFullYear());
              }}
              disabled={busy}
            />
          </div>
        </div>

        {error && (
          <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300">
            {error}
          </div>
        )}
      </section>

      <div className="grid gap-3 md:grid-cols-2">
        <SummaryCard
          title="Comparativo mensal (planejado vs realizado)"
          planned={monthlyComparison.plannedAmount}
          realized={monthlyComparison.realizedAmount}
          difference={monthlyComparison.differenceAmount}
          progressPercent={monthlyComparison.progressPercent}
        />
        <SummaryCard
          title={`Comparativo anual ${year} (planejado vs realizado)`}
          planned={annualComparison.plannedAmount}
          realized={annualComparison.realizedAmount}
          difference={annualComparison.differenceAmount}
          progressPercent={annualComparison.progressPercent}
          alertPercent={annualComparison.alertPercent}
          alertTriggered={annualComparison.alertTriggered}
        />
      </div>

      <section className="grid gap-4 lg:grid-cols-2">
        <Card title="Orcamento mensal por categoria">
          <form className="grid gap-2 md:grid-cols-4" onSubmit={handleSaveCategoryBudget}>
            <select
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-600/30 dark:border-slate-800 dark:bg-slate-950"
              value={categoryId}
              onChange={(event) => setCategoryId(event.target.value)}
              disabled={busy || expenseCategories.length === 0}
            >
              {expenseCategories.length === 0 && (
                <option value="">Sem categorias de despesa</option>
              )}
              {expenseCategories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>

            <input
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-600/30 dark:border-slate-800 dark:bg-slate-950"
              placeholder="Valor planejado"
              inputMode="decimal"
              value={categoryAmount}
              onChange={(event) => setCategoryAmount(event.target.value)}
              disabled={busy}
            />

            <input
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-600/30 dark:border-slate-800 dark:bg-slate-950"
              placeholder="Alerta %"
              type="number"
              min={1}
              max={100}
              value={categoryAlertPercent}
              onChange={(event) => setCategoryAlertPercent(event.target.value)}
              disabled={busy}
            />

            <button
              type="submit"
              className="rounded-xl bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
              disabled={busy || expenseCategories.length === 0}
            >
              Salvar
            </button>
          </form>

          <div className="mt-3 space-y-2">
            {(overview?.categoryProgress ?? []).map((item) => (
              <div
                key={item.id}
                className="rounded-xl border border-slate-200 px-3 py-3 dark:border-slate-800"
              >
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="text-sm font-medium">{item.categoryName}</div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">
                      Planejado {money(item.plannedAmount)} | Realizado {money(item.realizedAmount)}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {item.alertTriggered && (
                      <span className="rounded-full bg-amber-100 px-2 py-1 text-[10px] font-semibold text-amber-700 dark:bg-amber-950 dark:text-amber-200">
                        alerta {item.alertPercent}%
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => handleDeleteCategoryBudget(item.id)}
                      className="rounded-lg border border-rose-200 px-2 py-1 text-xs text-rose-700 hover:bg-rose-50 dark:border-rose-900 dark:text-rose-300 dark:hover:bg-rose-950/30"
                      disabled={busy}
                    >
                      Excluir
                    </button>
                  </div>
                </div>

                <div className="mt-2">
                  <ProgressBar
                    percent={item.progressPercent}
                    alertPercent={item.alertPercent}
                  />
                </div>

                <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                  Restante: {money(item.remainingAmount)}
                </div>
              </div>
            ))}
            {(overview?.categoryProgress ?? []).length === 0 && (
              <div className="py-4 text-center text-sm text-slate-500 dark:text-slate-400">
                Nenhum orcamento mensal por categoria para o periodo selecionado.
              </div>
            )}
          </div>
        </Card>

        <Card title="Orcamento anual">
          <form className="grid gap-2 md:grid-cols-3" onSubmit={handleSaveAnnualBudget}>
            <input
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-600/30 dark:border-slate-800 dark:bg-slate-950"
              placeholder="Valor anual planejado"
              inputMode="decimal"
              value={annualAmount}
              onChange={(event) => setAnnualAmount(event.target.value)}
              disabled={busy}
            />

            <input
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-600/30 dark:border-slate-800 dark:bg-slate-950"
              placeholder="Alerta %"
              type="number"
              min={1}
              max={100}
              value={annualAlertPercent}
              onChange={(event) => setAnnualAlertPercent(event.target.value)}
              disabled={busy}
            />

            <button
              type="submit"
              className="rounded-xl bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
              disabled={busy}
            >
              Salvar anual
            </button>
          </form>

          <div className="mt-4 rounded-xl border border-slate-200 p-3 dark:border-slate-800">
            <div className="text-sm font-medium">Ano {year}</div>
            <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Planejado {money(annualComparison.plannedAmount)} | Realizado{" "}
              {money(annualComparison.realizedAmount)}
            </div>
            <div className="mt-2">
              <ProgressBar
                percent={annualComparison.progressPercent}
                alertPercent={annualComparison.alertPercent ?? 80}
              />
            </div>
            {annualComparison.alertTriggered && (
              <div className="mt-2 text-xs font-medium text-amber-600">
                Alerta: orcamento anual atingiu {annualComparison.alertPercent}%.
              </div>
            )}

            {annualComparison.id && (
              <button
                type="button"
                onClick={handleDeleteAnnualBudget}
                className="mt-3 rounded-lg border border-rose-200 px-3 py-1 text-xs text-rose-700 hover:bg-rose-50 dark:border-rose-900 dark:text-rose-300 dark:hover:bg-rose-950/30"
                disabled={busy}
              >
                Excluir orcamento anual
              </button>
            )}
          </div>
        </Card>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <Card title="Limite por conta">
          <form className="grid gap-2 md:grid-cols-4" onSubmit={handleSaveAccountLimit}>
            <select
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-600/30 dark:border-slate-800 dark:bg-slate-950"
              value={accountId}
              onChange={(event) => setAccountId(event.target.value)}
              disabled={busy || accounts.length === 0}
            >
              {accounts.length === 0 && <option value="">Sem contas</option>}
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
            </select>

            <input
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-600/30 dark:border-slate-800 dark:bg-slate-950"
              placeholder="Limite mensal"
              inputMode="decimal"
              value={accountMonthlyLimit}
              onChange={(event) => setAccountMonthlyLimit(event.target.value)}
              disabled={busy}
            />

            <input
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-600/30 dark:border-slate-800 dark:bg-slate-950"
              placeholder="Alerta %"
              type="number"
              min={1}
              max={100}
              value={accountAlertPercent}
              onChange={(event) => setAccountAlertPercent(event.target.value)}
              disabled={busy}
            />

            <button
              type="submit"
              className="rounded-xl bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
              disabled={busy || accounts.length === 0}
            >
              Salvar limite
            </button>
          </form>

          <div className="mt-3 space-y-2">
            {(overview?.accountLimitProgress ?? []).map((item) => (
              <div
                key={item.id}
                className="rounded-xl border border-slate-200 px-3 py-3 dark:border-slate-800"
              >
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="text-sm font-medium">{item.accountName}</div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">
                      Limite {money(item.monthlyLimit)} | Gasto {money(item.realizedAmount)}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {item.alertTriggered && (
                      <span className="rounded-full bg-amber-100 px-2 py-1 text-[10px] font-semibold text-amber-700 dark:bg-amber-950 dark:text-amber-200">
                        alerta {item.alertPercent}%
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => handleDeleteAccountLimit(item.id)}
                      className="rounded-lg border border-rose-200 px-2 py-1 text-xs text-rose-700 hover:bg-rose-50 dark:border-rose-900 dark:text-rose-300 dark:hover:bg-rose-950/30"
                      disabled={busy}
                    >
                      Excluir
                    </button>
                  </div>
                </div>

                <div className="mt-2">
                  <ProgressBar
                    percent={item.progressPercent}
                    alertPercent={item.alertPercent}
                  />
                </div>

                <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                  Restante: {money(item.remainingAmount)}
                </div>
              </div>
            ))}
            {(overview?.accountLimitProgress ?? []).length === 0 && (
              <div className="py-4 text-center text-sm text-slate-500 dark:text-slate-400">
                Nenhum limite por conta cadastrado.
              </div>
            )}
          </div>
        </Card>

        <Card title="Alertas de orcamento">
          <div className="space-y-2">
            {(overview?.alerts ?? []).map((alert) => (
              <div
                key={`${alert.kind}-${alert.targetId}`}
                className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 dark:border-amber-900 dark:bg-amber-950/30"
              >
                <div className="text-sm font-medium text-amber-700 dark:text-amber-200">
                  {alert.kind === "category" && "Categoria"}
                  {alert.kind === "account" && "Conta"}
                  {alert.kind === "annual" && "Anual"}: {alert.targetName}
                </div>
                <div className="mt-1 text-xs text-amber-700/90 dark:text-amber-200">
                  {alert.progressPercent.toFixed(1)}% usado (alerta em {alert.alertPercent}%)
                </div>
                <div className="mt-1 text-xs text-amber-700/90 dark:text-amber-200">
                  Planejado {money(alert.plannedAmount)} | Realizado {money(alert.realizedAmount)}
                </div>
              </div>
            ))}

            {(overview?.alerts ?? []).length === 0 && (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-4 text-sm text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200">
                Nenhum alerta ativo para o periodo selecionado.
              </div>
            )}
          </div>
        </Card>
      </section>

      <Card title="Historico de orcamento por mes">
        <div className="overflow-x-auto">
          <table className="min-w-[720px] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:text-slate-400">
                <th className="px-2 py-2 font-medium">Mes</th>
                <th className="px-2 py-2 font-medium text-right">Planejado</th>
                <th className="px-2 py-2 font-medium text-right">Realizado</th>
                <th className="px-2 py-2 font-medium text-right">Diferenca</th>
                <th className="px-2 py-2 font-medium text-right">% uso</th>
              </tr>
            </thead>
            <tbody>
              {(overview?.history ?? []).map((item) => (
                <tr
                  key={item.month}
                  className="border-b border-slate-100 dark:border-slate-900"
                >
                  <td className="px-2 py-2">{monthKeyLabel(item.month)}</td>
                  <td className="px-2 py-2 text-right">{money(item.plannedAmount)}</td>
                  <td className="px-2 py-2 text-right">{money(item.realizedAmount)}</td>
                  <td
                    className={[
                      "px-2 py-2 text-right font-medium",
                      item.differenceAmount >= 0 ? "text-emerald-600" : "text-rose-600",
                    ].join(" ")}
                  >
                    {money(item.differenceAmount)}
                  </td>
                  <td className="px-2 py-2 text-right">{item.progressPercent.toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>

          {(overview?.history ?? []).length === 0 && (
            <div className="py-6 text-center text-sm text-slate-500 dark:text-slate-400">
              Sem historico de orcamento para exibir.
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}

function Card({ title, children }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950">
      <div className="mb-3 text-sm font-semibold">{title}</div>
      {children}
    </section>
  );
}

function ProgressBar({ percent, alertPercent }) {
  const normalized = Number(percent) || 0;
  const cap = Math.max(0, Math.min(100, normalized));
  const tone =
    normalized >= 100
      ? "bg-rose-500"
      : normalized >= Number(alertPercent || 80)
      ? "bg-amber-500"
      : "bg-emerald-500";

  return (
    <div>
      <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
        <div className={["h-full rounded-full transition-all", tone].join(" ")} style={{ width: `${cap}%` }} />
      </div>
      <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
        {normalized.toFixed(1)}%
      </div>
    </div>
  );
}

function SummaryCard({
  title,
  planned,
  realized,
  difference,
  progressPercent,
  alertPercent = null,
  alertTriggered = false,
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950">
      <div className="text-sm font-semibold">{title}</div>
      <div className="mt-2 grid gap-2 text-sm sm:grid-cols-3">
        <div>
          <div className="text-xs text-slate-500 dark:text-slate-400">Planejado</div>
          <div className="font-semibold">{money(planned)}</div>
        </div>
        <div>
          <div className="text-xs text-slate-500 dark:text-slate-400">Realizado</div>
          <div className="font-semibold">{money(realized)}</div>
        </div>
        <div>
          <div className="text-xs text-slate-500 dark:text-slate-400">Diferenca</div>
          <div className={difference >= 0 ? "font-semibold text-emerald-600" : "font-semibold text-rose-600"}>
            {money(difference)}
          </div>
        </div>
      </div>
      <div className="mt-3">
        <ProgressBar percent={progressPercent} alertPercent={alertPercent ?? 80} />
      </div>
      {alertPercent && (
        <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">
          Alerta configurado em {alertPercent}%.
        </div>
      )}
      {alertTriggered && (
        <div className="mt-1 text-xs font-medium text-amber-600">Alerta atingido.</div>
      )}
    </div>
  );
}
