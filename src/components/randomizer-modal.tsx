"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { Dices, RefreshCw, X } from "lucide-react";

import type { LibraryGame } from "@/lib/filters-state";
import { formatHltbHours, formatPlaytimeHours } from "@/lib/filters-state";
import { nextCyclingIndex, pickRandomGame } from "@/lib/randomizer";
import { Button } from "@/components/ui/button";

const CYCLE_START_MS = 70;
const CYCLE_END_MS = 280;
const CYCLE_TOTAL_MS = 1400;

export function RandomizerModal({
  open,
  games,
  onClose,
}: {
  open: boolean;
  games: LibraryGame[];
  onClose: () => void;
}) {
  const [displayIndex, setDisplayIndex] = useState(0);
  const [picked, setPicked] = useState<LibraryGame | null>(null);
  const [spinning, setSpinning] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stopCycle = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setSpinning(false);
  }, []);

  const roll = useCallback(() => {
    if (games.length === 0) {
      setPicked(null);
      return;
    }

    stopCycle();
    setPicked(null);
    setSpinning(true);

    const startedAt = Date.now();
    let current = Math.floor(Math.random() * games.length);

    const tick = () => {
      const elapsed = Date.now() - startedAt;
      if (elapsed >= CYCLE_TOTAL_MS) {
        const finalGame = pickRandomGame(games);
        setPicked(finalGame);
        setSpinning(false);
        timerRef.current = null;
        return;
      }

      current = nextCyclingIndex(current, games.length);
      setDisplayIndex(current);

      const progress = elapsed / CYCLE_TOTAL_MS;
      const delay = CYCLE_START_MS + (CYCLE_END_MS - CYCLE_START_MS) * progress * progress;
      timerRef.current = setTimeout(tick, delay);
    };

    tick();
  }, [games, stopCycle]);

  useEffect(() => {
    if (!open) {
      stopCycle();
      setPicked(null);
      return;
    }
    roll();
  }, [open, roll, stopCycle]);

  useEffect(() => {
    if (!open) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  useEffect(() => stopCycle, [stopCycle]);

  if (!open) return null;

  const featured = picked ?? games[displayIndex] ?? null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="¿Qué jugamos hoy?"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-md overflow-hidden rounded-xl border border-steam-border bg-steam-panel shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar"
          className="absolute right-3 top-3 z-10 rounded-full bg-slate-950/70 p-1.5 text-slate-300 hover:bg-slate-950 hover:text-white"
        >
          <X className="size-4" />
        </button>

        <div className="flex items-center gap-2 border-b border-slate-700/60 px-5 py-3">
          <Dices className={spinning ? "size-5 animate-spin text-steam" : "size-5 text-steam"} />
          <h2 className="text-base font-semibold text-slate-100">¿Qué jugamos hoy?</h2>
        </div>

        {games.length === 0 ? (
          <div className="px-5 py-10 text-center text-sm text-slate-400">
            No hay juegos con los filtros actuales. Ajusta los filtros para usar la ruleta.
          </div>
        ) : featured ? (
          <div className="px-5 pb-5 pt-4">
            <div
              className={
                spinning
                  ? "overflow-hidden rounded-lg border border-steam/40 opacity-80 blur-[1px]"
                  : "overflow-hidden rounded-lg border border-steam shadow-[0_0_24px_rgba(102,192,244,0.25)]"
              }
            >
              <div className="relative aspect-[460/215] w-full bg-slate-900">
                {featured.headerImage ? (
                  <Image
                    src={featured.headerImage}
                    alt={featured.name}
                    fill
                    sizes="(max-width: 768px) 100vw, 448px"
                    className="object-cover"
                  />
                ) : null}
              </div>
              <div className="space-y-1 bg-slate-900/80 p-4">
                <h3 className="text-lg font-semibold text-slate-100">{featured.name}</h3>
                <p className="text-sm text-slate-300">
                  Jugado: {formatPlaytimeHours(featured.playtimeForever)} · HLTB:{" "}
                  {formatHltbHours(featured.hltbMainStory)}
                </p>
                {featured.categories.length > 0 ? (
                  <p className="line-clamp-2 text-xs text-slate-400">
                    {featured.categories.slice(0, 6).join(" · ")}
                  </p>
                ) : null}
              </div>
            </div>

            <div className="mt-4 flex items-center justify-between gap-3">
              <Button variant="secondary" onClick={roll} disabled={spinning}>
                <RefreshCw className="size-4" />
                Otra vez
              </Button>
              <p className="text-xs text-slate-400">
                {spinning ? "Sorteando…" : `Elegido entre ${games.length} juegos filtrados`}
              </p>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
