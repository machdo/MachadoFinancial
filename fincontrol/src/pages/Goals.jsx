import { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";
import { API_BASE, authHeaders, money, todayISO, ymd } from "../lib/finance";
import FancyDateInput from "../components/FancyDateInput";

function parseNumber(value) {
  const normalized = String(value ?? "").replace(/\./g, "").replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function progress(current, target) {
  if (target <= 0) return 0;
  return Math.max(0, Math.min(100, (current / target) * 100));
}

export default function Goals() {
  const [goals, setGoals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const [name, setName] = useState("");
  const [targetValue, setTargetValue] = useState("");
  const [currentValue, setCurrentValue] = useState("0");
  const [deadline, setDeadline] = useState(todayISO());

  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState("");
  const [editTargetValue, setEditTargetValue] = useState("");
  const [editCurrentValue, setEditCurrentValue] = useState("0");
  const [editDeadline, setEditDeadline] = useState(todayISO());
  const [rowBusyId, setRowBusyId] = useState(null);

  const loadGoals = useCallback(async () => {
    setError("");
    setLoading(true);
    try {
      const response = await axios.get(`${API_BASE}/goals`, {
        headers: authHeaders(),
      });
      setGoals(response.data ?? []);
    } catch (requestError) {
      setError(
        requestError?.response?.data?.error || "Nao foi possivel carregar metas.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadGoals();
  }, [loadGoals]);

  const summary = useMemo(() => {
    const target = goals.reduce((sum, goal) => sum + goal.targetValue, 0);
    const current = goals.reduce((sum, goal) => sum + goal.currentValue, 0);
    return { target, current, pending: target - current };
  }, [goals]);

  const orderedGoals = useMemo(() => {
    return [...goals].sort((a, b) => new Date(a.deadline) - new Date(b.deadline));
  }, [goals]);

  async function handleCreate(event) {
    event.preventDefault();
    if (!name.trim()) {
      setError("Informe o nome da meta.");
      return;
    }
    if (!targetValue || parseNumber(targetValue) <= 0) {
      setError("Informe um valor alvo valido.");
      return;
    }

    setBusy(true);
    setError("");

    try {
      const response = await axios.post(
        `${API_BASE}/goals`,
        {
          name: name.trim(),
          targetValue: parseNumber(targetValue),
          currentValue: parseNumber(currentValue),
          deadline,
        },
        { headers: authHeaders() },
      );

      setGoals((previous) => [response.data, ...previous]);
      setName("");
      setTargetValue("");
      setCurrentValue("0");
      setDeadline(todayISO());
    } catch (requestError) {
      setError(requestError?.response?.data?.error || "Nao foi possivel criar meta.");
    } finally {
      setBusy(false);
    }
  }

  function startEdit(goal) {
    setError("");
    setEditingId(goal.id);
    setEditName(goal.name ?? "");
    setEditTargetValue(String(goal.targetValue ?? ""));
    setEditCurrentValue(String(goal.currentValue ?? 0));
    setEditDeadline(ymd(goal.deadline));
  }

  function cancelEdit() {
    setEditingId(null);
    setEditName("");
    setEditTargetValue("");
    setEditCurrentValue("0");
    setEditDeadline(todayISO());
  }

  async function handleSaveEdit(goalId) {
    if (!editName.trim()) {
      setError("Informe o nome da meta.");
      return;
    }
    if (!editTargetValue || parseNumber(editTargetValue) <= 0) {
      setError("Informe um valor alvo valido.");
      return;
    }

    setError("");
    setRowBusyId(goalId);

    try {
      const response = await axios.put(
        `${API_BASE}/goals/${goalId}`,
        {
          name: editName.trim(),
          targetValue: parseNumber(editTargetValue),
          currentValue: parseNumber(editCurrentValue),
          deadline: editDeadline,
        },
        { headers: authHeaders() },
      );

      setGoals((previous) =>
        previous.map((goal) => (goal.id === response.data.id ? response.data : goal)),
      );
      cancelEdit();
    } catch (requestError) {
      setError(requestError?.response?.data?.error || "Nao foi possivel editar meta.");
    } finally {
      setRowBusyId(null);
    }
  }

  async function handleDelete(goalId) {
    const confirmed = window.confirm("Deseja excluir esta meta?");
    if (!confirmed) return;

    setError("");
    setRowBusyId(goalId);

    try {
      await axios.delete(`${API_BASE}/goals/${goalId}`, {
        headers: authHeaders(),
      });
      setGoals((previous) => previous.filter((goal) => goal.id !== goalId));
      if (editingId === goalId) cancelEdit();
    } catch (requestError) {
      setError(requestError?.response?.data?.error || "Nao foi possivel excluir meta.");
    } finally {
      setRowBusyId(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-3">
        <SummaryCard title="Valor alvo" value={money(summary.target)} />
        <SummaryCard title="Acumulado" value={money(summary.current)} tone="emerald" />
        <SummaryCard title="Faltante" value={money(summary.pending)} tone="amber" />
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950">
        <div className="text-sm font-semibold">Nova meta</div>

        <form className="mt-3 grid gap-3 md:grid-cols-4" onSubmit={handleCreate}>
          <input
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-600/30 dark:border-slate-800 dark:bg-slate-950"
            placeholder="Ex.: Reserva de emergencia"
            value={name}
            onChange={(event) => setName(event.target.value)}
            disabled={busy}
          />

          <input
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-600/30 dark:border-slate-800 dark:bg-slate-950"
            placeholder="Valor alvo"
            inputMode="decimal"
            value={targetValue}
            onChange={(event) => setTargetValue(event.target.value)}
            disabled={busy}
          />

          <input
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-600/30 dark:border-slate-800 dark:bg-slate-950"
            placeholder="Valor atual"
            inputMode="decimal"
            value={currentValue}
            onChange={(event) => setCurrentValue(event.target.value)}
            disabled={busy}
          />

          <FancyDateInput
            value={deadline}
            onChange={setDeadline}
            disabled={busy}
          />

          <button
            type="submit"
            className="rounded-xl bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60 md:col-span-4"
            disabled={busy}
          >
            Criar meta
          </button>
        </form>

        {error && <div className="mt-3 text-sm font-medium text-rose-600">{error}</div>}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950">
        <div className="mb-3 text-sm font-semibold">Metas cadastradas</div>

        {loading && (
          <div className="py-8 text-center text-sm text-slate-500 dark:text-slate-400">
            Carregando metas...
          </div>
        )}

        {!loading && (
          <div className="space-y-3">
            {orderedGoals.map((goal) => {
              const pct = progress(goal.currentValue, goal.targetValue);
              const isEditing = editingId === goal.id;
              const isRowBusy = rowBusyId === goal.id;

              return (
                <div
                  key={goal.id}
                  className="rounded-xl border border-slate-200 p-3 dark:border-slate-800"
                >
                  {!isEditing && (
                    <>
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-sm font-medium">{goal.name}</div>
                          <div className="text-xs text-slate-500 dark:text-slate-400">
                            Prazo: {ymd(goal.deadline)}
                          </div>
                        </div>

                        <div className="text-right">
                          <div className="text-sm font-semibold">
                            {money(goal.currentValue)} / {money(goal.targetValue)}
                          </div>
                          <div className="mt-2 flex justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => startEdit(goal)}
                              className="rounded-lg border border-slate-200 px-3 py-1 text-xs hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-900"
                              disabled={isRowBusy}
                            >
                              Editar
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDelete(goal.id)}
                              className="rounded-lg border border-rose-200 px-3 py-1 text-xs text-rose-700 hover:bg-rose-50 dark:border-rose-900 dark:text-rose-300 dark:hover:bg-rose-950/30"
                              disabled={isRowBusy}
                            >
                              Excluir
                            </button>
                          </div>
                        </div>
                      </div>

                      <div className="mt-2 h-2 rounded-full bg-slate-100 dark:bg-slate-800">
                        <div
                          className="h-2 rounded-full bg-blue-600"
                          style={{ width: `${pct}%` }}
                        />
                      </div>

                      <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                        {pct.toFixed(1)}% concluido
                      </div>
                    </>
                  )}

                  {isEditing && (
                    <div className="space-y-3">
                      <div className="grid gap-2 md:grid-cols-2">
                        <input
                          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-600/30 dark:border-slate-800 dark:bg-slate-950"
                          value={editName}
                          onChange={(event) => setEditName(event.target.value)}
                          disabled={isRowBusy}
                        />
                        <FancyDateInput
                          value={editDeadline}
                          onChange={setEditDeadline}
                          disabled={isRowBusy}
                        />
                        <input
                          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-600/30 dark:border-slate-800 dark:bg-slate-950"
                          value={editTargetValue}
                          onChange={(event) => setEditTargetValue(event.target.value)}
                          inputMode="decimal"
                          disabled={isRowBusy}
                        />
                        <input
                          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-600/30 dark:border-slate-800 dark:bg-slate-950"
                          value={editCurrentValue}
                          onChange={(event) => setEditCurrentValue(event.target.value)}
                          inputMode="decimal"
                          disabled={isRowBusy}
                        />
                      </div>

                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => handleSaveEdit(goal.id)}
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
                          onClick={() => handleDelete(goal.id)}
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

        {!loading && orderedGoals.length === 0 && (
          <div className="py-8 text-center text-sm text-slate-500 dark:text-slate-400">
            Nenhuma meta cadastrada.
          </div>
        )}
      </section>
    </div>
  );
}

function SummaryCard({ title, value, tone = "blue" }) {
  const tones = {
    blue: "text-blue-700 dark:text-blue-200",
    emerald: "text-emerald-700 dark:text-emerald-200",
    amber: "text-amber-700 dark:text-amber-200",
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950">
      <div className="text-xs text-slate-500 dark:text-slate-400">{title}</div>
      <div className={["mt-1 text-xl font-semibold", tones[tone] ?? tones.blue].join(" ")}>
        {value}
      </div>
    </div>
  );
}
