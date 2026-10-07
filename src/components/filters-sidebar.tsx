"use client";

import { Search, RotateCcw, Gamepad2, LayoutGrid, Users, Tag, CloudCog, ArrowDownAZ, ArrowUpZA } from "lucide-react";

import type {
  LibraryControllerSupport,
  LibraryFilters,
  LibraryFriend,
  LibraryProtonDbTier,
  LibrarySortField,
  LibraryStateFilter,
} from "@/lib/filters-state";
import {
  CONTROLLER_SUPPORT_OPTIONS,
  HLTB_SLIDER_MAX_HOURS,
  LIBRARY_SORT_FIELDS,
  LIBRARY_SORT_LABELS,
  LIBRARY_STATE_OPTIONS,
  PLAYERS_SLIDER_MAX,
  PLAYERS_SLIDER_MIN,
  PLAYTIME_SLIDER_MAX_HOURS,
  PROTON_DB_TIER_OPTIONS,
  countActiveFilters,
} from "@/lib/filters-state";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DualRangeSlider } from "@/components/ui/dual-range-slider";
import { MultiSelect } from "@/components/ui/multi-select";
import { Select } from "@/components/ui/select";

export interface FiltersSidebarProps {
  filters: LibraryFilters;
  onChange: (patch: Partial<LibraryFilters>) => void;
  onReset: () => void;
  friends: LibraryFriend[];
  genres: string[];
  metaLoading: boolean;
  metaError: string | null;
}

export function FiltersSidebar({
  filters,
  onChange,
  onReset,
  friends,
  genres,
  metaLoading,
  metaError,
}: FiltersSidebarProps) {
  const activeCount = countActiveFilters(filters);

  return (
    <aside className="flex h-full flex-col gap-6 overflow-y-auto border-r border-steam-border bg-steam-panel/60 p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-300">Filtros</h2>
        <div className="flex items-center gap-2">
          {activeCount > 0 ? (
            <span className="rounded-full bg-steam/20 px-2 py-0.5 text-xs font-medium text-steam">
              {activeCount} activos
            </span>
          ) : null}
          <Button variant="ghost" size="sm" onClick={onReset} disabled={activeCount === 0}>
            <RotateCcw className="size-3.5" />
            Restablecer
          </Button>
        </div>
      </div>

      <div>
        <label htmlFor="library-search" className="text-xs font-semibold uppercase tracking-wide text-slate-400">
          Búsqueda
        </label>
        <div className="relative mt-1.5">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-500" />
          <input
            id="library-search"
            type="search"
            value={filters.search}
            onChange={(event) => onChange({ search: event.target.value })}
            placeholder="Buscar por título…"
            className={cn(
              "h-9 w-full rounded-md border border-steam-border bg-slate-900 pl-9 pr-3 text-sm text-slate-100",
              "placeholder:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-steam",
            )}
          />
        </div>
      </div>

      <div className="space-y-4 border-t border-slate-700/60 pt-4">
        <DualRangeSlider
          label="Horas jugadas"
          min={0}
          max={PLAYTIME_SLIDER_MAX_HOURS}
          valueMin={filters.playtimeMin}
          valueMax={filters.playtimeMax}
          unit=" h"
          onChange={(next) => onChange({ playtimeMin: next.min, playtimeMax: next.max })}
          onClear={() => onChange({ playtimeMin: null, playtimeMax: null })}
        />
        <DualRangeSlider
          label="Duración HLTB (historia)"
          min={0}
          max={HLTB_SLIDER_MAX_HOURS}
          valueMin={filters.hltbMin}
          valueMax={filters.hltbMax}
          unit=" h"
          onChange={(next) => onChange({ hltbMin: next.min, hltbMax: next.max })}
          onClear={() => onChange({ hltbMin: null, hltbMax: null })}
        />
        <DualRangeSlider
          label="Jugadores"
          min={PLAYERS_SLIDER_MIN}
          max={PLAYERS_SLIDER_MAX}
          valueMin={filters.playersMin}
          valueMax={filters.playersMax}
          onChange={(next) => onChange({ playersMin: next.min, playersMax: next.max })}
          onClear={() => onChange({ playersMin: null, playersMax: null })}
        />
      </div>

      <div className="space-y-3 border-t border-slate-700/60 pt-4">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
          <Gamepad2 className="size-3.5" />
          Modos de juego
        </div>
        <Checkbox
          id="filter-local-coop"
          label="Co-op local"
          checked={filters.isLocalCoop}
          onChange={(event) => onChange({ isLocalCoop: event.target.checked })}
        />
        <Checkbox
          id="filter-split-screen"
          label="Pantalla partida"
          checked={filters.isSplitScreen}
          onChange={(event) => onChange({ isSplitScreen: event.target.checked })}
        />
      </div>

      <div className="space-y-3 border-t border-slate-700/60 pt-4">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
          <CloudCog className="size-3.5" />
          Soporte de mando
        </div>
        <Select
          aria-label="Soporte de mando"
          value={filters.controllerSupport ?? ""}
          onChange={(event) =>
            onChange({ controllerSupport: (event.target.value || null) as LibraryControllerSupport | null })
          }
          options={CONTROLLER_SUPPORT_OPTIONS.map((option) => ({ ...option }))}
          placeholder="Todos"
        />
      </div>

      <div className="space-y-3 border-t border-steam-border/60 pt-4">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
          <CloudCog className="size-3.5" />
          Estado del juego
        </div>
        <Select
          aria-label="Estado del juego"
          value={filters.userStatus ?? ""}
          onChange={(event) =>
            onChange({ userStatus: (event.target.value || null) as LibraryStateFilter | null })
          }
          options={LIBRARY_STATE_OPTIONS.map((option) => ({ ...option }))}
          placeholder="Cualquiera"
        />
      </div>

      <div className="space-y-3 border-t border-slate-700/60 pt-4">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
          <CloudCog className="size-3.5" />
          ProtonDB
        </div>
        <Select
          aria-label="Compatibilidad ProtonDB"
          value={filters.protonDbTier ?? ""}
          onChange={(event) =>
            onChange({ protonDbTier: (event.target.value || null) as LibraryProtonDbTier | null })
          }
          options={PROTON_DB_TIER_OPTIONS.map((option) => ({ ...option }))}
          placeholder="Cualquiera"
        />
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400">Reseñas positivas (mínimo)</span>
            <span className="text-xs tabular-nums text-slate-200">
              {filters.minReview !== null ? `${filters.minReview}%` : "Sin filtro"}
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={filters.minReview ?? 0}
            onChange={(event) => onChange({ minReview: Number(event.target.value) })}
            aria-label="Reseñas positivas mínimas"
            className="w-full"
          />
          {filters.minReview !== null ? (
            <button
              type="button"
              onClick={() => onChange({ minReview: null })}
              className="text-xs text-steam hover:underline"
            >
              Limpiar filtro de reseñas
            </button>
          ) : null}
        </div>
      </div>

      <div className="space-y-3 border-t border-slate-700/60 pt-4">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
          <Users className="size-3.5" />
          Amigos
        </div>
        <MultiSelect
          label="Poseído por (todos los elegidos)"
          options={friends.map((friend) => ({
            value: friend.steamid,
            label: friend.personaname ?? friend.steamid,
            avatar: friend.avatarfull,
            meta: friend.gameCount > 0 ? `${friend.gameCount}` : undefined,
          }))}
          selected={filters.friendIds}
          onChange={(next) => onChange({ friendIds: next })}
          loading={metaLoading}
          error={metaError}
          placeholder="Cualquier amigo"
        />
      </div>

      <div className="space-y-3 border-t border-slate-700/60 pt-4">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
          <Tag className="size-3.5" />
          Géneros y etiquetas
        </div>
        <MultiSelect
          label="Cualquiera de"
          searchable
          options={genres.map((genre) => ({ value: genre, label: genre }))}
          selected={filters.genres}
          onChange={(next) => onChange({ genres: next })}
          loading={metaLoading}
          error={metaError}
          placeholder="Todos los géneros"
        />
      </div>

      <div className="space-y-3 border-t border-slate-700/60 pt-4">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
          <LayoutGrid className="size-3.5" />
          Orden
        </div>
        <div className="flex gap-2">
          <Select
            aria-label="Ordenar por"
            className="flex-1"
            value={filters.sortBy}
            onChange={(event) => onChange({ sortBy: event.target.value as LibrarySortField })}
            options={LIBRARY_SORT_FIELDS.map((field) => ({ value: field, label: LIBRARY_SORT_LABELS[field] }))}
          />
          <Button
            variant="secondary"
            size="md"
            onClick={() => onChange({ sortOrder: filters.sortOrder === "asc" ? "desc" : "asc" })}
            title={filters.sortOrder === "asc" ? "Ascendente" : "Descendente"}
            aria-label={`Orden ${filters.sortOrder === "asc" ? "ascendente" : "descendente"}`}
          >
            {filters.sortOrder === "asc" ? <ArrowDownAZ className="size-4" /> : <ArrowUpZA className="size-4" />}
          </Button>
        </div>
      </div>
    </aside>
  );
}
