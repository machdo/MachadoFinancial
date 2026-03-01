const envApiBase = (import.meta.env.VITE_API_BASE_URL || "").trim();

export const API_BASE =
  (envApiBase ? envApiBase.replace(/\/+$/, "") : "") ||
  "http://localhost:3001";

export function money(value) {
  return (value ?? 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

export function ymd(dateValue) {
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return "-";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function dateLabel(dateValue) {
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

export function monthYearLabel(dateValue) {
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric",
  });
}

export function monthKeyLabel(monthKey) {
  const text = String(monthKey ?? "").trim();
  const match = text.match(/^(\d{4})-(\d{2})$/);
  if (!match) return text || "-";

  const year = Number(match[1]);
  const month = Number(match[2]);
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    return text;
  }

  return monthYearLabel(new Date(year, month - 1, 1));
}

export function todayISO() {
  return ymd(new Date());
}

export function authHeaders() {
  const token = localStorage.getItem("token");
  return { Authorization: `Bearer ${token}` };
}
