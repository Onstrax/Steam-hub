import axios, { AxiosError, type AxiosInstance } from "axios";

export interface CheapSharkPriceHistory {
  appid: number;
  cheapestEverPrice: string | null;
  cheapestEverDate: string | null;
  currentCheapest: string | null;
  lowestPrice: string | null;
  lowestDiscountPercent: number | null;
  lowestPriceDate: string | null;
}

export interface CheapSharkClient {
  getPriceHistory(appid: number, signal?: AbortSignal): Promise<CheapSharkPriceHistory | null>;
  getRequestCount(): number;
}

export interface CheapSharkClientOptions {
  baseUrl?: string;
  requestTimeoutMs?: number;
  maxRetries?: number;
  minIntervalMs?: number;
  http?: AxiosInstance;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  onRetry?: (info: { appid: number; waitMs: number; error: Error }) => void;
}

export const CHEAPSHARK_ENDPOINTS = {
  bySteamAppId: (appid: number) =>
    `https://www.cheapshark.com/api/1.0/games?steamAppID=${appid}`,
  byGameId: (gameId: string) => `https://www.cheapshark.com/api/1.0/games?id=${gameId}`,
} as const;

export const DEFAULT_CHEAPSHARK_OPTIONS = {
  baseUrl: "https://www.cheapshark.com",
  requestTimeoutMs: 15000,
  maxRetries: 2,
  minIntervalMs: 400,
};

export const CHEAPSHARK_USER_AGENT =
  "steam-library-hub/1.0 (local Steam library; contact: local-dev)";

export function normalizeUnixDate(value: unknown): string | null {
  const timestamp = Number(value);
  if (!Number.isFinite(timestamp) || timestamp <= 0) return null;
  return new Date(timestamp * 1000).toISOString().slice(0, 10);
}

export function normalizePriceString(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value.toFixed(2);
  }
  if (typeof value === "string" && value.trim().length > 0) {
    return value.trim();
  }
  return null;
}

export function normalizeSavingsPercent(value: unknown): number | null {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return Math.round(parsed);
}

export function parseCheapSharkSearchResult(appid: number, raw: unknown): { gameId: string; currentCheapest: string | null } | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const entry = raw[0] as Record<string, unknown>;
  if (!entry || typeof entry !== "object") return null;

  const gameId = typeof entry.gameID === "string" ? entry.gameID.trim() : "";
  if (gameId.length === 0) return null;

  return {
    gameId,
    currentCheapest: normalizePriceString(entry.cheapest),
  };
}

export function parseCheapSharkGameDetails(
  appid: number,
  search: { gameId: string; currentCheapest: string | null },
  raw: unknown,
): CheapSharkPriceHistory {
  const details = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const cheapestEver = details.cheapestPriceEver as Record<string, unknown> | undefined;
  const deals = Array.isArray(details.deals) ? (details.deals as Array<Record<string, unknown>>) : [];

  const savings = deals
    .map((deal) => normalizeSavingsPercent(deal?.savings))
    .filter((value): value is number => value !== null);
  const maxSavings = savings.length > 0 ? Math.max(...savings) : null;

  const cheapestEverPrice = normalizePriceString(cheapestEver?.price);
  const lowestPrice = cheapestEverPrice ?? search.currentCheapest;
  const lowestPriceDate = normalizeUnixDate(cheapestEver?.date);

  return {
    appid,
    cheapestEverPrice,
    cheapestEverDate: lowestPriceDate,
    currentCheapest: search.currentCheapest,
    lowestPrice,
    lowestDiscountPercent: maxSavings,
    lowestPriceDate,
  };
}

export function createCheapSharkClient(options: CheapSharkClientOptions = {}): CheapSharkClient {
  const requestTimeoutMs = options.requestTimeoutMs ?? DEFAULT_CHEAPSHARK_OPTIONS.requestTimeoutMs;
  const maxRetries = options.maxRetries ?? DEFAULT_CHEAPSHARK_OPTIONS.maxRetries;
  const minIntervalMs = options.minIntervalMs ?? DEFAULT_CHEAPSHARK_OPTIONS.minIntervalMs;
  const http =
    options.http ??
    axios.create({
      timeout: requestTimeoutMs,
      headers: {
        Accept: "application/json",
        "User-Agent": CHEAPSHARK_USER_AGENT,
      },
    });
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const now = options.now ?? Date.now;

  let lastStartedAt = 0;
  let requestCount = 0;

  const request = async <T>(path: string, signal?: AbortSignal): Promise<T> => {
    const waitFor = lastStartedAt + minIntervalMs - now();
    if (waitFor > 0) await sleep(waitFor);
    lastStartedAt = now();

    let attempt = 0;
    for (;;) {
      if (signal?.aborted) throw new Error("Solicitud cancelada");
      try {
        requestCount += 1;
        const response = await http.get<T>(path, { signal });
        return response.data;
      } catch (error) {
        const axiosError = error as AxiosError;
        const status = axiosError.response?.status;

        if (status === 404) return null as T;

        const canRetry = attempt < maxRetries && isRetryableStatus(status);
        if (!canRetry) {
          throw new Error(
            `CheapShark request failed: ${axiosError.message ?? "error desconocido"} [status=${
              status ?? "sin respuesta"
            }]`,
            { cause: error },
          );
        }

        const waitMs = Math.min(30000, 2 ** attempt * 1000);
        options.onRetry?.({ appid: 0, waitMs, error: axiosError });
        await sleep(waitMs);
        attempt += 1;
      }
    }
  };

  return {
    async getPriceHistory(appid: number, signal?: AbortSignal): Promise<CheapSharkPriceHistory | null> {
      const searchRaw = await request<unknown>(CHEAPSHARK_ENDPOINTS.bySteamAppId(appid), signal);
      const search = parseCheapSharkSearchResult(appid, searchRaw);
      if (!search) return null;

      const detailsRaw = await request<unknown>(CHEAPSHARK_ENDPOINTS.byGameId(search.gameId), signal);
      return parseCheapSharkGameDetails(appid, search, detailsRaw);
    },
    getRequestCount(): number {
      return requestCount;
    },
  };
}

function isRetryableStatus(status: number | undefined): boolean {
  if (status === undefined) return true;
  return status === 429 || (status >= 500 && status <= 599);
}
