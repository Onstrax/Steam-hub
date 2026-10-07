import { redactSecrets } from "@/lib/steam";

export interface HltbDurations {
  hltbId: string;
  matchedName: string;
  similarity: number;
  mainStory: number;
  mainExtra: number;
  completionist: number;
}

export interface HltbClient {
  getDurations(gameName: string, signal?: AbortSignal): Promise<HltbDurations | null>;
  getRequestCount(): number;
}

export interface HltbClientOptions {
  minIntervalMs?: number;
  minSimilarity?: number;
  maxRetries?: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  onRetry?: (info: { gameName: string; waitMs: number; error: Error }) => void;
  baseUrl?: string;
  requestTimeoutMs?: number;
  fetchImpl?: typeof fetch;
}

export const DEFAULT_HLTB_OPTIONS = {
  minIntervalMs: 1500,
  minSimilarity: 0.75,
  maxRetries: 2,
  requestTimeoutMs: 15000,
  baseUrl: "https://howlongtobeat.com",
};

const HLTB_USER_AGENT =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

interface HltbSearchPayload {
  count?: number;
  data?: HltbRawEntry[];
}

interface HltbRawEntry {
  game_id: number;
  game_name: string;
  game_type?: string;
  comp_main: number;
  comp_plus: number;
  comp_100: number;
}

export interface HltbSearchEntry {
  id: string;
  name: string;
  gameplayMain: number;
  gameplayMainExtra: number;
  gameplayCompletionist: number;
  similarity: number;
}

export function createHltbClient(options: HltbClientOptions = {}): HltbClient {
  const baseUrl = (options.baseUrl ?? DEFAULT_HLTB_OPTIONS.baseUrl).replace(/\/+$/, "");
  const minIntervalMs = options.minIntervalMs ?? DEFAULT_HLTB_OPTIONS.minIntervalMs;
  const minSimilarity = options.minSimilarity ?? DEFAULT_HLTB_OPTIONS.minSimilarity;
  const maxRetries = options.maxRetries ?? DEFAULT_HLTB_OPTIONS.maxRetries;
  const requestTimeoutMs = options.requestTimeoutMs ?? DEFAULT_HLTB_OPTIONS.requestTimeoutMs;
  const fetchImpl = options.fetchImpl ?? fetch;
  const sleep = options.sleep ?? defaultSleep;
  const now = options.now ?? Date.now;

  let token: string | null = null;
  let lastRequestAt = 0;
  let requestCount = 0;

  const request = async (
    path: string,
    init: RequestInit,
    signal?: AbortSignal,
  ): Promise<Response> => {
    const waitFor = lastRequestAt + minIntervalMs - now();
    if (waitFor > 0) await sleep(waitFor);
    lastRequestAt = now();

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(new Error("timeout HLTB")), requestTimeoutMs);
    const onAbort = () => controller.abort(signal?.reason);
    signal?.addEventListener("abort", onAbort, { once: true });

    try {
      return await fetchImpl(`${baseUrl}${path}`, {
        ...init,
        headers: {
          Accept: "application/json",
          "User-Agent": HLTB_USER_AGENT,
          Referer: `${baseUrl}/`,
          Origin: baseUrl,
          ...init.headers,
        },
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
    }
  };

  const initToken = async (signal?: AbortSignal, force = false): Promise<string> => {
    if (!force && token) return token;

    const response = await request(
      `/api/search/site/init?t=${Date.now()}`,
      { method: "GET" },
      signal,
    );

    if (!response.ok) {
      throw new Error(`HLTB init falló (HTTP ${response.status})`);
    }

    const body = (await response.json().catch(() => null)) as { token?: string } | null;
    if (!body?.token) {
      throw new Error("HLTB init no devolvió token de acceso");
    }

    token = body.token;
    return token;
  };

  const search = async (query: string, signal?: AbortSignal): Promise<HltbSearchPayload> => {
    let accessToken = await initToken(signal);
    let response = await postSearch(query, accessToken, signal);

    if (response.status === 403 || response.status === 401) {
      accessToken = await initToken(signal, true);
      response = await postSearch(query, accessToken, signal);
    }

    if (response.status === 429) {
      throw new Error("HLTB limitó las peticiones (HTTP 429)");
    }

    if (!response.ok) {
      throw new Error(`HLTB search falló (HTTP ${response.status})`);
    }

    return (await response.json()) as HltbSearchPayload;
  };

  const postSearch = (query: string, accessToken: string, signal?: AbortSignal) => {
    requestCount += 1;
    return request(
      "/api/search/site",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-auth-token": accessToken },
        body: JSON.stringify(buildSearchBody(query)),
      },
      signal,
    );
  };

  return {
    async getDurations(gameName: string, signal?: AbortSignal): Promise<HltbDurations | null> {
      const query = gameName.trim();
      if (query.length === 0) return null;

      for (let attempt = 0; ; attempt += 1) {
        if (signal?.aborted) return null;

        try {
          const payload = await search(query, signal);
          return pickBestEntry(mapSearchEntries(payload, query), query, minSimilarity);
        } catch (error) {
          if (signal?.aborted) return null;
          const message = error instanceof Error ? error.message : "error desconocido";

          if (attempt >= maxRetries) {
            return null;
          }

          const waitMs = Math.min(30000, 2 ** attempt * 2000);
          options.onRetry?.({ gameName: query, waitMs, error: new Error(message) });
          await sleep(waitMs);
        }
      }
    },

    getRequestCount(): number {
      return requestCount;
    },
  };
}

export function buildSearchBody(query: string): Record<string, unknown> {
  return {
    searchType: "games",
    searchTerms: query.split(/\s+/).filter(Boolean),
    searchPage: 1,
    size: 20,
    searchOptions: {
      games: {
        userId: 0,
        platform: "",
        sortCategory: "postcount",
        rangeCategory: "main",
        rangeTime: { min: 0, max: 0 },
        gameplay: { perspective: "", flow: "", genre: "" },
        year: "",
        modifier: "",
      },
      users: { sortCategory: "postcount" },
      lists: { sortCategory: "follows" },
      filter: "",
      sort: 0,
      randomizer: 0,
    },
    useCache: true,
  };
}

export function mapSearchEntries(payload: HltbSearchPayload, query: string): HltbSearchEntry[] {
  const data = Array.isArray(payload?.data) ? payload.data : [];

  return data
    .filter((entry) => entry && typeof entry.game_name === "string")
    .map((entry) => ({
      id: String(entry.game_id),
      name: entry.game_name,
      gameplayMain: secondsToHours(entry.comp_main),
      gameplayMainExtra: secondsToHours(entry.comp_plus),
      gameplayCompletionist: secondsToHours(entry.comp_100),
      similarity: titleSimilarity(entry.game_name, query),
    }));
}

export function pickBestEntry(
  entries: HltbSearchEntry[],
  query: string,
  minSimilarity: number,
): HltbDurations | null {
  if (!Array.isArray(entries) || entries.length === 0) return null;

  const candidates = entries
    .filter((entry) => entry.gameplayMain > 0)
    .map((entry) => ({
      ...entry,
      score: Math.max(entry.similarity ?? 0, titleSimilarity(entry.name, query)),
    }))
    .filter((entry) => entry.score >= minSimilarity)
    .sort((a, b) => b.score - a.score || b.gameplayMain - a.gameplayMain);

  const best = candidates[0];
  if (!best) return null;

  return {
    hltbId: String(best.id),
    matchedName: best.name,
    similarity: Math.round(best.score * 100) / 100,
    mainStory: round1(best.gameplayMain),
    mainExtra: round1(best.gameplayMainExtra),
    completionist: round1(best.gameplayCompletionist),
  };
}

export function titleSimilarity(left: string, right: string): number {
  const normalize = (value: string) =>
    value
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, " ")
      .trim();

  const a = normalize(left);
  const b = normalize(right);

  if (a.length === 0 || b.length === 0) return 0;
  if (a === b) return 1;
  if (a.startsWith(b) || b.startsWith(a)) return 0.95;
  if (a.includes(b) || b.includes(a)) return 0.9;

  const tokensA = new Set(a.split(" "));
  const tokensB = new Set(b.split(" "));
  const intersection = [...tokensA].filter((token) => tokensB.has(token)).length;
  const union = new Set([...tokensA, ...tokensB]).size;

  return union === 0 ? 0 : intersection / union;
}

export function safeGameNameForHltb(name: string): string {
  return name
    .replace(/\s*[-–]\s*(steam deck|dx11|gdpr|enhanced edition).*$/i, "")
    .replace(/\s*\([^)]*\)\s*$/, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function describeHltbError(error: unknown, apiKey?: string): string {
  const message = error instanceof Error ? error.message : String(error);
  return redactSecrets(`HLTB: ${message}`, [apiKey]);
}

function secondsToHours(seconds: unknown): number {
  const value = typeof seconds === "number" && Number.isFinite(seconds) ? seconds : 0;
  return value > 0 ? value / 3600 : 0;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
