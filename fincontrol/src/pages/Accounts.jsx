import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { API_BASE, authHeaders, money } from "../lib/finance";
import {
  getDefaultAccountId,
  setDefaultAccountId,
} from "../lib/accountPreferences";

const ACCOUNT_TYPES = [
  { value: "checking", label: "Conta corrente" },
  { value: "wallet", label: "Carteira" },
  { value: "savings", label: "Poupanca" },
  { value: "credit", label: "Cartao de credito" },
];

function normalizeNumber(value) {
  const normalized = String(value ?? "").replace(/\./g, "").replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function deletionErrorMessage(requestError, fallback) {
  const apiError = requestError?.response?.data;
  if (!apiError) return fallback;
  if (apiError.reason) return `${apiError.error} ${apiError.reason}`;
  return apiError.error || fallback;
}

export default function Accounts({
  accounts = [],
  transactions = [],
  onAccountCreated,
  onAccountUpdated,
  onAccountDeleted,
}) {
  const [name, setName] = useState("");
  const [type, setType] = useState("checking");
  const [balance, setBalance] = useState("0");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState("");
  const [editType, setEditType] = useState("checking");
  const [editBalance, setEditBalance] = useState("0");
  const [editIsDefault, setEditIsDefault] = useState(false);
  const [rowBusyId, setRowBusyId] = useState(null);
  const [defaultAccountId, setDefaultAccountIdState] = useState(() =>
    getDefaultAccountId(),
  );
  const [transferFromId, setTransferFromId] = useState("");
  const [transferToId, setTransferToId] = useState("");
  const [transferAmount, setTransferAmount] = useState("");
  const [transferBusy, setTransferBusy] = useState(false);
  const [transferError, setTransferError] = useState("");
  const [transferSuccess, setTransferSuccess] = useState("");
  const [recurringRules, setRecurringRules] = useState([]);
  const [recurringBusy, setRecurringBusy] = useState(false);
  const [recurringFromId, setRecurringFromId] = useState("");
  const [recurringToId, setRecurringToId] = useState("");
  const [recurringAmount, setRecurringAmount] = useState("");
  const [recurringFrequency, setRecurringFrequency] = useState("monthly");
  const [recurringInterval, setRecurringInterval] = useState("1");
  const [recurringStartDate, setRecurringStartDate] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
      now.getDate(),
    ).padStart(2, "0")}`;
  });

  const accountStats = useMemo(() => {
    const map = new Map();
    for (const transaction of transactions) {
      const current = map.get(transaction.accountId) ?? {
        income: 0,
        expense: 0,
        count: 0,
      };
      current.count += 1;
      if (transaction.type === "income") current.income += transaction.value;
      if (transaction.type === "expense") current.expense += transaction.value;
      map.set(transaction.accountId, current);
    }
    return map;
  }, [transactions]);

  useEffect(() => {
    if (accounts.length < 2) {
      setTransferFromId("");
      setTransferToId("");
      return;
    }

    if (!accounts.some((account) => String(account.id) === String(transferFromId))) {
      setTransferFromId(String(accounts[0].id));
    }

    if (!accounts.some((account) => String(account.id) === String(transferToId))) {
      setTransferToId(String(accounts[1]?.id ?? accounts[0]?.id ?? ""));
    }
  }, [accounts, transferFromId, transferToId]);

  useEffect(() => {
    if (accounts.length < 2) {
      setRecurringFromId("");
      setRecurringToId("");
      return;
    }
    if (!accounts.some((account) => String(account.id) === String(recurringFromId))) {
      setRecurringFromId(String(accounts[0].id));
    }
    if (!accounts.some((account) => String(account.id) === String(recurringToId))) {
      setRecurringToId(String(accounts[1]?.id ?? accounts[0]?.id ?? ""));
    }
  }, [accounts, recurringFromId, recurringToId]);

  useEffect(() => {
    async function loadRecurringRules() {
      try {
        const response = await axios.get(`${API_BASE}/accounts/transfer-recurring`, {
          headers: authHeaders(),
        });
        setRecurringRules(response?.data ?? []);
      } catch {
        setRecurringRules([]);
      }
    }
    loadRecurringRules();
  }, []);

  async function handleCreate(event) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Informe um nome de conta.");
      return;
    }

    setError("");
    setBusy(true);

    try {
      const response = await axios.post(
        `${API_BASE}/accounts`,
        { name: trimmed, type, balance: normalizeNumber(balance) },
        { headers: authHeaders() },
      );
      onAccountCreated?.(response.data);
      setName("");
      setType("checking");
      setBalance("0");
    } catch (requestError) {
      setError(requestError?.response?.data?.error || "Nao foi possivel criar conta.");
    } finally {
      setBusy(false);
    }
  }

  function startEdit(account) {
    setError("");
    setEditingId(account.id);
    setEditName(account.name ?? "");
    setEditType(account.type ?? "checking");
    setEditBalance(String(account.balance ?? 0));
    setEditIsDefault(String(account.id) === String(defaultAccountId));
  }

  function cancelEdit() {
    setEditingId(null);
    setEditName("");
    setEditType("checking");
    setEditBalance("0");
    setEditIsDefault(false);
  }

  async function handleSaveEdit(accountId) {
    const trimmed = editName.trim();
    if (!trimmed) {
      setError("Informe um nome de conta.");
      return;
    }

    setError("");
    setRowBusyId(accountId);

    try {
      const response = await axios.put(
        `${API_BASE}/accounts/${accountId}`,
        {
          name: trimmed,
          type: editType,
          balance: normalizeNumber(editBalance),
        },
        { headers: authHeaders() },
      );

      onAccountUpdated?.(response.data);
      const idText = String(accountId);
      if (editIsDefault) {
        setDefaultAccountId(idText);
        setDefaultAccountIdState(idText);
      } else if (String(defaultAccountId) === idText) {
        setDefaultAccountId("");
        setDefaultAccountIdState("");
      }
      cancelEdit();
    } catch (requestError) {
      setError(requestError?.response?.data?.error || "Nao foi possivel editar conta.");
    } finally {
      setRowBusyId(null);
    }
  }

  async function handleDelete(accountId) {
    const confirmed = window.confirm("Deseja excluir esta conta?");
    if (!confirmed) return;

    setError("");
    setRowBusyId(accountId);

    try {
      await axios.delete(`${API_BASE}/accounts/${accountId}`, {
        headers: authHeaders(),
      });
      onAccountDeleted?.(accountId);
      if (String(defaultAccountId) === String(accountId)) {
        setDefaultAccountId("");
        setDefaultAccountIdState("");
      }
      if (editingId === accountId) cancelEdit();
    } catch (requestError) {
      setError(
        deletionErrorMessage(
          requestError,
          "Nao foi possivel excluir conta.",
        ),
      );
    } finally {
      setRowBusyId(null);
    }
  }

  async function handleTransfer(event) {
    event.preventDefault();
    if (transferBusy) return;

    setTransferError("");
    setTransferSuccess("");

    if (accounts.length < 2) {
      setTransferError("Cadastre pelo menos duas contas para transferir saldo.");
      return;
    }

    if (!transferFromId || !transferToId) {
      setTransferError("Selecione conta de origem e conta de destino.");
      return;
    }

    if (String(transferFromId) === String(transferToId)) {
      setTransferError("A conta de origem deve ser diferente da conta de destino.");
      return;
    }

    const amount = normalizeNumber(transferAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setTransferError("Informe um valor valido para transferir.");
      return;
    }

    setTransferBusy(true);

    try {
      const response = await axios.post(
        `${API_BASE}/accounts/transfer`,
        {
          fromAccountId: Number(transferFromId),
          toAccountId: Number(transferToId),
          amount,
        },
        { headers: authHeaders() },
      );

      const fromAccount = response?.data?.fromAccount;
      const toAccount = response?.data?.toAccount;
      if (fromAccount) onAccountUpdated?.(fromAccount);
      if (toAccount) onAccountUpdated?.(toAccount);

      setTransferAmount("");
      setTransferSuccess(`Transferencia realizada com sucesso: ${money(amount)}.`);
    } catch (requestError) {
      setTransferError(
        requestError?.response?.data?.error ||
          "Nao foi possivel transferir saldo entre contas.",
      );
    } finally {
      setTransferBusy(false);
    }
  }

  async function reloadRecurringTransfers() {
    const response = await axios.get(`${API_BASE}/accounts/transfer-recurring`, {
      headers: authHeaders(),
    });
    setRecurringRules(response?.data ?? []);
  }

  async function handleRecurringCreate(event) {
    event.preventDefault();
    if (recurringBusy) return;

    setTransferError("");
    setTransferSuccess("");
    if (!recurringFromId || !recurringToId) {
      setTransferError("Selecione origem e destino da transferencia recorrente.");
      return;
    }
    if (String(recurringFromId) === String(recurringToId)) {
      setTransferError("Origem e destino da recorrencia devem ser diferentes.");
      return;
    }

    const amount = normalizeNumber(recurringAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setTransferError("Informe um valor valido para recorrencia.");
      return;
    }

    setRecurringBusy(true);
    try {
      await axios.post(
        `${API_BASE}/accounts/transfer-recurring`,
        {
          fromAccountId: Number(recurringFromId),
          toAccountId: Number(recurringToId),
          amount,
          frequency: recurringFrequency,
          interval: Number(recurringInterval || 1),
          startDate: recurringStartDate,
        },
        { headers: authHeaders() },
      );
      setRecurringAmount("");
      await reloadRecurringTransfers();
      setTransferSuccess("Transferencia recorrente criada.");
    } catch (requestError) {
      setTransferError(
        requestError?.response?.data?.error ||
          "Nao foi possivel criar transferencia recorrente.",
      );
    } finally {
      setRecurringBusy(false);
    }
  }

  async function handleRecurringToggle(rule) {
    if (recurringBusy) return;
    setRecurringBusy(true);
    setTransferError("");
    setTransferSuccess("");
    try {
      await axios.put(
        `${API_BASE}/accounts/transfer-recurring/${rule.id}`,
        { active: !rule.active },
        { headers: authHeaders() },
      );
      await reloadRecurringTransfers();
      setTransferSuccess("Regra recorrente atualizada.");
    } catch (requestError) {
      setTransferError(
        requestError?.response?.data?.error ||
          "Nao foi possivel atualizar regra recorrente.",
      );
    } finally {
      setRecurringBusy(false);
    }
  }

  async function handleRecurringDelete(ruleId) {
    if (recurringBusy) return;
    const confirmed = window.confirm("Excluir esta transferencia recorrente?");
    if (!confirmed) return;
    setRecurringBusy(true);
    setTransferError("");
    setTransferSuccess("");
    try {
      await axios.delete(`${API_BASE}/accounts/transfer-recurring/${ruleId}`, {
        headers: authHeaders(),
      });
      await reloadRecurringTransfers();
      setTransferSuccess("Transferencia recorrente excluida.");
    } catch (requestError) {
      setTransferError(
        requestError?.response?.data?.error ||
          "Nao foi possivel excluir transferencia recorrente.",
      );
    } finally {
      setRecurringBusy(false);
    }
  }

  async function handleRunRecurringNow() {
    if (recurringBusy) return;
    setRecurringBusy(true);
    setTransferError("");
    setTransferSuccess("");
    try {
      await axios.post(
        `${API_BASE}/accounts/transfer-recurring/run`,
        {},
        { headers: authHeaders() },
      );
      await Promise.all([reloadRecurringTransfers()]);
      setTransferSuccess("Transferencias recorrentes processadas.");
    } catch (requestError) {
      setTransferError(
        requestError?.response?.data?.error ||
          "Nao foi possivel processar transferencias recorrentes.",
      );
    } finally {
      setRecurringBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <section className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950">
        <div className="text-sm font-semibold">Nova conta</div>

        <form className="mt-3 grid gap-3 md:grid-cols-4" onSubmit={handleCreate}>
          <input
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-600/30 dark:border-slate-800 dark:bg-slate-950"
            placeholder="Ex.: Nubank"
            value={name}
            onChange={(event) => setName(event.target.value)}
            disabled={busy}
          />

          <select
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-600/30 dark:border-slate-800 dark:bg-slate-950"
            value={type}
            onChange={(event) => setType(event.target.value)}
            disabled={busy}
          >
            {ACCOUNT_TYPES.map((accountType) => (
              <option key={accountType.value} value={accountType.value}>
                {accountType.label}
              </option>
            ))}
          </select>

          <input
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-600/30 dark:border-slate-800 dark:bg-slate-950"
            placeholder="Saldo inicial"
            inputMode="decimal"
            value={balance}
            onChange={(event) => setBalance(event.target.value)}
            disabled={busy}
          />

          <button
            type="submit"
            className="rounded-xl bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
            disabled={busy}
          >
            Criar conta
          </button>
        </form>

        {error && <div className="mt-3 text-sm font-medium text-rose-600">{error}</div>}
      </section>

      <section className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950">
        <div className="text-sm font-semibold">Transferir saldo</div>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          Mova saldo entre contas existentes sem criar transacao manual.
        </p>

        <form className="mt-3 grid gap-3 md:grid-cols-4" onSubmit={handleTransfer}>
          <select
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-600/30 dark:border-slate-800 dark:bg-slate-950"
            value={transferFromId}
            onChange={(event) => {
              setTransferFromId(event.target.value);
              setTransferError("");
              setTransferSuccess("");
            }}
            disabled={transferBusy || accounts.length < 2}
          >
            <option value="">Conta de origem</option>
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name}
              </option>
            ))}
          </select>

          <select
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-600/30 dark:border-slate-800 dark:bg-slate-950"
            value={transferToId}
            onChange={(event) => {
              setTransferToId(event.target.value);
              setTransferError("");
              setTransferSuccess("");
            }}
            disabled={transferBusy || accounts.length < 2}
          >
            <option value="">Conta de destino</option>
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name}
              </option>
            ))}
          </select>

          <input
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-600/30 dark:border-slate-800 dark:bg-slate-950"
            placeholder="Valor"
            inputMode="decimal"
            value={transferAmount}
            onChange={(event) => {
              setTransferAmount(event.target.value);
              setTransferError("");
              setTransferSuccess("");
            }}
            disabled={transferBusy || accounts.length < 2}
          />

          <button
            type="submit"
            className="rounded-xl bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
            disabled={transferBusy || accounts.length < 2}
          >
            {transferBusy ? "Transferindo..." : "Transferir"}
          </button>
        </form>

        {transferError && (
          <div className="mt-3 text-sm font-medium text-rose-600">{transferError}</div>
        )}
        {transferSuccess && (
          <div className="mt-3 text-sm font-medium text-emerald-600">{transferSuccess}</div>
        )}
      </section>

      <section className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950">
        <div className="flex items-center justify-between gap-2">
          <div className="text-sm font-semibold">Transferencia automatica recorrente</div>
          <button
            type="button"
            className="rounded-lg border border-slate-200 px-3 py-1 text-xs hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-900"
            onClick={handleRunRecurringNow}
            disabled={recurringBusy}
          >
            Processar agora
          </button>
        </div>

        <form className="mt-3 grid gap-3 md:grid-cols-4" onSubmit={handleRecurringCreate}>
          <select
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-600/30 dark:border-slate-800 dark:bg-slate-950"
            value={recurringFromId}
            onChange={(event) => setRecurringFromId(event.target.value)}
            disabled={recurringBusy || accounts.length < 2}
          >
            <option value="">Origem</option>
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name}
              </option>
            ))}
          </select>

          <select
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-600/30 dark:border-slate-800 dark:bg-slate-950"
            value={recurringToId}
            onChange={(event) => setRecurringToId(event.target.value)}
            disabled={recurringBusy || accounts.length < 2}
          >
            <option value="">Destino</option>
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name}
              </option>
            ))}
          </select>

          <input
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-600/30 dark:border-slate-800 dark:bg-slate-950"
            placeholder="Valor"
            inputMode="decimal"
            value={recurringAmount}
            onChange={(event) => setRecurringAmount(event.target.value)}
            disabled={recurringBusy || accounts.length < 2}
          />

          <div className="grid grid-cols-3 gap-2">
            <select
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-600/30 dark:border-slate-800 dark:bg-slate-950"
              value={recurringFrequency}
              onChange={(event) => setRecurringFrequency(event.target.value)}
              disabled={recurringBusy}
            >
              <option value="daily">Diaria</option>
              <option value="weekly">Semanal</option>
              <option value="monthly">Mensal</option>
              <option value="yearly">Anual</option>
            </select>
            <input
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-600/30 dark:border-slate-800 dark:bg-slate-950"
              type="number"
              min={1}
              max={120}
              value={recurringInterval}
              onChange={(event) => setRecurringInterval(event.target.value)}
              disabled={recurringBusy}
            />
            <input
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-600/30 dark:border-slate-800 dark:bg-slate-950"
              type="date"
              value={recurringStartDate}
              onChange={(event) => setRecurringStartDate(event.target.value)}
              disabled={recurringBusy}
            />
          </div>

          <button
            type="submit"
            className="rounded-xl bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60 md:col-span-4"
            disabled={recurringBusy || accounts.length < 2}
          >
            Criar transferencia recorrente
          </button>
        </form>

        <div className="mt-3 space-y-2">
          {recurringRules.map((rule) => (
            <div
              key={rule.id}
              className="rounded-xl border border-slate-200 px-3 py-2 text-xs dark:border-slate-800"
            >
              <div className="font-semibold">
                {rule.fromAccountName || `Conta ${rule.fromAccountId}`} -&gt;{" "}
                {rule.toAccountName || `Conta ${rule.toAccountId}`} ({money(rule.amount)})
              </div>
              <div className="text-slate-500 dark:text-slate-400">
                {rule.frequency} a cada {rule.interval} | proxima:{" "}
                {rule.nextRunAt ? new Date(rule.nextRunAt).toLocaleDateString("pt-BR") : "-"} |{" "}
                {rule.active ? "ativa" : "inativa"}
              </div>
              <div className="mt-1 flex gap-2">
                <button
                  type="button"
                  onClick={() => handleRecurringToggle(rule)}
                  className="rounded border border-slate-200 px-2 py-1 text-[11px] hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-900"
                  disabled={recurringBusy}
                >
                  {rule.active ? "Desativar" : "Ativar"}
                </button>
                <button
                  type="button"
                  onClick={() => handleRecurringDelete(rule.id)}
                  className="rounded border border-rose-200 px-2 py-1 text-[11px] text-rose-700 hover:bg-rose-50 dark:border-rose-900 dark:text-rose-300 dark:hover:bg-rose-950/30"
                  disabled={recurringBusy}
                >
                  Excluir
                </button>
              </div>
            </div>
          ))}
          {recurringRules.length === 0 && (
            <div className="text-xs text-slate-500 dark:text-slate-400">
              Nenhuma transferencia recorrente cadastrada.
            </div>
          )}
        </div>
      </section>

      <section className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950">
        <div className="mb-3 text-sm font-semibold">Contas cadastradas</div>

        <div className="space-y-2">
          {accounts.map((account) => {
            const stats = accountStats.get(account.id) ?? { income: 0, expense: 0, count: 0 };
            const movement = stats.income - stats.expense;
            const isEditing = editingId === account.id;
            const isRowBusy = rowBusyId === account.id;

            return (
              <div
                key={account.id}
                className="rounded-xl border border-slate-200 px-3 py-3 dark:border-slate-800"
              >
                {!isEditing && (
                  <>
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <div className="text-sm font-medium">
                          {account.name}
                          {String(account.id) === String(defaultAccountId) && (
                            <span className="ml-2 rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-semibold text-blue-700 dark:bg-blue-950 dark:text-blue-200">
                              padrao
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-slate-500 dark:text-slate-400">
                          {account.type} | {stats.count} transacoes
                        </div>
                      </div>
                      <div className="text-left sm:text-right">
                        <div className="text-xs text-slate-500 dark:text-slate-400">
                          Saldo inicial
                        </div>
                        <div className="text-sm font-semibold">{money(account.balance)}</div>
                      </div>
                    </div>

                    <div className="mt-2 grid gap-2 text-xs text-slate-600 dark:text-slate-300 md:grid-cols-3">
                      <div>Entradas: {money(stats.income)}</div>
                      <div>Saidas: {money(stats.expense)}</div>
                      <div className={movement >= 0 ? "text-emerald-600" : "text-rose-600"}>
                        Movimento: {money(movement)}
                      </div>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => startEdit(account)}
                        className="rounded-lg border border-slate-200 px-3 py-1 text-xs hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-900"
                        disabled={isRowBusy}
                      >
                        Editar
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(account.id)}
                        className="rounded-lg border border-rose-200 px-3 py-1 text-xs text-rose-700 hover:bg-rose-50 dark:border-rose-900 dark:text-rose-300 dark:hover:bg-rose-950/30"
                        disabled={isRowBusy}
                      >
                        Excluir
                      </button>
                    </div>
                  </>
                )}

                {isEditing && (
                  <div className="space-y-3">
                    <div className="grid gap-2 md:grid-cols-3">
                      <input
                        className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-600/30 dark:border-slate-800 dark:bg-slate-950"
                        value={editName}
                        onChange={(event) => setEditName(event.target.value)}
                        disabled={isRowBusy}
                      />
                      <select
                        className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-600/30 dark:border-slate-800 dark:bg-slate-950"
                        value={editType}
                        onChange={(event) => setEditType(event.target.value)}
                        disabled={isRowBusy}
                      >
                        {ACCOUNT_TYPES.map((accountType) => (
                          <option key={accountType.value} value={accountType.value}>
                            {accountType.label}
                          </option>
                        ))}
                      </select>
                      <input
                        className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-600/30 dark:border-slate-800 dark:bg-slate-950"
                        value={editBalance}
                        onChange={(event) => setEditBalance(event.target.value)}
                        inputMode="decimal"
                        disabled={isRowBusy}
                      />
                    </div>

                    <label className="inline-flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                      <input
                        type="checkbox"
                        checked={editIsDefault}
                        onChange={(event) => setEditIsDefault(event.target.checked)}
                        disabled={isRowBusy}
                      />
                      Definir como conta padrao
                    </label>

                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => handleSaveEdit(account.id)}
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
                        onClick={() => handleDelete(account.id)}
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

        {accounts.length === 0 && (
          <div className="py-8 text-center text-sm text-slate-500 dark:text-slate-400">
            Nenhuma conta cadastrada.
          </div>
        )}
      </section>
    </div>
  );
}
