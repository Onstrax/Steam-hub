"use client";

import { useCallback, useMemo, useState } from "react";
import { LayoutGrid, Table2, LibraryBig, Loader2, Dices } from "lucide-react";

import { DEFAULT_FILTERS, countActiveFilters, type LibraryFilters, type LibraryGame } from "@/lib/filters-state";
import { useLibraryGames, useLibraryMeta } from "@/lib/hooks/use-library";
import { FiltersSidebar } from "@/components/filters-sidebar";
import { GameCard } from "@/components/game-card";
import { GameDetailModal } from "@/components/game-detail-modal";
import { GameTable } from "@/components/game-table";
import { RandomizerModal } from "@/components/randomizer-modal";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { SyncButton } from "@/components/sync-button";

type ViewMode = "grid" | "table";

export default function Home() {
  const [filters, setFilters] = useState<LibraryFilters>(DEFAULT_FILTERS);
  const [view, setView] = useState<ViewMode>("table");
  const [randomizerOpen, setRandomizerOpen] = useState(false);
  const [detailGame, setDetailGame] = useState<LibraryGame | null>(null);

  const { games, count, loading, error, refetch, patchUserStatus } = useLibraryGames(filters);
  const meta = useLibraryMeta();

  const patchFilters = useCallback((patch: Partial<LibraryFilters>) => {
    setFilters((previous) => ({ ...previous, ...patch }));
  }, []);

  const resetFilters = useCallback(() => setFilters(DEFAULT_FILTERS), []);

  const handleSyncSettled = useCallback(() => {
    refetch();
    meta.refetch();
  }, [refetch, meta]);

  const activeCount = useMemo(() => countActiveFilters(filters), [filters]);

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <header className="sticky top-0 z-30 border-b border-steam-border bg-slate-950/90 backdrop-blur">
        <div className="mx-auto flex w-full max-w-[1600px] flex-wrap items-center justify-between gap-4 px-4 py-3">
          <div className="flex items-center gap-3">
            <span className="flex size-9 items-center justify-center rounded-lg bg-steam text-slate-950">
              <LibraryBig className="size-5" />
            </span>
            <div>
              <h1 className="text-base font-semibold text-slate-100">Steam Local Library Hub</h1>
              <p className="text-xs text-slate-400">
                {loading ? "Cargando biblioteca…" : `${count} juegos${activeCount > 0 ? ` · ${activeCount} filtros activos` : ""}`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <SegmentedControl<ViewMode>
              ariaLabel="Cambiar vista"
              value={view}
              onChange={setView}
              options={[
                { value: "grid", label: "Cuadrícula", icon: <LayoutGrid className="size-3.5" />, title: "Vista de cuadrícula" },
                { value: "table", label: "Tabla", icon: <Table2 className="size-3.5" />, title: "Vista de tabla" },
              ]}
            />
            <button
              type="button"
              onClick={() => setRandomizerOpen(true)}
              disabled={loading && games.length === 0}
              className="inline-flex h-10 items-center gap-2 rounded-md border border-steam-border bg-slate-900 px-4 text-sm font-medium text-slate-100 transition-colors hover:border-steam hover:text-steam disabled:cursor-not-allowed disabled:opacity-50"
              title="Sugerir un juego al azar de la lista filtrada"
            >
              <Dices className="size-4" />
              Sugerir juego
            </button>
            <SyncButton onSettled={handleSyncSettled} />
          </div>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-[1600px] flex-1 gap-0">
        <div className="hidden w-80 shrink-0 lg:block">
          <FiltersSidebar
            filters={filters}
            onChange={patchFilters}
            onReset={resetFilters}
            friends={meta.friends}
            genres={meta.genres}
            metaLoading={meta.loading}
            metaError={meta.error}
          />
        </div>

        <main className="flex-1 p-4">
          {error ? (
            <div
              role="alert"
              className="mb-4 rounded-md border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-200"
            >
              {error}
              <button type="button" onClick={refetch} className="ml-2 underline hover:text-rose-100">
                Reintentar
              </button>
            </div>
          ) : null}

          {loading && games.length === 0 && !error ? (
            <div className="flex h-64 items-center justify-center gap-2 text-slate-400">
              <Loader2 className="size-5 animate-spin" />
              Consultando la base de datos local…
            </div>
          ) : null}

          {!loading && !error && games.length === 0 ? (
            <div className="flex h-64 flex-col items-center justify-center gap-2 text-slate-400">
              <LibraryBig className="size-8" />
              <p className="text-sm">Ningún juego coincide con los filtros actuales.</p>
              {activeCount > 0 ? (
                <button type="button" onClick={resetFilters} className="text-sm text-steam hover:underline">
                  Restablecer filtros
                </button>
              ) : null}
            </div>
          ) : null}

          {view === "grid" && games.length > 0 ? (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-4">
              {games.map((game) => (
                <GameCard
                  key={game.appid}
                  game={game}
                  onPatchStatus={patchUserStatus}
                  onOpen={setDetailGame}
                />
              ))}
            </div>
          ) : null}

          {view === "table" && games.length > 0 ? (
            <GameTable games={games} onPatchStatus={patchUserStatus} onRowClick={setDetailGame} />
          ) : null}
        </main>
      </div>

      <RandomizerModal open={randomizerOpen} games={games} onClose={() => setRandomizerOpen(false)} />

      {detailGame ? (
        <GameDetailModal game={detailGame} onClose={() => setDetailGame(null)} />
      ) : null}

      <div className="border-t border-steam-border p-4 lg:hidden">
        <FiltersSidebar
          filters={filters}
          onChange={patchFilters}
          onReset={resetFilters}
          friends={meta.friends}
          genres={meta.genres}
          metaLoading={meta.loading}
          metaError={meta.error}
        />
      </div>
    </div>
  );
}
