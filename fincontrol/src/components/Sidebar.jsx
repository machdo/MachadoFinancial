import { createElement } from "react";
import { NAV_ITEMS } from "../constants/navigation";

export default function Sidebar({ activePage = "dashboard", onNavigate }) {
  const Item = ({ icon, label, active, onClick }) => (
    <button
      type="button"
      onClick={onClick}
      className={[
        "w-full flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition",
        active
          ? "bg-blue-600 text-white"
          : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800",
      ].join(" ")}
    >
      {createElement(icon, { size: 18 })}
      <span className="font-medium">{label}</span>
    </button>
  );

  return (
    <aside className="hidden md:flex md:w-64 md:flex-col md:gap-6 md:border-r md:border-slate-200 md:bg-white md:p-4 dark:md:border-slate-800 dark:md:bg-slate-950">
      <div className="flex items-center justify-between">
        <div className="text-lg font-semibold text-slate-900 dark:text-white">
          Machado Financial
        </div>
        <div className="h-2 w-2 rounded-full bg-emerald-500" title="online" />
      </div>

      <div className="flex flex-col gap-1">
        {NAV_ITEMS.map((item) => (
          <Item
            key={item.key}
            icon={item.icon}
            label={item.label}
            active={activePage === item.key}
            onClick={() => onNavigate?.(item.key)}
          />
        ))}
      </div>

      <div className="mt-auto rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
        Dica: mantenha suas categorias organizadas para relatorios melhores.
      </div>
    </aside>
  );
}
