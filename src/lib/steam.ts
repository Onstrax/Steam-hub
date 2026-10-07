import axios, { AxiosError, type AxiosInstance } from "axios";

import type { ControllerSupport, ProtonDbTier } from "@/lib/db/schema";

export interface SteamConfig {
  apiKey: string;
  steamId: string;
  locale: string;
  country: string;
  storeDelayMs: number;
  requestTimeoutMs: number;
  maxRetries: number;
}

export interface OwnedGame {
  appid: number;
  name: string;
  playtimeForever: number;
  imgIconUrl: string | null;
  hasCommunityVisibleStats: boolean;
}

export interface SteamFriend {
  steamid: string;
  personaname: string;
  profileurl: string;
  avatarfull: string;
  friendSince: number;
}

export interface StoreCategory {
  id: number;
  description: string;
}

export interface PriceOverview {
  currency: string | null;
  initialPrice: string | null;
  finalPrice: string | null;
  discountPercent: number;
  isFree: boolean;
}

export interface PlayerRange {
  minPlayers: number;
  maxPlayers: number;
}

export interface StoreMetadata {
  isFree: boolean;
  requiredAge: number;
  shortDescription: string | null;
  headerImage: string | null;
  controllerSupport: ControllerSupport;
  isMultiplayer: boolean;
  isLocalCoop: boolean;
  isSplitScreen: boolean;
  protonDbTier: ProtonDbTier;
  diskSpaceGb: number;
  priceOverview: PriceOverview;
  minPlayers: number;
  maxPlayers: number;
  categories: StoreCategory[];
  genres: string[];
}

export interface AppDetailsResult extends StoreMetadata {
  appid: number;
  success: boolean;
}

export interface SteamClient {
  getOwnedGames(steamId: string, signal?: AbortSignal): Promise<OwnedGame[]>;
  getFriendList(steamId: string, signal?: AbortSignal): Promise<SteamFriend[]>;
  getAppDetails(appid: number, signal?: AbortSignal): Promise<AppDetailsResult | null>;
  getReviewScore(appid: number, signal?: AbortSignal): Promise<number | null>;
  getStoreRequestCount(): number;
}

export const STEAM_ENDPOINTS = {
  ownedGames: "https://api.steampowered.com/IPlayerService/GetOwnedGames/v0001/",
  friendList: "https://api.steampowered.com/ISteamUser/GetFriendList/v0001/",
  appDetails: "https://store.steampowered.com/api/appdetails",
  appReviews: "https://store.steampowered.com/appreviews",
} as const;

export const DEFAULT_STEAM_CONFIG: Omit<SteamConfig, "apiKey" | "steamId"> = {
  locale: "english",
  country: "us",
  storeDelayMs: 1000,
  requestTimeoutMs: 20000,
  maxRetries: 3,
};

export class SteamConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SteamConfigError";
  }
}

export function getSteamConfig(env: Record<string, string | undefined> = process.env): SteamConfig {
  const apiKey = env.STEAM_API_KEY?.trim();
  const steamId = env.STEAM_ID?.trim();

  const missing: string[] = [];
  if (!apiKey) missing.push("STEAM_API_KEY");
  if (!steamId) missing.push("STEAM_ID");

  if (missing.length > 0) {
    throw new SteamConfigError(
      `Faltan variables de entorno en .env.local: ${missing.join(", ")}`,
    );
  }

  return {
    apiKey: apiKey as string,
    steamId: steamId as string,
    locale: env.STEAM_LOCALE?.trim() || DEFAULT_STEAM_CONFIG.locale,
    country: env.STEAM_COUNTRY?.trim() || DEFAULT_STEAM_CONFIG.country,
    storeDelayMs: toPositiveInt(env.STEAM_STORE_DELAY_MS, DEFAULT_STEAM_CONFIG.storeDelayMs),
    requestTimeoutMs: toPositiveInt(
      env.STEAM_REQUEST_TIMEOUT_MS,
      DEFAULT_STEAM_CONFIG.requestTimeoutMs,
    ),
    maxRetries: toPositiveInt(env.STEAM_MAX_RETRIES, DEFAULT_STEAM_CONFIG.maxRetries),
  };
}

function toPositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

export function buildHeaderImageUrl(appid: number, imgIconUrl: string | null): string | null {
  if (!imgIconUrl) return null;
  return `https://cdn.cloudflare.steamstatic.com/steamcommunity/public/images/apps/${appid}/${imgIconUrl}.jpg`;
}

export function redactSecrets(text: string, secrets: Array<string | undefined>): string {
  return secrets.reduce<string>(
    (acc, secret) => (secret ? acc.split(secret).join("***") : acc),
    text,
  );
}

export function isRetryableStatus(status: number | undefined): boolean {
  if (status === undefined) return false;
  if (status === 429) return true;
  return status >= 500 && status <= 599;
}

class SerialRateLimiter {
  private tail: Promise<unknown> = Promise.resolve();
  private lastStartedAt = 0;

  constructor(
    private readonly minIntervalMs: number,
    private readonly now: () => number = Date.now,
    private readonly sleep: (ms: number) => Promise<void> = defaultSleep,
  ) {}

  run<T>(task: () => Promise<T>): Promise<T> {
    const result = this.tail.then(async () => {
      const waitFor = this.lastStartedAt + this.minIntervalMs - this.now();
      if (waitFor > 0) await this.sleep(waitFor);
      this.lastStartedAt = this.now();
      return task();
    });
    this.tail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface SteamClientOptions {
  config?: SteamConfig;
  http?: AxiosInstance;
  minIntervalMs?: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  onRetry?: (info: { attempt: number; waitMs: number; error: Error }) => void;
}

export function createSteamClient(options: SteamClientOptions = {}): SteamClient {
  const config = options.config ?? getSteamConfig();
  const http =
    options.http ??
    axios.create({
      timeout: config.requestTimeoutMs,
      headers: { Accept: "application/json" },
    });

  const storeLimiter = new SerialRateLimiter(
    options.minIntervalMs ?? config.storeDelayMs,
    options.now,
    options.sleep,
  );
  let storeRequestCount = 0;

  const request = async <T>(
    fn: () => Promise<{ data: T }>,
    signal?: AbortSignal,
  ): Promise<T> => {
    let attempt = 0;

    for (;;) {
      if (signal?.aborted) throw new Error("Solicitud cancelada");
      try {
        return (await fn()).data;
      } catch (error) {
        const axiosError = error as AxiosError;
        const status = axiosError.response?.status;
        const hasResponse = axiosError.response !== undefined;
        const canRetry =
          attempt < config.maxRetries && (!hasResponse || isRetryableStatus(status));
        const waitMs = resolveRetryDelay(axiosError, attempt);

        if (!canRetry) {
          throw new Error(
            redactSecrets(
              `Steam request failed (${attempt + 1} intento(s)): ${axiosError.message ?? "error desconocido"} [status=${
                status ?? "sin respuesta"
              }]`,
              [config.apiKey],
            ),
            { cause: error },
          );
        }

        options.onRetry?.({ attempt: attempt + 1, waitMs, error: axiosError });
        await (options.sleep ?? defaultSleep)(waitMs);
        attempt += 1;
      }
    }
  };

  const storeRequest = async <T>(
    fn: () => Promise<{ data: T }>,
    signal?: AbortSignal,
  ): Promise<T> =>
    storeLimiter.run(async () => {
      storeRequestCount += 1;
      return request(fn, signal);
    });

  return {
    async getOwnedGames(steamId: string, signal?: AbortSignal): Promise<OwnedGame[]> {
      const data = await request<OwnedGamesResponse>(
        () =>
          http.get(STEAM_ENDPOINTS.ownedGames, {
            params: {
              key: config.apiKey,
              steamid: steamId,
              include_appinfo: 1,
              include_played_free_games: 1,
            },
            signal,
          }),
        signal,
      );

      const games = data?.response?.games;
      if (!Array.isArray(games)) return [];
      return games.map(normalizeOwnedGame).filter((game): game is OwnedGame => game !== null);
    },

    async getFriendList(steamId: string, signal?: AbortSignal): Promise<SteamFriend[]> {
      const data = await request<FriendListResponse>(
        () =>
          http.get(STEAM_ENDPOINTS.friendList, {
            params: { key: config.apiKey, steamid: steamId, format: "json" },
            signal,
          }),
        signal,
      );

      const friends = data?.friends;
      if (!Array.isArray(friends)) return [];
      return friends
        .map(normalizeFriend)
        .filter((friend): friend is SteamFriend => friend !== null);
    },

    async getAppDetails(appid: number, signal?: AbortSignal): Promise<AppDetailsResult | null> {
      const data = await storeRequest<AppDetailsResponse>(
        () =>
          http.get(STEAM_ENDPOINTS.appDetails, {
            params: { appids: appid, l: config.locale, cc: config.country },
            signal,
          }),
        signal,
      );

      const entry = data?.[String(appid)];
      if (!entry || entry.success !== true || !entry.data) return null;
      return normalizeAppDetails(appid, entry.data);
    },

    async getReviewScore(appid: number, signal?: AbortSignal): Promise<number | null> {
      const data = await storeRequest<AppReviewsResponse>(
        () =>
          http.get(`${STEAM_ENDPOINTS.appReviews}/${appid}`, {
            params: { json: 1, language: "all", purchase_type: "all", num_per_page: 0 },
            signal,
          }),
        signal,
      );

      return computeReviewScore(data?.query_summary);
    },

    getStoreRequestCount(): number {
      return storeRequestCount;
    },
  };
}

function resolveRetryDelay(error: AxiosError, attempt: number): number {
  const retryAfter = error.response?.headers?.["retry-after"];
  if (typeof retryAfter === "string") {
    const seconds = Number.parseInt(retryAfter, 10);
    if (Number.isFinite(seconds)) return Math.max(1000, seconds * 1000);
  }
  return Math.min(30000, 2 ** attempt * 1000);
}

export function normalizeOwnedGame(raw: unknown): OwnedGame | null {
  if (!raw || typeof raw !== "object") return null;
  const game = raw as Record<string, unknown>;
  const appid = Number(game.appid);
  const name = typeof game.name === "string" ? game.name : "";

  if (!Number.isInteger(appid) || appid <= 0 || name.length === 0) return null;

  return {
    appid,
    name,
    playtimeForever: Number.isFinite(Number(game.playtime_forever))
      ? Number(game.playtime_forever)
      : 0,
    imgIconUrl: typeof game.img_icon_url === "string" ? game.img_icon_url : null,
    hasCommunityVisibleStats: game.has_community_visible_stats === true,
  };
}

export function normalizeFriend(raw: unknown): SteamFriend | null {
  if (!raw || typeof raw !== "object") return null;
  const friend = raw as Record<string, unknown>;
  const steamid = typeof friend.steamid === "string" ? friend.steamid : "";

  if (steamid.length === 0) return null;

  return {
    steamid,
    personaname: typeof friend.personaname === "string" ? friend.personaname : steamid,
    profileurl: typeof friend.profileurl === "string" ? friend.profileurl : "",
    avatarfull: typeof friend.avatarfull === "string" ? friend.avatarfull : "",
    friendSince: Number.isFinite(Number(friend.friend_since)) ? Number(friend.friend_since) : 0,
  };
}

export function normalizeAppDetails(appid: number, data: Record<string, unknown>): AppDetailsResult {
  const rawCategories = Array.isArray(data.categories) ? data.categories : [];
  const rawGenres = Array.isArray(data.genres) ? data.genres : [];

  const categories = rawCategories
    .map((category) => {
      if (!category || typeof category !== "object") return null;
      const value = category as Record<string, unknown>;
      const description = typeof value.description === "string" ? value.description : "";
      if (description.length === 0) return null;
      return { id: Number(value.id) || 0, description };
    })
    .filter((category): category is StoreCategory => category !== null);

  const genres = rawGenres
    .map((genre) => {
      if (!genre || typeof genre !== "object") return null;
      const description = (genre as Record<string, unknown>).description;
      return typeof description === "string" ? description : null;
    })
    .filter((genre): genre is string => genre !== null);

  return {
    appid,
    success: true,
    ...mapStoreMetadata({
      categories,
      genres,
      controllerSupport: data.controller_support,
      isFree: data.is_free,
      requiredAge: data.required_age,
      shortDescription: data.short_description,
      headerImage: data.header_image,
      pcRequirements: data.pc_requirements,
      priceOverview: data.price_overview,
    }),
  };
}

export function mapStoreMetadata(input: {
  categories: StoreCategory[];
  genres: string[];
  controllerSupport: unknown;
  isFree: unknown;
  requiredAge: unknown;
  shortDescription: unknown;
  headerImage: unknown;
  pcRequirements: unknown;
  priceOverview: unknown;
}): StoreMetadata {
  const flags = classifyCategories(input.categories);
  const controllerSupport = normalizeControllerSupport(input.controllerSupport);
  const shortDescription =
    typeof input.shortDescription === "string" && input.shortDescription.length > 0
      ? input.shortDescription
      : null;
  const playerRange = extractPlayerRange(input.categories, shortDescription);

  return {
    isFree: input.isFree === true,
    requiredAge: toInt(input.requiredAge, 0),
    shortDescription,
    headerImage:
      typeof input.headerImage === "string" && input.headerImage.length > 0
        ? input.headerImage
        : null,
    controllerSupport,
    isMultiplayer: flags.isMultiplayer,
    isLocalCoop: flags.isLocalCoop,
    isSplitScreen: flags.isSplitScreen,
    protonDbTier: "UNKNOWN",
    diskSpaceGb: parseDiskSpaceGb(input.pcRequirements),
    priceOverview: parsePriceOverview(input.priceOverview),
    minPlayers: playerRange.minPlayers,
    maxPlayers: playerRange.maxPlayers,
    categories: input.categories,
    genres: input.genres,
  };
}

export function classifyCategories(categories: StoreCategory[]): {
  isMultiplayer: boolean;
  isLocalCoop: boolean;
  isSplitScreen: boolean;
} {
  const descriptions = categories.map((category) => category.description.toLowerCase());

  const isMultiplayer = descriptions.some((description) =>
    ["multi-player", "co-op", "shared/split screen co-op", "shared/split screen"].includes(
      description,
    ),
  );

  const isSplitScreen = descriptions.some((description) =>
    ["shared/split screen", "shared/split screen co-op"].includes(description),
  );

  const isLocalCoop = isSplitScreen || descriptions.includes("co-op");

  return { isMultiplayer, isLocalCoop, isSplitScreen };
}

export function extractPlayerRange(
  categories: StoreCategory[],
  extraText?: string | null,
): PlayerRange {
  const sources = [
    ...categories.map((category) => category.description.toLowerCase()),
    ...(extraText ? [extraText.toLowerCase()] : []),
  ];

  let minPlayers = 1;
  let maxPlayers = 1;
  let sawExplicitCount = false;

  for (const source of sources) {
    const range = source.match(/(\d+)\s*[-–]\s*(\d+)\s*players?/);
    if (range) {
      const min = Number.parseInt(range[1], 10);
      const max = Number.parseInt(range[2], 10);
      if (Number.isFinite(min) && Number.isFinite(max) && max >= min) {
        minPlayers = Math.max(minPlayers, min);
        maxPlayers = Math.max(maxPlayers, max);
        sawExplicitCount = true;
      }
      continue;
    }

    const plus = source.match(/(\d+)\+\s*players?/);
    if (plus) {
      const value = Number.parseInt(plus[1], 10);
      if (Number.isFinite(value) && value > 0) {
        maxPlayers = Math.max(maxPlayers, value);
        minPlayers = Math.max(minPlayers, value > 1 ? 2 : 1);
        sawExplicitCount = true;
      }
      continue;
    }

    const upTo = source.match(/up to\s+(\d+)\s*players?/);
    if (upTo) {
      const value = Number.parseInt(upTo[1], 10);
      if (Number.isFinite(value) && value > 0) {
        maxPlayers = Math.max(maxPlayers, value);
        minPlayers = Math.max(minPlayers, value > 1 ? 2 : 1);
        sawExplicitCount = true;
      }
      continue;
    }

    const rangeWords = source.match(/(\d+)\s*to\s*(\d+)\s*players?/);
    if (rangeWords) {
      const min = Number.parseInt(rangeWords[1], 10);
      const max = Number.parseInt(rangeWords[2], 10);
      if (Number.isFinite(min) && Number.isFinite(max) && max >= min) {
        minPlayers = Math.max(minPlayers, min);
        maxPlayers = Math.max(maxPlayers, max);
        sawExplicitCount = true;
      }
      continue;
    }

    const forCount = source.match(/for\s+(\d+)\s*players?/);
    if (forCount) {
      const value = Number.parseInt(forCount[1], 10);
      if (Number.isFinite(value) && value > 0) {
        maxPlayers = Math.max(maxPlayers, value);
        minPlayers = Math.max(minPlayers, value > 1 ? 2 : 1);
        sawExplicitCount = true;
      }
      continue;
    }

    const bareCount = source.match(/(?<![\w-])(\d+)\s*players?/);
    if (bareCount) {
      const value = Number.parseInt(bareCount[1], 10);
      if (Number.isFinite(value) && value > 1) {
        maxPlayers = Math.max(maxPlayers, value);
        minPlayers = Math.max(minPlayers, 2);
        sawExplicitCount = true;
      }
    }
  }

  const categoryDescriptions = categories.map((category) => category.description.toLowerCase());
  const hasSinglePlayer = categoryDescriptions.some(
    (description) => description.includes("single-player") || description === "single player",
  );
  const hasMultiplayer =
    sawExplicitCount ||
    categoryDescriptions.some(
      (description) =>
        description.includes("multi-player") ||
        description.includes("multiplayer") ||
        description.includes("co-op") ||
        description.includes("coop") ||
        description.includes("shared/split screen") ||
        description.includes("players"),
    ) ||
    (extraText !== null &&
      extraText !== undefined &&
      /\b(multiplayer|multi-player|co-op|coop|players)\b/i.test(extraText));

  if (!hasMultiplayer) {
    return { minPlayers: 1, maxPlayers: 1 };
  }

  if (!sawExplicitCount) {
    maxPlayers = 4;
    minPlayers = hasSinglePlayer ? 1 : 2;
  } else if (hasSinglePlayer) {
    minPlayers = 1;
  }

  return {
    minPlayers: Math.max(1, Math.min(8, minPlayers)),
    maxPlayers: Math.max(minPlayers, Math.min(8, maxPlayers)),
  };
}

export function parsePriceOverview(raw: unknown): PriceOverview {
  if (!raw || typeof raw !== "object") {
    return { currency: null, initialPrice: null, finalPrice: null, discountPercent: 0, isFree: false };
  }
  const overview = raw as Record<string, unknown>;
  const currency = typeof overview.currency === "string" ? overview.currency : null;
  const initialPrice = toFormattedPrice(overview.initial, overview.initial_formatted);
  const finalPrice = toFormattedPrice(overview.final, overview.final_formatted);
  const discountPercent = toInt(overview.discount_percent, 0);

  return {
    currency,
    initialPrice,
    finalPrice,
    discountPercent: Math.max(0, discountPercent),
    isFree: overview.is_free === true,
  };
}

function toFormattedPrice(raw: unknown, formatted: unknown): string | null {
  if (typeof formatted === "string" && formatted.trim().length > 0) return formatted.trim();
  if (typeof raw === "string" && raw.trim().length > 0) return raw.trim();
  if (typeof raw === "number" && Number.isFinite(raw)) return String(raw);
  return null;
}

export function normalizeControllerSupport(value: unknown): ControllerSupport {
  if (value === "full") return "full";
  if (value === "partial") return "partial";
  return "none";
}

export function parseDiskSpaceGb(pcRequirements: unknown): number {
  if (!pcRequirements || typeof pcRequirements !== "object") return 0;
  const requirements = pcRequirements as Record<string, unknown>;
  const candidates = [requirements.recommended, requirements.minimum];
  const sizes: number[] = [];
  const patterns = [
    /storage:[\s\S]{0,40}?([\d.,]+)\s*(mb|gb|tb)/gi,
    /([\d.,]+)(?:&nbsp;|\s)*(mb|gb|tb)(?:&nbsp;|\s)+available\s*(?:&nbsp;|\s)*space/gi,
  ];

  for (const candidate of candidates) {
    if (typeof candidate !== "string") continue;
    for (const pattern of patterns) {
      for (const match of candidate.matchAll(pattern)) {
        const value = Number.parseFloat(match[1].replace(",", "."));
        if (!Number.isFinite(value)) continue;
        const unit = match[2].toLowerCase();
        const gb = unit === "mb" ? value / 1024 : unit === "tb" ? value * 1024 : value;
        sizes.push(Math.round(gb * 10) / 10);
      }
    }
  }

  return sizes.length > 0 ? Math.max(...sizes) : 0;
}

export function computeReviewScore(summary: unknown): number | null {
  if (!summary || typeof summary !== "object") return null;
  const querySummary = summary as Record<string, unknown>;
  const positive = Number(querySummary.total_positive);
  const total = Number(querySummary.total_reviews);

  if (!Number.isFinite(positive) || !Number.isFinite(total) || total <= 0) return null;

  return Math.round((positive / total) * 100);
}

function toInt(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : fallback;
}

interface OwnedGamesResponse {
  response?: {
    game_count?: number;
    games?: unknown[];
  };
}

interface FriendListResponse {
  friends?: unknown[];
}

interface AppDetailsResponse {
  [appid: string]: { success: boolean; data?: Record<string, unknown> };
}

interface AppReviewsResponse {
  query_summary?: {
    total_positive?: number;
    total_negative?: number;
    total_reviews?: number;
  };
}