"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { LibraryFilters, LibraryFriend, LibraryGame, LibraryUserStatus } from "@/lib/filters-state";
import { filtersToSearchParams } from "@/lib/filters-state";

export interface SyncStatsShape {
  games: number;
  newGames: number;
  friends: number;
  friendLibraries: number;
  friendGames: number;
  storeMetadata: number;
  storeFailed: number;
  protonTiers: number;
  protonUnavailable: number;
  cheapsharkPrices: number;
  cheapsharkUnavailable: number;
  hltbMatches: number;
  hltbNotFound: number;
  storeRequests: number;
  protonRequests: number;
  cheapsharkRequests: number;
  hltbRequests: number;
}

export interface SyncProgressShape {
  jobId: string;
  status: "running" | "completed" | "failed" | "cancelled";
  phase: string;
  message: string;
  processed: number;
  total: number;
  percent: number;
  startedAt: string;
  updatedAt: string;
  finishedAt: string | null;
  error: string | null;
  stats: SyncStatsShape;
}

export interface LibraryMeta {
  friends: LibraryFriend[];
  genres: string[];
}

export interface LibraryGamesData {
  games: LibraryGame[];
  count: number;
  loading: boolean;
  error: string | null;
}

export interface LibraryGamesState extends LibraryGamesData {
  refetch: () => void;
}

function normalizeGame(raw: Record<string, unknown>): LibraryGame {
  return {
    appid: Number(raw.appid),
    name: String(raw.name ?? ""),
    playtimeForever: typeof raw.playtimeForever === "number" ? raw.playtimeForever : null,
    userStatus: typeof raw.userStatus === "string" ? raw.userStatus : null,
    controllerSupport: (raw.controllerSupport as LibraryGame["controllerSupport"]) ?? null,
    minPlayers: typeof raw.minPlayers === "number" ? raw.minPlayers : null,
    maxPlayers: typeof raw.maxPlayers === "number" ? raw.maxPlayers : null,
    isLocalCoop: typeof raw.isLocalCoop === "boolean" ? raw.isLocalCoop : null,
    isSplitScreen: typeof raw.isSplitScreen === "boolean" ? raw.isSplitScreen : null,
    isMultiplayer: typeof raw.isMultiplayer === "boolean" ? raw.isMultiplayer : null,
    protonDbTier: (raw.protonDbTier as LibraryGame["protonDbTier"]) ?? null,
    reviewScore: typeof raw.reviewScore === "number" ? raw.reviewScore : null,
    hltbMainStory: typeof raw.hltbMainStory === "number" ? raw.hltbMainStory : null,
    hltbMainExtra: typeof raw.hltbMainExtra === "number" ? raw.hltbMainExtra : null,
    hltbCompletionist: typeof raw.hltbCompletionist === "number" ? raw.hltbCompletionist : null,
    headerImage: typeof raw.headerImage === "string" ? raw.headerImage : null,
    shortDescription: typeof raw.shortDescription === "string" ? raw.shortDescription : null,
    currentPrice: typeof raw.currentPrice === "string" ? raw.currentPrice : null,
    initialPrice: typeof raw.initialPrice === "string" ? raw.initialPrice : null,
    discountPercent: typeof raw.discountPercent === "number" ? raw.discountPercent : null,
    lowestPrice: typeof raw.lowestPrice === "string" ? raw.lowestPrice : null,
    lowestDiscountPercent: typeof raw.lowestDiscountPercent === "number" ? raw.lowestDiscountPercent : null,
    lowestPriceDate: typeof raw.lowestPriceDate === "string" ? raw.lowestPriceDate : null,
    categories: Array.isArray(raw.categories) ? raw.categories.filter((c): c is string => typeof c === "string") : [],
    friends: Array.isArray(raw.friends)
      ? raw.friends
          .filter((f): f is Record<string, unknown> => typeof f === "object" && f !== null)
          .map((f) => ({
            steamid: String(f.steamid ?? ""),
            personaname: typeof f.personaname === "string" ? f.personaname : null,
            avatarfull: typeof f.avatarfull === "string" ? f.avatarfull : null,
          }))
      : [],
  };
}

export function useLibraryGames(filters: LibraryFilters, debounceMs = 250): LibraryGamesState & {
  patchUserStatus: (appid: number, userStatus: LibraryUserStatus) => Promise<boolean>;
} {
  const [state, setState] = useState<LibraryGamesData>({ games: [], count: 0, loading: true, error: null });
  const [requestToken, setRequestToken] = useState(0);
  const requestIdRef = useRef(0);

  const paramsKey = useMemo(() => filtersToSearchParams(filters).toString(), [filters]);

  useEffect(() => {
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      const requestId = ++requestIdRef.current;
      setState((prev) => ({ ...prev, loading: true, error: null }));

      fetch(`/api/games?${paramsKey}`, { signal: controller.signal })
        .then(async (response) => {
          const body = (await response.json()) as {
            error?: string;
            games?: Record<string, unknown>[];
            count?: number;
          };
          if (!response.ok) {
            throw new Error(body.error ?? `Error ${response.status}`);
          }
          if (requestId !== requestIdRef.current) return;
          const games = (body.games ?? []).map(normalizeGame);
          setState({ games, count: typeof body.count === "number" ? body.count : games.length, loading: false, error: null });
        })
        .catch((error: unknown) => {
          if (controller.signal.aborted || requestId !== requestIdRef.current) return;
          const message = error instanceof Error ? error.message : "No se pudo cargar la biblioteca";
          setState((prev) => ({ ...prev, loading: false, error: message }));
        });
    }, debounceMs);

    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, [paramsKey, debounceMs, requestToken]);

  const refetch = useCallback(() => setRequestToken((token) => token + 1), []);

  const patchUserStatus = useCallback(
    async (appid: number, userStatus: LibraryUserStatus): Promise<boolean> => {
      let previous: LibraryGame | undefined;
      setState((prev) => {
        previous = prev.games.find((game) => game.appid === appid);
        return {
          ...prev,
          games: prev.games.map((game) => (game.appid === appid ? { ...game, userStatus } : game)),
          error: null,
        };
      });

      try {
        const response = await fetch(`/api/games/${appid}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userStatus }),
        });
        const body = (await response.json()) as { error?: string };
        if (!response.ok) {
          throw new Error(body.error ?? `Error ${response.status}`);
        }
        return true;
      } catch (caught) {
        const message = caught instanceof Error ? caught.message : "No se pudo actualizar el estado";
        setState((prev) => ({
          ...prev,
          games: prev.games.map((game) =>
            game.appid === appid && previous ? { ...game, userStatus: previous.userStatus } : game,
          ),
          error: message,
        }));
        return false;
      }
    },
    [],
  );

  return { ...state, refetch, patchUserStatus };
}

export function useLibraryMeta(): {
  friends: LibraryFriend[];
  genres: string[];
  loading: boolean;
  error: string | null;
  refetch: () => void;
} {
  const [friends, setFriends] = useState<LibraryFriend[]>([]);
  const [genres, setGenres] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [token, setToken] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);

    Promise.all([
      fetch("/api/friends", { signal: controller.signal }).then(async (response) => {
        const body = (await response.json()) as { friends?: LibraryFriend[]; error?: string };
        if (!response.ok) throw new Error(body.error ?? "No se pudieron cargar los amigos");
        return body.friends ?? [];
      }),
      fetch("/api/genres", { signal: controller.signal }).then(async (response) => {
        const body = (await response.json()) as { genres?: string[]; error?: string };
        if (!response.ok) throw new Error(body.error ?? "No se pudieron cargar los géneros");
        return body.genres ?? [];
      }),
    ])
      .then(([friendList, genreList]) => {
        if (controller.signal.aborted) return;
        setFriends(friendList);
        setGenres(genreList);
        setLoading(false);
      })
      .catch((caught: unknown) => {
        if (controller.signal.aborted) return;
        const message = caught instanceof Error ? caught.message : "Error cargando metadatos";
        setError(message);
        setLoading(false);
      });

    return () => controller.abort();
  }, [token]);

  const refetch = useCallback(() => setToken((value) => value + 1), []);

  return { friends, genres, loading, error, refetch };
}

export type SyncUiStatus = "idle" | "starting" | "running" | "completed" | "failed" | "cancelled";

export function useSyncController(options?: {
  onSettled?: () => void;
  pollIntervalMs?: number;
}): {
  status: SyncUiStatus;
  progress: SyncProgressShape | null;
  error: string | null;
  isBusy: boolean;
  start: () => Promise<void>;
  cancel: () => Promise<void>;
} {
  const [status, setStatus] = useState<SyncUiStatus>("idle");
  const [progress, setProgress] = useState<SyncProgressShape | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const onSettledRef = useRef(options?.onSettled);
  onSettledRef.current = options?.onSettled;
  const pollIntervalMs = options?.pollIntervalMs ?? 800;

  const stopPolling = useCallback(() => {
    if (pollTimerRef.current !== null) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }, []);

  useEffect(() => stopPolling, [stopPolling]);

  const applyProgress = useCallback(
    (next: SyncProgressShape) => {
      setProgress(next);
      if (next.status === "running") {
        setStatus("running");
        return;
      }
      stopPolling();
      setStatus(next.status === "completed" ? "completed" : next.status === "cancelled" ? "cancelled" : "failed");
      if (next.status === "failed") setError(next.error ?? "La sincronización falló");
      onSettledRef.current?.();
    },
    [stopPolling],
  );

  const poll = useCallback(async () => {
    try {
      const response = await fetch("/api/sync");
      const body = (await response.json()) as {
        running?: boolean;
        progress?: SyncProgressShape | null;
      };
      if (!response.ok) return;
      const next = body.progress ?? null;
      if (next) {
        if (body.running) {
          setProgress(next);
          setStatus("running");
        } else {
          applyProgress(next);
        }
      } else if (!body.running) {
        stopPolling();
        setStatus("idle");
      }
    } catch {
      // Las siguientes lecturas reintentarán; se ignora el fallo puntual del poll.
    }
  }, [applyProgress, stopPolling]);

  const startPolling = useCallback(() => {
    stopPolling();
    void poll();
    pollTimerRef.current = setInterval(() => void poll(), pollIntervalMs);
  }, [poll, pollIntervalMs, stopPolling]);

  const start = useCallback(async () => {
    setError(null);
    setStatus("starting");
    try {
      const response = await fetch("/api/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const body = (await response.json()) as {
        error?: string;
        jobId?: string;
        progress?: SyncProgressShape | null;
      };

      if (response.status === 202 || response.status === 200) {
        if (body.progress) setProgress(body.progress);
        setStatus("running");
        startPolling();
        return;
      }

      if (response.status === 409) {
        if (body.progress) setProgress(body.progress);
        setStatus("running");
        startPolling();
        return;
      }

      throw new Error(body.error ?? `Error ${response.status}`);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "No se pudo iniciar la sincronización";
      setStatus("failed");
      setError(message);
    }
  }, [startPolling]);

  const cancel = useCallback(async () => {
    try {
      const response = await fetch("/api/sync", { method: "DELETE" });
      const body = (await response.json()) as { cancelled?: boolean; progress?: SyncProgressShape | null };
      if (response.ok && body.cancelled) {
        if (body.progress) setProgress(body.progress);
        stopPolling();
        setStatus("cancelled");
        onSettledRef.current?.();
        return;
      }
      await poll();
    } catch {
      setError("No se pudo cancelar la sincronización");
    }
  }, [poll, stopPolling]);

  return {
    status,
    progress,
    error,
    isBusy: status === "starting" || status === "running",
    start,
    cancel,
  };
}
