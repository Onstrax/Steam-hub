"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { cn } from "@/lib/utils";
import { Spinner } from "@/components/ui/spinner";

export interface MultiSelectOption {
  value: string;
  label: string;
  avatar?: string | null;
  meta?: string;
}

export interface MultiSelectProps {
  label: string;
  options: MultiSelectOption[];
  selected: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  searchable?: boolean;
  loading?: boolean;
  error?: string | null;
  disabled?: boolean;
}

export function MultiSelect({
  label,
  options,
  selected,
  onChange,
  placeholder = "Todos",
  searchable = false,
  loading = false,
  error = null,
  disabled = false,
}: MultiSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [open]);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return options;
    return options.filter((option) => option.label.toLowerCase().includes(normalized));
  }, [options, query]);

  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const summary =
    selected.length === 0
      ? placeholder
      : selected.length === 1
        ? options.find((option) => option.value === selected[0])?.label ?? `${selected.length} seleccionado`
        : `${selected.length} seleccionados`;

  const toggleValue = (value: string) => {
    if (selectedSet.has(value)) {
      onChange(selected.filter((item) => item !== value));
    } else {
      onChange([...selected, value]);
    }
  };

  return (
    <div ref={containerRef} className="relative">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</span>
        {selected.length > 0 ? (
          <button
            type="button"
            onClick={() => onChange([])}
            disabled={disabled}
            className="text-xs text-steam hover:underline disabled:opacity-40"
          >
            Limpiar
          </button>
        ) : null}
      </div>

      <button
        type="button"
        disabled={disabled || loading}
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className={cn(
          "mt-1.5 flex h-9 w-full items-center justify-between rounded-md border border-steam-border bg-slate-900 px-3 text-sm text-slate-100",
          "hover:border-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-steam",
          "disabled:cursor-not-allowed disabled:opacity-50",
        )}
      >
        <span className={cn("truncate", selected.length === 0 && "text-slate-400")}>{summary}</span>
        {loading ? (
          <Spinner className="size-4 shrink-0 text-slate-400" />
        ) : (
          <span className={cn("text-xs text-slate-400 transition-transform", open && "rotate-180")}>▼</span>
        )}
      </button>

      {error ? <p className="mt-1 text-xs text-rose-400">{error}</p> : null}

      {open ? (
        <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-md border border-steam-border bg-slate-900 shadow-xl">
          {searchable ? (
            <div className="border-b border-slate-700 p-2">
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Buscar…"
                className="h-8 w-full rounded border border-slate-700 bg-slate-950 px-2 text-sm text-slate-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-steam"
              />
            </div>
          ) : null}
          <ul className="max-h-56 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <li className="px-3 py-2 text-sm text-slate-400">Sin resultados</li>
            ) : (
              filtered.map((option) => (
                <li key={option.value}>
                  <label className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm text-slate-200 hover:bg-white/5">
                    <input
                      type="checkbox"
                      checked={selectedSet.has(option.value)}
                      onChange={() => toggleValue(option.value)}
                      className="size-4 rounded border-slate-600 bg-slate-800 accent-[#66c0f4]"
                    />
                    {option.avatar ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={option.avatar} alt="" className="size-6 rounded-full bg-slate-800" />
                    ) : null}
                    <span className="flex-1 truncate">{option.label}</span>
                    {option.meta ? <span className="text-xs text-slate-500">{option.meta}</span> : null}
                  </label>
                </li>
              ))
            )}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
