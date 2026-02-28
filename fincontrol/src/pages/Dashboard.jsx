import { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";
import { RefreshCcw, LogOut, ArrowDownRight, ArrowUpRight } from "lucide-react";
import Sidebar from "../components/Sidebar";
import ThemeToggle from "../components/ThemeToggle";
import NewTransactionModal from "../components/NewTransactionModal";
import DashboardHome from "./DashboardHome";
import Transactions from "./Transactions";
import Categories from "./Categories";
import Accounts from "./Accounts";
import Goals from "./Goals";
import Reports from "./Reports";
import Investments from "./Investments";
import Profile from "./Profile";
import { NAV_ITEMS } from "../constants/navigation";
import { API_BASE, authHeaders } from "../lib/finance";

export default function Dashboard({ onLogout }) {
  const [activePage, setActivePage] = useState("dashboard");
  const [transactions, setTransactions] = useState([]);
  const [categories, setCategories] = useState([]);
  const [accounts, setAccounts] = useState([]);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [newOpen, setNewOpen] = useState(false);
  const [newType, setNewType] = useState("expense");

  const pageLabel = useMemo(() => {
    return NAV_ITEMS.find((item) => item.key === activePage)?.label ?? "Dashboard";
  }, [activePage]);

  const loadData = useCallback(async (showLoader = true) => {
    setError("");
    if (showLoader) setLoading(true);
    else setRefreshing(true);

    try {
      const [transactionsRes, categoriesRes, accountsRes] = await Promise.all([
        axios.get(`${API_BASE}/transactions`, { headers: authHeaders() }),
        axios.get(`${API_BASE}/categories`, { headers: authHeaders() }),
        axios.get(`${API_BASE}/accounts`, { headers: authHeaders() }),
      ]);

      setTransactions(transactionsRes.data ?? []);
      setCategories(categoriesRes.data ?? []);
      setAccounts(accountsRes.data ?? []);
    } catch (requestError) {
      setError(requestError?.response?.data?.error || "Nao foi possivel carregar dados.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadData(true);
  }, [loadData]);

  function handleLogout() {
    localStorage.removeItem("token");
    if (typeof onLogout === "function") onLogout();
    else window.location.reload();
  }

  function handleTransactionCreated(created) {
    setTransactions((previous) => [created, ...previous]);
  }

  function handleTransactionUpdated(updated) {
    setTransactions((previous) =>
      previous.map((transaction) =>
        transaction.id === updated.id ? updated : transaction,
      ),
    );
  }

  function handleTransactionDeleted(id) {
    setTransactions((previous) =>
      previous.filter((transaction) => transaction.id !== id),
    );
  }

  function handleAccountCreated(created) {
    setAccounts((previous) => [created, ...previous]);
  }

  function handleAccountUpdated(updated) {
    setAccounts((previous) =>
      previous.map((account) => (account.id === updated.id ? updated : account)),
    );
  }

  function handleAccountDeleted(id) {
    setAccounts((previous) => previous.filter((account) => account.id !== id));
  }

  function handleCategoryCreated(created) {
    setCategories((previous) => [created, ...previous]);
  }

  function handleCategoryUpdated(updated) {
    setCategories((previous) =>
      previous.map((category) => (category.id === updated.id ? updated : category)),
    );
  }

  function handleCategoryDeleted(id) {
    setCategories((previous) => previous.filter((category) => category.id !== id));
  }

  function openNewTransaction(type = "expense") {
    setNewType(type === "income" ? "income" : "expense");
    setNewOpen(true);
  }

  function renderPage() {
    if (loading) {
      return (
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500 shadow-sm dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400">
          Carregando dados...
        </div>
      );
    }

    if (error) {
      return (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200">
          <div>{error}</div>
          <button
            type="button"
            onClick={() => loadData(true)}
            className="mt-3 rounded-lg bg-rose-600 px-3 py-2 text-xs font-semibold text-white hover:bg-rose-700"
          >
            Tentar novamente
          </button>
        </div>
      );
    }

    if (activePage === "dashboard") {
      return (
        <DashboardHome
          transactions={transactions}
          categories={categories}
          accounts={accounts}
          onOpenNewTransaction={openNewTransaction}
        />
      );
    }

    if (activePage === "transactions") {
      return (
        <Transactions
          transactions={transactions}
          categories={categories}
          accounts={accounts}
          onTransactionUpdated={handleTransactionUpdated}
          onTransactionDeleted={handleTransactionDeleted}
        />
      );
    }

    if (activePage === "categories") {
      return (
        <Categories
          categories={categories}
          transactions={transactions}
          onCategoryCreated={handleCategoryCreated}
          onCategoryUpdated={handleCategoryUpdated}
          onCategoryDeleted={handleCategoryDeleted}
        />
      );
    }

    if (activePage === "accounts") {
      return (
        <Accounts
          accounts={accounts}
          transactions={transactions}
          onAccountCreated={handleAccountCreated}
          onAccountUpdated={handleAccountUpdated}
          onAccountDeleted={handleAccountDeleted}
        />
      );
    }

    if (activePage === "goals") {
      return <Goals />;
    }

    if (activePage === "investments") {
      return <Investments transactions={transactions} categories={categories} />;
    }

    if (activePage === "reports") {
      return <Reports transactions={transactions} categories={categories} />;
    }

    if (activePage === "profile") {
      return <Profile />;
    }

    return (
      <DashboardHome
        transactions={transactions}
        categories={categories}
        accounts={accounts}
        onOpenNewTransaction={openNewTransaction}
      />
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-900 dark:text-slate-100">
      <div className="flex min-h-screen">
        <Sidebar activePage={activePage} onNavigate={setActivePage} />

        <main className="min-w-0 flex-1 p-3 sm:p-4 md:p-8">
          <header className="mb-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="min-w-0">
                <h1 className="truncate text-xl font-semibold sm:text-2xl">{pageLabel}</h1>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Controle financeiro completo em um unico painel.
                </p>
              </div>

              <div className="grid w-full grid-cols-2 gap-2 sm:w-auto sm:grid-cols-none sm:auto-cols-max sm:grid-flow-col sm:flex-wrap sm:items-center">
                <button
                  type="button"
                  onClick={() => openNewTransaction("income")}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700 sm:w-auto"
                >
                  <ArrowUpRight size={16} />
                  Receita
                </button>

                <button
                  type="button"
                  onClick={() => openNewTransaction("expense")}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-rose-600 px-3 py-2 text-sm font-semibold text-white hover:bg-rose-700 sm:w-auto"
                >
                  <ArrowDownRight size={16} />
                  Despesa
                </button>

                <button
                  type="button"
                  onClick={() => loadData(false)}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-950 dark:hover:bg-slate-800 sm:w-auto"
                  disabled={refreshing}
                >
                  <RefreshCcw size={16} className={refreshing ? "animate-spin" : ""} />
                  Atualizar
                </button>

                <ThemeToggle />

                <button
                  type="button"
                  onClick={handleLogout}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-950 dark:hover:bg-slate-800 sm:w-auto"
                >
                  <LogOut size={16} />
                  Sair
                </button>
              </div>
            </div>

            <div className="mt-4 flex gap-2 overflow-x-auto md:hidden">
              {NAV_ITEMS.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setActivePage(item.key)}
                  className={[
                    "whitespace-nowrap rounded-full px-3 py-2 text-xs font-medium",
                    activePage === item.key
                      ? "bg-blue-600 text-white"
                      : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200",
                  ].join(" ")}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </header>

          {renderPage()}
        </main>
      </div>

      <NewTransactionModal
        open={newOpen}
        onClose={() => setNewOpen(false)}
        initialType={newType}
        onCreated={handleTransactionCreated}
        onAccountCreated={handleAccountCreated}
        onCategoryCreated={handleCategoryCreated}
        accounts={accounts}
        categories={categories}
      />
    </div>
  );
}
