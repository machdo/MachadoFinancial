import { useMemo } from "react";
import {
  BarChart,
  Bar,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { money } from "../lib/finance";

function monthKey(dateValue) {
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

export default function Reports({ transactions = [], categories = [] }) {
  const monthly = useMemo(() => {
    const map = new Map();
    for (const transaction of transactions) {
      const key = monthKey(transaction.date);
      if (!key) continue;
      const current = map.get(key) ?? { month: key, income: 0, expense: 0 };
      if (transaction.type === "income") current.income += transaction.value;
      if (transaction.type === "expense") current.expense += transaction.value;
      map.set(key, current);
    }

    return Array.from(map.values())
      .sort((a, b) => (a.month > b.month ? 1 : -1))
      .slice(-8)
      .map((item) => ({ ...item, balance: item.income - item.expense }));
  }, [transactions]);

  const cumulative = useMemo(() => {
    return monthly.reduce((list, item) => {
      const previous = list.length > 0 ? list[list.length - 1].cumulative : 0;
      return [...list, { month: item.month, cumulative: previous + item.balance }];
    }, []);
  }, [monthly]);

  const topCategories = useMemo(() => {
    const map = new Map();
    for (const transaction of transactions) {
      if (transaction.type !== "expense") continue;
      map.set(
        transaction.categoryId,
        (map.get(transaction.categoryId) ?? 0) + transaction.value,
      );
    }

    return Array.from(map.entries())
      .map(([categoryId, total]) => {
        const category = categories.find((item) => item.id === categoryId);
        return { category: category?.name ?? `Categoria ${categoryId}`, total };
      })
      .sort((a, b) => b.total - a.total)
      .slice(0, 5);
  }, [transactions, categories]);

  const totals = useMemo(() => {
    const income = monthly.reduce((sum, item) => sum + item.income, 0);
    const expense = monthly.reduce((sum, item) => sum + item.expense, 0);
    return { income, expense, balance: income - expense };
  }, [monthly]);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-3">
        <SummaryCard title="Receitas (periodo)" value={money(totals.income)} tone="emerald" />
        <SummaryCard title="Despesas (periodo)" value={money(totals.expense)} tone="rose" />
        <SummaryCard title="Saldo (periodo)" value={money(totals.balance)} tone="blue" />
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950">
        <div className="mb-3 text-sm font-semibold">Receitas vs despesas por mes</div>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={monthly}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" />
              <YAxis />
              <Tooltip formatter={(value) => money(value)} />
              <Bar dataKey="income" name="Receitas" fill="#10b981" />
              <Bar dataKey="expense" name="Despesas" fill="#ef4444" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950 lg:col-span-2">
          <div className="mb-3 text-sm font-semibold">Saldo acumulado</div>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={cumulative}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis />
                <Tooltip formatter={(value) => money(value)} />
                <Line
                  type="monotone"
                  dataKey="cumulative"
                  stroke="#2563eb"
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950">
          <div className="mb-3 text-sm font-semibold">Top categorias de despesa</div>
          <div className="space-y-2">
            {topCategories.map((item) => (
              <div
                key={item.category}
                className="rounded-xl border border-slate-200 px-3 py-2 dark:border-slate-800"
              >
                <div className="text-sm font-medium">{item.category}</div>
                <div className="text-sm font-semibold text-rose-600">{money(item.total)}</div>
              </div>
            ))}
          </div>
          {topCategories.length === 0 && (
            <div className="py-8 text-center text-sm text-slate-500 dark:text-slate-400">
              Sem dados suficientes para relatorio.
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function SummaryCard({ title, value, tone = "blue" }) {
  const toneText = {
    blue: "text-blue-700 dark:text-blue-200",
    emerald: "text-emerald-700 dark:text-emerald-200",
    rose: "text-rose-700 dark:text-rose-200",
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950">
      <div className="text-xs text-slate-500 dark:text-slate-400">{title}</div>
      <div className={["mt-1 text-xl font-semibold", toneText[tone] ?? toneText.blue].join(" ")}>
        {value}
      </div>
    </div>
  );
}
