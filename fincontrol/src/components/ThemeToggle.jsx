import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";

function resolveInitialTheme() {
  const saved = localStorage.getItem("theme");
  if (saved === "dark") return true;
  if (saved === "light") return false;
  return document.documentElement.classList.contains("dark");
}

export default function ThemeToggle() {
  const [dark, setDark] = useState(resolveInitialTheme);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    localStorage.setItem("theme", dark ? "dark" : "light");
  }, [dark]);

  return (
    <button
      type="button"
      onClick={() => setDark((previous) => !previous)}
      className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-800"
    >
      {dark ? <Sun size={16} /> : <Moon size={16} />}
      {dark ? "Claro" : "Escuro"}
    </button>
  );
}
