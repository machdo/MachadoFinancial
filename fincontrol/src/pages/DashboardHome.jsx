import { useMemo, useState } from "react";
import {
  PieChart,
  Pie,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";
import { ArrowDownRight, ArrowUpRight, TrendingUp } from "lucide-react";
import { money, ymd } from "../lib/finance";

export default function DashboardHome({
  transactions = [],
  categories = [],
  accounts = [],
  onOpenNewTransaction,
}) {
  const [period, setPeriod] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() + 1 };
  });

  const monthStart = useMemo(
    () => new Date(period.year, period.month - 1, 1),
    [period],
  );
  const monthEnd = useMemo(
    () => new Date(period.year, period.month, 0, 23, 59, 59, 999),
    [period],
  );

  const monthTransactions = useMemo(() => {
    return transactions
      .filter((transaction) => {
        const dt = new Date(transaction.date);
        return dt >= monthStart && dt <= monthEnd;
      })
      .sort((a, b) => new Date(b.date) - new Date(a.date));
  }, [transactions, monthStart, monthEnd]);

  const totals = useMemo(() => {
    const income = monthTransactions
      .filter((transaction) => transaction.type === "income")
      .reduce((sum, transaction) => sum + transaction.value, 0);
    const expense = monthTransactions
      .filter((transaction) => transaction.type === "expense")
      .reduce((sum, transaction) => sum + transaction.value, 0);
    return { income, expense, balance: income - expense };
  }, [monthTransactions]);

  const pieData = useMemo(() => {
    const map = new Map();
    for (const transaction of monthTransactions) {
      if (transaction.type !== "expense") continue;
      map.set(
        transaction.categoryId,
        (map.get(transaction.categoryId) ?? 0) + transaction.value,
      );
    }

    return Array.from(map.entries())
      .map(([categoryId, value]) => {
        const category = categories.find((item) => item.id === categoryId);
        return { name: category?.name ?? "Sem categoria", value };
      })
      .sort((a, b) => b.value - a.value);
  }, [monthTransactions, categories]);

  const lineData = useMemo(() => {
    const daysInMonth = new Date(period.year, period.month, 0).getDate();
    const byDay = new Map();
    for (let day = 1; day <= daysInMonth; day += 1) {
      byDay.set(day, { day, delta: 0 });
    }

    for (const transaction of monthTransactions) {
      const dt = new Date(transaction.date);
      const day = dt.getDate();
      const signal = transaction.type === "income" ? 1 : -1;
      byDay.get(day).delta += signal * transaction.value;
    }

    let running = 0;
    const output = [];
    for (let day = 1; day <= daysInMonth; day += 1) {
      running += byDay.get(day).delta;
      output.push({ day: String(day).padStart(2, "0"), balance: running });
    }
    return output;
  }, [monthTransactions, period]);

  const lastTransactions = monthTransactions.slice(0, 8);

  const health = useMemo(() => {
    if (totals.income <= 0) {
      return { label: "Saude: sem receitas", tone: "slate" };
    }
    const savingsRate = (totals.income - totals.expense) / totals.income;
    if (savingsRate >= 0.2) return { label: "Saude: otima", tone: "emerald" };
    if (savingsRate >= 0.05) return { label: "Saude: ok", tone: "amber" };
    return { label: "Saude: atencao", tone: "rose" };
  }, [totals]);

  function prevMonth() {
    const month = period.month - 1;
    if (month >= 1) setPeriod({ ...period, month });
    else setPeriod({ year: period.year - 1, month: 12 });
  }

  function nextMonth() {
    const month = period.month + 1;
    if (month <= 12) setPeriod({ ...period, month });
    else setPeriod({ year: period.year + 1, month: 1 });
  }

  function categoryName(id) {
    return categories.find((item) => item.id === id)?.name ?? `Categoria ${id}`;
  }

  function accountName(id) {
    return accounts.find((item) => item.id === id)?.name ?? `Conta ${id}`;
  }

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="min-w-0">
            <div className="text-sm font-semibold">Resumo mensal</div>
            <div className="text-xs text-slate-500 dark:text-slate-400">
              {String(period.month).padStart(2, "0")}/{period.year}
            </div>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-4">
            <button
              type="button"
              onClick={prevMonth}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-950 dark:hover:bg-slate-800"
            >
              Mes anterior
            </button>
            <button
              type="button"
              onClick={nextMonth}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-950 dark:hover:bg-slate-800"
            >
              Proximo mes
            </button>
            <button
              type="button"
              onClick={() => onOpenNewTransaction?.("income")}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
            >
              <ArrowUpRight size={16} />
              Receita
            </button>
            <button
              type="button"
              onClick={() => onOpenNewTransaction?.("expense")}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-rose-600 px-3 py-2 text-sm font-semibold text-white hover:bg-rose-700"
            >
              <ArrowDownRight size={16} />
              Despesa
            </button>
          </div>
        </div>
      </section>

      <div className="grid gap-4 md:grid-cols-3">
        <StatCard
          title="Saldo do mes"
          value={money(totals.balance)}
          icon={<TrendingUp size={18} />}
          badge={health.label}
          tone={health.tone}
        />
        <StatCard
          title="Receitas"
          value={money(totals.income)}
          icon={<ArrowUpRight size={18} />}
          tone="emerald"
        />
        <StatCard
          title="Despesas"
          value={money(totals.expense)}
          icon={<ArrowDownRight size={18} />}
          tone="rose"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader title="Despesas por categoria" subtitle="Distribuicao do mes" />
          <div className="h-56 sm:h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={pieData} dataKey="value" nameKey="name" outerRadius={90} />
                <Tooltip formatter={(value) => money(value)} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          {pieData.length === 0 && (
            <div className="mt-3 text-sm text-slate-500 dark:text-slate-400">
              Sem despesas no periodo.
            </div>
          )}
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader
            title="Evolucao do saldo"
            subtitle="Acumulado no mes (entradas - saidas)"
          />
          <div className="h-56 sm:h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={lineData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="day" />
                <YAxis />
                <Tooltip formatter={(value) => money(value)} />
                <Line type="monotone" dataKey="balance" dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader title="Ultimas transacoes" subtitle="Mais recentes do mes" />
        <div className="divide-y divide-slate-100 dark:divide-slate-800">
          {lastTransactions.map((transaction) => (
            <div
              key={transaction.id}
              className="flex flex-col gap-1 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-3"
            >
              <div className="min-w-0">
                <div className="truncate text-sm font-medium">
                  {transaction.description || "(sem descricao)"}
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400 sm:truncate">
                  {ymd(transaction.date)} |{" "}
                  {transaction.type === "income" ? "Receita" : "Despesa"} |{" "}
                  {categoryName(transaction.categoryId)} |{" "}
                  {accountName(transaction.accountId)}
                </div>
              </div>

              <div
                className={[
                  "shrink-0 text-sm font-semibold",
                  transaction.type === "income" ? "text-emerald-500" : "text-rose-500",
                ].join(" ")}
              >
                {transaction.type === "income" ? "+" : "-"} {money(transaction.value)}
              </div>
            </div>
          ))}

          {lastTransactions.length === 0 && (
            <div className="py-6 text-sm text-slate-500 dark:text-slate-400">
              Sem transacoes no periodo.
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}

function Card({ children, className = "" }) {
  return (
    <section
      className={[
        "min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950",
        className,
      ].join(" ")}
    >
      {children}
    </section>
  );
}

function CardHeader({ title, subtitle }) {
  return (
    <div className="mb-3">
      <div className="text-sm font-semibold">{title}</div>
      <div className="text-xs text-slate-500 dark:text-slate-400">{subtitle}</div>
    </div>
  );
}

function StatCard({ title, value, icon, badge, tone = "blue" }) {
  const toneMap = {
    emerald:
      "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-200",
    rose: "bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-200",
    amber: "bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-200",
    slate: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200",
    blue: "bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-200",
  };

  return (
    <div className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-xs text-slate-500 dark:text-slate-400">{title}</div>
          <div className="mt-1 break-words text-xl font-semibold sm:text-2xl">{value}</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-2 text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200">
          {icon}
        </div>
      </div>

      {badge && (
        <div className="mt-3">
          <span
            className={[
              "inline-flex rounded-full px-2 py-1 text-xs font-medium",
              toneMap[tone] ?? toneMap.blue,
            ].join(" ")}
          >
            {badge}
          </span>
        </div>
      )}
    </div>
  );
}
