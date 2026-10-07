import axios, { AxiosError, type AxiosInstance } from "axios";

import type { ProtonDbTier } from "@/lib/db/schema";

export interface ProtonDbSummary {
  appid: number;
  tier: ProtonDbTier;
  bestReportedTier: ProtonDbTier | null;
  trendingTier: ProtonDbTier | null;
  confidence: string | null;
  score: number | null;
  total: number | null;
}

export interface ProtonDbClient {
  getSummary(appid: number, signal?: AbortSignal): Promise<ProtonDbSummary | null>;
  getRequestCount(): number;
}

export interface ProtonDbClientOptions {
  baseUrl?: string;
  requestTimeoutMs?: number;
  maxRetries?: number;
  minIntervalMs?: number;
  http?: AxiosInstance;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  onRetry?: (info: { appid: number; waitMs: number; error: Error }) => void;
}

export const PROTON_DB_ENDPOINTS = {
  summaries: (appid: number) =>
    `https://www.protondb.com/api/v1/reports/summaries/${appid}.json`,
} as const;

export const DEFAULT_PROTON_DB_OPTIONS = {
  baseUrl: "https://www.protondb.com",
  requestTimeoutMs: 15000,
  maxRetries: 2,
  minIntervalMs: 500,
};

export function normalizeProtonTier(raw: unknown): ProtonDbTier {
  if (typeof raw !== "string") return "UNKNOWN";
  switch (raw.trim().toLowerCase()) {
    case "native":
      return "NATIVE";
    case "platinum":
      return "PLATINUM";
    case "gold":
      return "GOLD";
    case "silver":
      return "SILVER";
    case "bronze":
      return "BRONZE";
    case "borked":
      return "BORKED";
    default:
      return "UNKNOWN";
  }
}

export function normalizeProtonDbSummary(appid: number, raw: unknown): ProtonDbSummary | null {
  if (!raw || typeof raw !== "object") return null;
  const data = raw as Record<string, unknown>;

  const tier = normalizeProtonTier(data.tier);
  const bestReported = data.bestReportedTier === undefined ? null : normalizeProtonTier(data.bestReportedTier);
  const trending = data.trendingTier === undefined ? null : normalizeProtonTier(data.trendingTier);

  return {
    appid,
    tier,
    bestReportedTier: bestReported && bestReported !== "UNKNOWN" ? bestReported : null,
    trendingTier: trending && trending !== "UNKNOWN" ? trending : null,
    confidence: typeof data.confidence === "string" ? data.confidence : null,
    score: Number.isFinite(Number(data.score)) ? Number(data.score) : null,
    total: Number.isFinite(Number(data.total)) ? Number(data.total) : null,
  };
}

export function createProtonDbClient(options: ProtonDbClientOptions = {}): ProtonDbClient {
  const requestTimeoutMs = options.requestTimeoutMs ?? DEFAULT_PROTON_DB_OPTIONS.requestTimeoutMs;
  const maxRetries = options.maxRetries ?? DEFAULT_PROTON_DB_OPTIONS.maxRetries;
  const minIntervalMs = options.minIntervalMs ?? DEFAULT_PROTON_DB_OPTIONS.minIntervalMs;
  const http =
    options.http ??
    axios.create({
      timeout: requestTimeoutMs,
      headers: {
        Accept: "application/json",
        "User-Agent": "steam-library-hub/1.0 (local Steam library)",
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
            `ProtonDB request failed: ${axiosError.message ?? "error desconocido"} [status=${
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
    async getSummary(appid: number, signal?: AbortSignal): Promise<ProtonDbSummary | null> {
      const data = await request<Record<string, unknown> | null>(
        PROTON_DB_ENDPOINTS.summaries(appid),
        signal,
      );
      if (!data) return null;
      return normalizeProtonDbSummary(appid, data);
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
