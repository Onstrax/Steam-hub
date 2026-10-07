"use client";

import { cn } from "@/lib/utils";

export interface DualRangeSliderProps {
  label: string;
  min: number;
  max: number;
  step?: number;
  valueMin: number | null;
  valueMax: number | null;
  unit?: string;
  onChange: (next: { min: number | null; max: number | null }) => void;
  onClear?: () => void;
  disabled?: boolean;
  formatValue?: (value: number) => string;
}

export function DualRangeSlider({
  label,
  min,
  max,
  step = 1,
  valueMin,
  valueMax,
  unit,
  onChange,
  onClear,
  disabled = false,
  formatValue,
}: DualRangeSliderProps) {
  const isActive = valueMin !== null || valueMax !== null;
  const displayMin = valueMin ?? min;
  const displayMax = valueMax ?? max;

  const format = (value: number) => {
    if (formatValue) return formatValue(value);
    return unit ? `${value}${unit}` : String(value);
  };

  const handleMinChange = (raw: number) => {
    const nextMin = Math.min(raw, displayMax);
    onChange({ min: nextMin, max: displayMax });
  };

  const handleMaxChange = (raw: number) => {
    const nextMax = Math.max(raw, displayMin);
    onChange({ min: displayMin, max: nextMax });
  };

  return (
    <fieldset className="space-y-2">
      <div className="flex items-center justify-between">
        <legend className="text-xs font-semibold uppercase tracking-wide text-slate-400">
          {label}
        </legend>
        <div className="flex items-center gap-2">
          <span className="text-xs tabular-nums text-slate-200">
            {isActive ? `${format(displayMin)} – ${format(displayMax)}` : "Sin filtro"}
          </span>
          {isActive && onClear ? (
            <button
              type="button"
              onClick={onClear}
              disabled={disabled}
              className="rounded p-0.5 text-slate-400 hover:bg-white/10 hover:text-slate-100 disabled:opacity-40"
              aria-label={`Limpiar filtro ${label}`}
            >
              ×
            </button>
          ) : null}
        </div>
      </div>

      <div className="space-y-1">
        <label className="flex items-center gap-2 text-xs text-slate-400">
          <span className="w-6">Min</span>
          <input
            type="range"
            min={min}
            max={max}
            step={step}
            value={displayMin}
            disabled={disabled}
            onChange={(event) => handleMinChange(Number(event.target.value))}
            aria-label={`${label} mínimo`}
          />
          <span className="w-14 text-right tabular-nums text-slate-200">{format(displayMin)}</span>
        </label>
        <label className="flex items-center gap-2 text-xs text-slate-400">
          <span className="w-6">Máx</span>
          <input
            type="range"
            min={min}
            max={max}
            step={step}
            value={displayMax}
            disabled={disabled}
            onChange={(event) => handleMaxChange(Number(event.target.value))}
            aria-label={`${label} máximo`}
          />
          <span className={cn("w-14 text-right tabular-nums text-slate-200")}>{format(displayMax)}</span>
        </label>
      </div>
    </fieldset>
  );
}
