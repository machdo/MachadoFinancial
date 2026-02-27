import { forwardRef, useEffect, useMemo, useRef, useState } from "react";
import {
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

const WEEK_DAYS = ["D", "S", "T", "Q", "Q", "S", "S"];

function parseISODate(value) {
  const normalized = String(value ?? "").trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(normalized);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);

  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }

  return date;
}

function toISODate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function startOfDay(date) {
  const clone = new Date(date);
  clone.setHours(0, 0, 0, 0);
  return clone;
}

function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function buildCalendarDays(monthDate) {
  const firstDayOfMonth = startOfMonth(monthDate);
  const start = new Date(firstDayOfMonth);
  start.setDate(1 - firstDayOfMonth.getDay());

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return date;
  });
}

function fmtDate(date) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

function fmtWeekday(date) {
  return new Intl.DateTimeFormat("pt-BR", { weekday: "long" }).format(date);
}

function fmtMonth(date) {
  return new Intl.DateTimeFormat("pt-BR", {
    month: "long",
    year: "numeric",
  }).format(date);
}

const FancyDateInput = forwardRef(function FancyDateInput(
  {
    value,
    onChange,
    disabled = false,
    min,
    max,
    className = "",
    compact = false,
  },
  forwardedRef,
) {
  const rootRef = useRef(null);
  const selectedDate = useMemo(() => parseISODate(value), [value]);
  const minDate = useMemo(() => parseISODate(min), [min]);
  const maxDate = useMemo(() => parseISODate(max), [max]);

  const [open, setOpen] = useState(false);
  const [monthCursor, setMonthCursor] = useState(() =>
    startOfMonth(selectedDate ?? new Date()),
  );

  const todayISO = useMemo(() => toISODate(new Date()), []);
  const selectedISO = selectedDate ? toISODate(selectedDate) : "";
  const calendarDays = useMemo(
    () => buildCalendarDays(monthCursor),
    [monthCursor],
  );

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event) => {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(event.target)) setOpen(false);
    };

    const handleKeyDown = (event) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  function isDateDisabled(date) {
    const current = startOfDay(date).getTime();
    if (minDate && current < startOfDay(minDate).getTime()) return true;
    if (maxDate && current > startOfDay(maxDate).getTime()) return true;
    return false;
  }

  function selectDate(date) {
    if (disabled || isDateDisabled(date)) return;
    onChange?.(toISODate(date));
    setOpen(false);
  }

  function selectToday() {
    selectDate(new Date());
  }

  function selectTomorrow() {
    const date = new Date();
    date.setDate(date.getDate() + 1);
    selectDate(date);
  }

  function selectEndOfMonth() {
    const date = new Date(monthCursor.getFullYear(), monthCursor.getMonth() + 1, 0);
    selectDate(date);
  }

  const displayText = selectedDate ? fmtDate(selectedDate) : "Selecionar data";
  const weekdayText = selectedDate
    ? fmtWeekday(selectedDate)
    : "Abrir calendario completo";
  const monthLabel = fmtMonth(monthCursor);
  const panelWidth = compact ? "w-[17rem]" : "w-[19rem]";
  const panelPosition = compact ? "right-0 left-auto" : "left-0";
  const triggerSpacing = compact ? "px-2 py-1.5" : "px-3 py-2.5";
  const triggerBase =
    "w-full rounded-2xl border text-left outline-none transition disabled:cursor-not-allowed disabled:opacity-60";
  const triggerStyle = open
    ? "border-blue-300 bg-gradient-to-br from-blue-50 to-cyan-50 shadow-md shadow-blue-100/70 dark:border-blue-800 dark:from-slate-900 dark:to-slate-900"
    : "border-slate-200 bg-gradient-to-br from-white to-slate-50 shadow-sm hover:border-slate-300 dark:border-slate-800 dark:from-slate-950 dark:to-slate-900 dark:hover:border-slate-700";
  const compactTextClass = compact
    ? "block text-xs font-semibold text-slate-900 dark:text-slate-100"
    : "block text-sm font-semibold text-slate-900 dark:text-slate-100";

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={forwardedRef}
        type="button"
        className={[
          triggerBase,
          triggerStyle,
          triggerSpacing,
          "focus:ring-2 focus:ring-blue-600/30",
          className,
        ].join(" ")}
        onClick={() => {
          if (disabled) return;
          setOpen((previous) => {
            const next = !previous;
            if (next) setMonthCursor(startOfMonth(selectedDate ?? new Date()));
            return next;
          });
        }}
        disabled={disabled}
        aria-label="Selecionar data"
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <span className="flex items-center justify-between gap-2">
          <span className="flex min-w-0 items-center gap-2.5">
            <span
              className={[
                "inline-flex items-center justify-center rounded-xl",
                compact
                  ? "h-7 w-7 bg-blue-100 text-blue-700 dark:bg-blue-900/60 dark:text-blue-200"
                  : "h-9 w-9 bg-gradient-to-br from-blue-600 to-cyan-500 text-white shadow-sm shadow-blue-400/50",
              ].join(" ")}
            >
              <CalendarDays size={compact ? 14 : 16} />
            </span>
            <span className="min-w-0">
              {!compact && (
                <span className="block text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500 dark:text-slate-400">
                  Data selecionada
                </span>
              )}
              <span className={compactTextClass}>
                {displayText}
              </span>
              {!compact && (
                <span className="block truncate text-xs capitalize text-slate-500 dark:text-slate-400">
                  {weekdayText}
                </span>
              )}
            </span>
          </span>
          <span
            className={[
              "inline-flex items-center justify-center rounded-lg text-slate-500 transition dark:text-slate-400",
              compact ? "h-6 w-6" : "h-7 w-7 bg-white/80 shadow-sm dark:bg-slate-900/70",
            ].join(" ")}
          >
            <ChevronDown
              size={compact ? 14 : 16}
              className={open ? "rotate-180 transition-transform" : "transition-transform"}
            />
          </span>
        </span>
      </button>

      {open && (
        <div
          className={[
            "absolute top-[calc(100%+0.6rem)] z-[70] rounded-3xl border border-slate-200/90 bg-white/95 p-3 shadow-2xl backdrop-blur-sm",
            "dark:border-slate-800 dark:bg-slate-950/95",
            panelWidth,
            panelPosition,
          ].join(" ")}
          role="dialog"
          aria-label="Calendario"
        >
          <div className="rounded-2xl bg-gradient-to-r from-blue-600 to-cyan-500 px-3 py-2 text-white">
            <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-blue-100">
              Data escolhida
            </div>
            <div className="mt-0.5 text-base font-semibold">
              {displayText}
            </div>
            <div className="text-xs capitalize text-blue-100/90">{weekdayText}</div>
          </div>

          <div className="mt-3 flex items-center justify-between">
            <button
              type="button"
              className="rounded-xl border border-slate-200 bg-white p-1.5 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800"
              onClick={() =>
                setMonthCursor(
                  (previous) =>
                    new Date(previous.getFullYear(), previous.getMonth() - 1, 1),
                )
              }
              aria-label="Mes anterior"
            >
              <ChevronLeft size={14} />
            </button>
            <div className="text-sm font-semibold capitalize text-slate-800 dark:text-slate-100">
              {monthLabel}
            </div>
            <button
              type="button"
              className="rounded-xl border border-slate-200 bg-white p-1.5 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800"
              onClick={() =>
                setMonthCursor(
                  (previous) =>
                    new Date(previous.getFullYear(), previous.getMonth() + 1, 1),
                )
              }
              aria-label="Proximo mes"
            >
              <ChevronRight size={14} />
            </button>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              className="rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700 hover:bg-blue-100 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-200 dark:hover:bg-blue-900/60"
              onClick={selectToday}
            >
              Hoje
            </button>
            <button
              type="button"
              className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-100 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200 dark:hover:bg-emerald-900/60"
              onClick={selectTomorrow}
            >
              Amanha
            </button>
            <button
              type="button"
              className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700 hover:bg-amber-100 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200 dark:hover:bg-amber-900/60"
              onClick={selectEndOfMonth}
            >
              Fim do mes
            </button>
          </div>

          <div className="mt-3 grid grid-cols-7 gap-1 text-center text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            {WEEK_DAYS.map((dayLabel, index) => (
              <div key={`${dayLabel}-${index}`}>{dayLabel}</div>
            ))}
          </div>

          <div className="mt-1 grid grid-cols-7 gap-1">
            {calendarDays.map((day) => {
              const iso = toISODate(day);
              const sameMonth = day.getMonth() === monthCursor.getMonth();
              const isSelected = iso === selectedISO;
              const isToday = iso === todayISO;
              const unavailable = isDateDisabled(day);

              return (
                <button
                  key={iso}
                  type="button"
                  className={[
                    "h-9 rounded-xl text-sm transition",
                    sameMonth
                      ? "text-slate-800 dark:text-slate-100"
                      : "text-slate-400 dark:text-slate-600",
                    isSelected
                      ? "bg-gradient-to-br from-blue-600 to-cyan-500 font-semibold text-white shadow-md shadow-blue-400/30 hover:from-blue-600 hover:to-cyan-600"
                      : "bg-white hover:bg-slate-100 dark:bg-slate-900 dark:hover:bg-slate-800",
                    isToday && !isSelected
                      ? "border border-blue-300 dark:border-blue-700"
                      : "border border-slate-100 dark:border-slate-800",
                    unavailable ? "cursor-not-allowed opacity-40 hover:bg-transparent" : "",
                  ].join(" ")}
                  onClick={() => selectDate(day)}
                  disabled={unavailable}
                >
                  {day.getDate()}
                </button>
              );
            })}
          </div>

          <details className="mt-3 border-t border-slate-100 pt-2.5 dark:border-slate-800">
            <summary className="cursor-pointer list-none text-[11px] font-semibold uppercase tracking-wide text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200">
              Ajuste manual (YYYY-MM-DD)
            </summary>
            <input
              type="date"
              className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs outline-none focus:ring-2 focus:ring-blue-600/30 dark:border-slate-700 dark:bg-slate-950"
              value={value || ""}
              min={min}
              max={max}
              onChange={(event) => onChange?.(event.target.value)}
              disabled={disabled}
            />
          </details>
        </div>
      )}
    </div>
  );
});

export default FancyDateInput;
