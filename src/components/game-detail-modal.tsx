"use client";

import { useEffect } from "react";
import Image from "next/image";
import { Gamepad2, MonitorPlay, Users } from "lucide-react";

import type { LibraryGame } from "@/lib/filters-state";
import { formatHltbHours, formatPlaytimeHours, formatReviewScore, userStatusLabel } from "@/lib/filters-state";
import { Button } from "@/components/ui/button";
import { ControllerBadge, ProtonDbBadge } from "@/components/game-badge";

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">{children}</h3>
  );
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-slate-800/80 py-1.5 last:border-b-0">
      <span className="text-xs text-slate-400">{label}</span>
      <span className="text-right text-sm text-slate-100">{value}</span>
    </div>
  );
}

export function GameDetailModal({
  game,
  onClose,
}: {
  game: LibraryGame;
  onClose: () => void;
}) {
  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  const hasActiveDiscount = typeof game.discountPercent === "number" && game.discountPercent > 0;
  const hasHistorical =
    Boolean(game.lowestPrice) ||
    (typeof game.lowestDiscountPercent === "number" && game.lowestDiscountPercent > 0);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={`Detalle de ${game.name}`}
      onClick={onClose}
    >
      <div
        className="relative flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-steam-border bg-steam-panel shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar"
          className="absolute right-3 top-3 z-10 rounded-full bg-slate-950/70 p-1.5 text-slate-300 hover:bg-slate-950 hover:text-white"
        >
          <span aria-hidden="true">×</span>
        </button>

        <div className="flex-1 overflow-y-auto">
          <div className="relative aspect-[460/215] w-full bg-slate-900">
            {game.headerImage ? (
              <Image
                src={game.headerImage}
                alt={game.name}
                fill
                sizes="(max-width: 768px) 100vw, 672px"
                className="object-cover"
              />
            ) : (
              <div className="flex h-full items-center justify-center text-xs text-slate-500">Sin carátula</div>
            )}
          </div>

          <div className="space-y-5 p-5">
            <div>
              <h2 className="text-lg font-semibold text-slate-100">{game.name}</h2>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <ProtonDbBadge tier={game.protonDbTier} />
                <ControllerBadge support={game.controllerSupport} />
                {game.isLocalCoop ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-sky-500/20 px-2 py-0.5 text-[11px] font-medium text-sky-300 ring-1 ring-inset ring-sky-500/30">
                    <Gamepad2 className="size-3" />
                    Co-op local
                  </span>
                ) : null}
                {game.isSplitScreen ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-sky-500/20 px-2 py-0.5 text-[11px] font-medium text-sky-300 ring-1 ring-inset ring-sky-500/30">
                    <MonitorPlay className="size-3" />
                    Pantalla partida
                  </span>
                ) : null}
                {game.maxPlayers && game.maxPlayers > 1 ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-slate-800 px-2 py-0.5 text-[11px] font-medium text-slate-300 ring-1 ring-inset ring-slate-600/40">
                    <Users className="size-3" />
                    {game.maxPlayers} jug.
                  </span>
                ) : null}
              </div>
            </div>

            {game.shortDescription ? (
              <p className="text-sm leading-relaxed text-slate-300">{game.shortDescription}</p>
            ) : null}

            <section>
              <SectionTitle>Precios</SectionTitle>
              <div className="rounded-lg border border-slate-800 bg-slate-900/50 px-3 py-1">
                <InfoRow
                  label="Precio actual"
                  value={
                    game.currentPrice ? (
                      <span className={hasActiveDiscount ? "text-emerald-300" : undefined}>
                        {game.currentPrice}
                      </span>
                    ) : (
                      <span className="text-slate-500">—</span>
                    )
                  }
                />
                <InfoRow
                  label="Descuento activo"
                  value={
                    hasActiveDiscount ? (
                      <span className="text-emerald-300">
                        −{game.discountPercent}%
                        {game.initialPrice ? <span className="ml-1 text-slate-400 line-through">{game.initialPrice}</span> : null}
                      </span>
                    ) : (
                      <span className="text-slate-500">—</span>
                    )
                  }
                />
                <InfoRow
                  label="Mayor rebaja histórica"
                  value={
                    hasHistorical ? (
                      <span className="text-amber-300">
                        {typeof game.lowestDiscountPercent === "number" && game.lowestDiscountPercent > 0
                          ? `−${game.lowestDiscountPercent}%`
                          : "—"}
                        {game.lowestPrice ? (
                          <span className="ml-1 text-slate-200">· mín. {game.lowestPrice}</span>
                        ) : null}
                        {game.lowestPriceDate ? (
                          <span className="ml-1 text-slate-400">· {game.lowestPriceDate}</span>
                        ) : null}
                      </span>
                    ) : (
                      <span className="text-slate-500">—</span>
                    )
                  }
                />
              </div>
            </section>

            <section>
              <SectionTitle>Amigos que lo poseen</SectionTitle>
              {game.friends.length > 0 ? (
                <ul className="space-y-2">
                  {game.friends.map((friend) => (
                    <li
                      key={friend.steamid}
                      className="flex items-center gap-3 rounded-lg border border-slate-800 bg-slate-900/50 px-3 py-2"
                    >
                      {friend.avatarfull ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={friend.avatarfull}
                          alt={friend.personaname ?? friend.steamid}
                          className="size-9 rounded-full border border-slate-700 bg-slate-800"
                        />
                      ) : (
                        <span className="flex size-9 items-center justify-center rounded-full border border-slate-700 bg-slate-800 text-sm text-slate-300">
                          {(friend.personaname ?? "?").slice(0, 1).toUpperCase()}
                        </span>
                      )}
                      <span className="text-sm text-slate-100">
                        {friend.personaname ?? friend.steamid}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="rounded-lg border border-slate-800 bg-slate-900/50 px-3 py-3 text-sm text-slate-400">
                  Ningún amigo visible comparte este juego.
                </p>
              )}
            </section>

            <section>
              <SectionTitle>Metadatos extendidos</SectionTitle>
              <div className="rounded-lg border border-slate-800 bg-slate-900/50 px-3 py-1">
                <InfoRow label="Linux (ProtonDB)" value={<ProtonDbBadge tier={game.protonDbTier} />} />
                <InfoRow
                  label="HLTB historia"
                  value={<span>{formatHltbHours(game.hltbMainStory)}</span>}
                />
                <InfoRow
                  label="HLTB +extras"
                  value={<span>{formatHltbHours(game.hltbMainExtra)}</span>}
                />
                <InfoRow
                  label="HLTB completionist"
                  value={<span>{formatHltbHours(game.hltbCompletionist)}</span>}
                />
                <InfoRow
                  label="Multijugador"
                  value={game.isMultiplayer ? <span>Sí</span> : <span className="text-slate-500">No</span>}
                />
                <InfoRow
                  label="Jugadores"
                  value={
                    game.minPlayers != null || game.maxPlayers != null ? (
                      <span>
                        {game.minPlayers ?? "—"}–{game.maxPlayers ?? "—"}
                      </span>
                    ) : (
                      <span className="text-slate-500">—</span>
                    )
                  }
                />
                <InfoRow label="Soporte de mando" value={<ControllerBadge support={game.controllerSupport} />} />
                <InfoRow label="Reseñas" value={<span>{formatReviewScore(game.reviewScore)}</span>} />
                <InfoRow label="Tiempo jugado" value={<span>{formatPlaytimeHours(game.playtimeForever)}</span>} />
                <InfoRow label="Estado" value={<span>{userStatusLabel(game.userStatus)}</span>} />
              </div>
            </section>

            {game.categories.length > 0 ? (
              <section>
                <SectionTitle>Categorías</SectionTitle>
                <div className="flex flex-wrap gap-1.5">
                  {game.categories.map((category) => (
                    <span
                      key={category}
                      className="rounded-full bg-slate-800 px-2 py-0.5 text-[11px] text-slate-300 ring-1 ring-inset ring-slate-700/60"
                    >
                      {category}
                    </span>
                  ))}
                </div>
              </section>
            ) : null}
          </div>
        </div>

        <div className="flex justify-end border-t border-slate-800 px-5 py-3">
          <Button variant="secondary" onClick={onClose}>
            Cerrar
          </Button>
        </div>
      </div>
    </div>
  );
}
