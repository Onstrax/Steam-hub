"use client";

import { Ban, CheckCircle2, RefreshCw, XCircle } from "lucide-react";

import { useSyncController } from "@/lib/hooks/use-library";
import { Button } from "@/components/ui/button";
import { ProgressBar } from "@/components/ui/progress-bar";

export function SyncButton({ onSettled }: { onSettled?: () => void }) {
  const { status, progress, error, isBusy, start, cancel } = useSyncController({ onSettled });

  return (
    <div className="flex min-w-[240px] flex-col gap-2">
      <div className="flex items-center gap-2">
        {isBusy ? (
          <Button variant="secondary" onClick={() => void cancel()} title="Cancelar sincronización">
            <Ban className="size-4" />
            Cancelar
          </Button>
        ) : (
          <Button onClick={() => void start()} loading={status === "starting"}>
            <RefreshCw className={status === "starting" ? "hidden" : "size-4"} />
            Sincronizar biblioteca
          </Button>
        )}

        {status === "completed" && progress ? (
          <span className="inline-flex items-center gap-1 text-xs text-emerald-300">
            <CheckCircle2 className="size-4" />
            {progress.stats.games} juegos
          </span>
        ) : null}
        {status === "cancelled" ? (
          <span className="text-xs text-slate-400">Sincronización cancelada</span>
        ) : null}
        {status === "failed" ? (
          <span className="inline-flex items-center gap-1 text-xs text-rose-300">
            <XCircle className="size-4" />
            Error
          </span>
        ) : null}
      </div>

      {isBusy && progress ? (
        <ProgressBar
          value={progress.percent}
          label={progress.message || progress.phase}
          className="w-56"
        />
      ) : null}

      {error && status === "failed" ? (
        <p className="max-w-xs text-xs text-rose-400">{error}</p>
      ) : null}
    </div>
  );
}
