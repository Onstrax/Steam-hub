"use client";

import Image from "next/image";
import { Gamepad2, MonitorPlay, Users } from "lucide-react";

import type { LibraryGame, LibraryUserStatus } from "@/lib/filters-state";
import { formatHltbHours, formatPlaytimeHours, formatReviewScore } from "@/lib/filters-state";
import { ControllerBadge, ProtonDbBadge } from "@/components/game-badge";
import { Badge } from "@/components/ui/badge";
import { GameStatusSelect } from "@/components/game-status-select";

export function GameCard({
  game,
  onPatchStatus,
  onOpen,
}: {
  game: LibraryGame;
  onPatchStatus: (appid: number, userStatus: LibraryUserStatus) => void;
  onOpen?: (game: LibraryGame) => void;
}) {
  return (
    <article
      className={`group flex flex-col overflow-hidden rounded-lg border border-steam-border bg-steam-panel shadow-sm transition-colors hover:border-steam/60 ${
        onOpen ? "cursor-pointer" : ""
      }`}
      onClick={onOpen ? () => onOpen(game) : undefined}
      {...(onOpen
        ? {
            role: "button",
            tabIndex: 0,
            onKeyDown: (event: React.KeyboardEvent<HTMLElement>) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onOpen(game);
              }
            },
          }
        : {})}
    >
      <div className="relative aspect-[460/215] w-full bg-slate-900">
        {game.headerImage ? (
          <Image
            src={game.headerImage}
            alt={game.name}
            fill
            sizes="(max-width: 768px) 100vw, 320px"
            className="object-cover"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-slate-500">Sin carátula</div>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-3 p-3">
        <div>
          <h3 className="line-clamp-2 text-sm font-semibold text-slate-100">{game.name}</h3>
          <p className="mt-1 text-xs text-slate-400">
            Jugado: <span className="text-slate-200">{formatPlaytimeHours(game.playtimeForever)}</span>
            {" · "}
            HLTB: <span className="text-slate-200">{formatHltbHours(game.hltbMainStory)}</span>
            {" · "}
            Reseñas: <span className="text-slate-200">{formatReviewScore(game.reviewScore)}</span>
          </p>
        </div>

        <div className="flex flex-wrap gap-1.5">
          <ControllerBadge support={game.controllerSupport} />
          <ProtonDbBadge tier={game.protonDbTier} />
          {game.isLocalCoop ? (
            <Badge variant="info">
              <Gamepad2 className="size-3" />
              Co-op local
            </Badge>
          ) : null}
          {game.isSplitScreen ? (
            <Badge variant="info">
              <MonitorPlay className="size-3" />
              Pantalla partida
            </Badge>
          ) : null}
          {game.maxPlayers && game.maxPlayers > 1 ? (
            <Badge variant="muted">
              <Users className="size-3" />
              {game.maxPlayers} jug.
            </Badge>
          ) : null}
        </div>

        <div className="flex items-center gap-2" onClick={(event) => event.stopPropagation()}>
          <span className="text-[11px] uppercase tracking-wide text-slate-500">Estado</span>
          <GameStatusSelect appid={game.appid} value={game.userStatus} onPatch={onPatchStatus} />
        </div>

        {game.friends.length > 0 ? (
          <div className="mt-auto flex items-center gap-2 border-t border-slate-700/60 pt-2">
            <div className="flex -space-x-2">
              {game.friends.slice(0, 4).map((friend) =>
                friend.avatarfull ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={friend.steamid}
                    src={friend.avatarfull}
                    alt={friend.personaname ?? friend.steamid}
                    title={friend.personaname ?? friend.steamid}
                    className="size-6 rounded-full border border-slate-800 bg-slate-800"
                  />
                ) : (
                  <span
                    key={friend.steamid}
                    title={friend.personaname ?? friend.steamid}
                    className="flex size-6 items-center justify-center rounded-full border border-slate-800 bg-slate-700 text-[10px] text-slate-300"
                  >
                    {(friend.personaname ?? "?").slice(0, 1).toUpperCase()}
                  </span>
                ),
              )}
            </div>
            <span className="text-xs text-slate-400">
              {game.friends.length === 1
                ? game.friends[0].personaname ?? "1 amigo"
                : `${game.friends.length} amigos lo tienen`}
            </span>
          </div>
        ) : null}
      </div>
    </article>
  );
}
