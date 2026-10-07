"use client";

import { USER_STATUS_OPTIONS, type LibraryUserStatus } from "@/lib/filters-state";
import { cn } from "@/lib/utils";

export function GameStatusSelect({
  appid,
  value,
  onPatch,
  compact = false,
}: {
  appid: number;
  value: string | null;
  onPatch: (appid: number, userStatus: LibraryUserStatus) => void;
  compact?: boolean;
}) {
  return (
    <select
      aria-label={`Estado del juego ${appid}`}
      value={value ?? "Backlog"}
      onClick={(event) => event.stopPropagation()}
      onChange={(event) => onPatch(appid, event.target.value as LibraryUserStatus)}
      className={cn(
        "h-8 rounded-md border border-steam-border bg-slate-900 text-xs text-slate-100",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-steam",
        compact ? "w-full px-1.5" : "w-full px-2",
      )}
    >
      {USER_STATUS_OPTIONS.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}
