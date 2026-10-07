"use client";

import { useMemo, useState } from "react";
import {
  createColumnHelper,
  createSortedRowModel,
  rowSortingFeature,
  sortFn_alphanumeric,
  sortFn_basic,
  tableFeatures,
  useTable,
  type SortingState,
} from "@tanstack/react-table";
import { ArrowDown, ArrowUp } from "lucide-react";

import type { LibraryGame, LibraryUserStatus } from "@/lib/filters-state";
import { formatHltbHours, formatPlaytimeHours, formatReviewScore, userStatusLabel } from "@/lib/filters-state";
import { cn } from "@/lib/utils";
import { ControllerBadge, ProtonDbBadge } from "@/components/game-badge";
import { GameStatusSelect } from "@/components/game-status-select";

const features = tableFeatures({
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
});

const columnHelper = createColumnHelper<typeof features, LibraryGame>();

export function GameTable({
  games,
  onPatchStatus,
  onRowClick,
}: {
  games: LibraryGame[];
  onPatchStatus: (appid: number, userStatus: LibraryUserStatus) => void;
  onRowClick?: (game: LibraryGame) => void;
}) {
  const [sorting, setSorting] = useState<SortingState>([]);

  const columns = useMemo(
    () =>
      columnHelper.columns([
        columnHelper.accessor((row) => row.name, {
          id: "name",
          header: "Nombre",
          sortFn: sortFn_alphanumeric,
        }),
        columnHelper.accessor((row) => row.playtimeForever ?? -1, {
          id: "playtime",
          header: "Jugado",
          cell: (info) => formatPlaytimeHours(info.getValue() >= 0 ? info.getValue() : null),
          sortFn: sortFn_basic,
        }),
        columnHelper.accessor((row) => row.hltbMainStory ?? 0, {
          id: "hltb",
          header: "HLTB",
          cell: (info) => formatHltbHours(info.getValue() > 0 ? info.getValue() : null),
          sortFn: sortFn_basic,
        }),
        columnHelper.accessor((row) => row.controllerSupport ?? "unknown", {
          id: "controller",
          header: "Mando",
          cell: (info) => {
            const support = info.getValue();
            return <ControllerBadge support={support === "unknown" ? null : support} />;
          },
          sortFn: sortFn_alphanumeric,
        }),
        columnHelper.accessor((row) => Boolean(row.isLocalCoop), {
          id: "localCoop",
          header: "Co-op local",
          cell: (info) => (info.getValue() ? "Sí" : "—"),
          sortFn: sortFn_alphanumeric,
        }),
        columnHelper.accessor((row) => Boolean(row.isSplitScreen), {
          id: "splitScreen",
          header: "Split-screen",
          cell: (info) => (info.getValue() ? "Sí" : "—"),
          sortFn: sortFn_alphanumeric,
        }),
        columnHelper.accessor((row) => row.maxPlayers ?? 0, {
          id: "maxPlayers",
          header: "Jug. máx.",
          sortFn: sortFn_basic,
        }),
        columnHelper.accessor((row) => row.protonDbTier ?? "UNKNOWN", {
          id: "linux",
          header: "Linux",
          cell: (info) => (
            <ProtonDbBadge tier={info.getValue() === "UNKNOWN" ? null : info.getValue()} />
          ),
          sortFn: sortFn_alphanumeric,
        }),
        columnHelper.accessor((row) => row.reviewScore ?? 0, {
          id: "review",
          header: "Reseñas",
          cell: (info) => formatReviewScore(info.getValue() > 0 ? info.getValue() : null),
          sortFn: sortFn_basic,
        }),
        columnHelper.accessor((row) => userStatusLabel(row.userStatus), {
          id: "status",
          header: "Estado",
          sortFn: sortFn_alphanumeric,
        }),
        columnHelper.accessor((row) => row.friends.length, {
          id: "friends",
          header: "Amigos",
          sortFn: sortFn_basic,
        }),
      ]),
    [],
  );

  const table = useTable({
    features,
    columns,
    data: games,
    state: { sorting },
    onSortingChange: (updater) => {
      setSorting((previous) => (typeof updater === "function" ? updater(previous) : updater));
    },
  });

  return (
    <div className="overflow-x-auto rounded-lg border border-steam-border bg-steam-panel/60">
      <table className="w-full min-w-[900px] border-collapse text-sm">
        <thead>
          {table.getHeaderGroups().map((headerGroup) => (
            <tr key={headerGroup.id} className="border-b border-steam-border bg-slate-900/70">
              {headerGroup.headers.map((header) => {
                const sorted = header.column.getIsSorted();
                return (
                  <th key={header.id} className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">
                    {header.column.getCanSort() ? (
                      <button
                        type="button"
                        onClick={header.column.getToggleSortingHandler()}
                        className="inline-flex items-center gap-1 hover:text-steam"
                      >
                        {table.FlexRender ? (
                          <table.FlexRender header={header} />
                        ) : null}
                        {sorted === "asc" ? <ArrowUp className="size-3" /> : null}
                        {sorted === "desc" ? <ArrowDown className="size-3" /> : null}
                      </button>
                    ) : (
                      table.FlexRender && <table.FlexRender header={header} />
                    )}
                  </th>
                );
              })}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="px-3 py-8 text-center text-sm text-slate-400">
                Ningún juego coincide con los filtros actuales.
              </td>
            </tr>
          ) : (
            table.getRowModel().rows.map((row) => (
              <tr
                key={row.id}
                className={cn(
                  "border-b border-slate-800/80 hover:bg-white/5",
                  onRowClick ? "cursor-pointer" : undefined,
                )}
                onClick={onRowClick ? () => onRowClick(row.original) : undefined}
              >
                {row.getAllCells().map((cell) => (
                  <td key={cell.id} className="px-3 py-2 text-slate-200">
                    {cell.column.id === "status" ? (
                      <GameStatusSelect
                        appid={row.original.appid}
                        value={row.original.userStatus}
                        onPatch={onPatchStatus}
                        compact
                      />
                    ) : (
                      table.FlexRender && <table.FlexRender cell={cell} />
                    )}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
