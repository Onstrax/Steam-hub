export const LIBRARY_SORT_FIELDS = [
  "name",
  "playtime",
  "hltb",
  "review",
  "maxPlayers",
  "updated",
] as const;
export type LibrarySortField = (typeof LIBRARY_SORT_FIELDS)[number];

export const LIBRARY_SORT_LABELS: Record<LibrarySortField, string> = {
  name: "Nombre",
  playtime: "Tiempo jugado",
  hltb: "Duración HLTB",
  review: "Reseñas",
  maxPlayers: "Jugadores máx.",
  updated: "Actualización",
};

export const CONTROLLER_SUPPORT_OPTIONS = [
  { value: "full", label: "Total" },
  { value: "partial", label: "Parcial" },
  { value: "none", label: "Sin soporte" },
] as const;

export type LibraryControllerSupport = (typeof CONTROLLER_SUPPORT_OPTIONS)[number]["value"];

export const PROTON_DB_TIER_OPTIONS = [
  { value: "NATIVE", label: "Nativo" },
  { value: "PLATINUM", label: "Platino" },
  { value: "GOLD", label: "Oro" },
  { value: "SILVER", label: "Plata" },
  { value: "BRONZE", label: "Bronce" },
  { value: "BORKED", label: "Roto" },
  { value: "UNKNOWN", label: "Sin datos" },
] as const;

export type LibraryProtonDbTier = (typeof PROTON_DB_TIER_OPTIONS)[number]["value"];

export const USER_STATUS_OPTIONS = [
  { value: "Backlog", label: "Backlog" },
  { value: "Playing", label: "En progreso" },
  { value: "Completed", label: "Completado" },
  { value: "Abandoned", label: "Abandonado" },
] as const;

export type LibraryUserStatus = (typeof USER_STATUS_OPTIONS)[number]["value"];

export const LIBRARY_STATE_OPTIONS = [
  { value: "notPlayed", label: "No jugado (0 h)" },
  { value: "tested", label: "Probado (<2 h)" },
  { value: "Playing", label: "En progreso" },
  { value: "Completed", label: "Completado" },
  { value: "Abandoned", label: "Abandonado" },
] as const;

export type LibraryStateFilter = (typeof LIBRARY_STATE_OPTIONS)[number]["value"];

export function userStatusLabel(status: string | null | undefined): string {
  if (!status) return "—";
  return USER_STATUS_OPTIONS.find((option) => option.value === status)?.label ?? status;
}

export interface LibraryFriend {
  steamid: string;
  personaname: string | null;
  avatarfull: string | null;
  gameCount: number;
}

export interface LibraryFriendOwner {
  steamid: string;
  personaname: string | null;
  avatarfull: string | null;
}

export interface LibraryGame {
  appid: number;
  name: string;
  playtimeForever: number | null;
  userStatus: string | null;
  controllerSupport: LibraryControllerSupport | null;
  minPlayers: number | null;
  maxPlayers: number | null;
  isLocalCoop: boolean | null;
  isSplitScreen: boolean | null;
  isMultiplayer: boolean | null;
  protonDbTier: LibraryProtonDbTier | null;
  reviewScore: number | null;
  hltbMainStory: number | null;
  hltbMainExtra: number | null;
  hltbCompletionist: number | null;
  headerImage: string | null;
  shortDescription: string | null;
  currentPrice: string | null;
  initialPrice: string | null;
  discountPercent: number | null;
  lowestPrice: string | null;
  lowestDiscountPercent: number | null;
  lowestPriceDate: string | null;
  categories: string[];
  friends: LibraryFriendOwner[];
}

export interface LibraryFilters {
  search: string;
  playtimeMin: number | null;
  playtimeMax: number | null;
  hltbMin: number | null;
  hltbMax: number | null;
  isLocalCoop: boolean;
  isSplitScreen: boolean;
  controllerSupport: LibraryControllerSupport | null;
  playersMin: number | null;
  playersMax: number | null;
  friendIds: string[];
  genres: string[];
  protonDbTier: LibraryProtonDbTier | null;
  userStatus: LibraryStateFilter | null;
  minReview: number | null;
  sortBy: LibrarySortField;
  sortOrder: "asc" | "desc";
}

export const DEFAULT_FILTERS: LibraryFilters = {
  search: "",
  playtimeMin: null,
  playtimeMax: null,
  hltbMin: null,
  hltbMax: null,
  isLocalCoop: false,
  isSplitScreen: false,
  controllerSupport: null,
  playersMin: null,
  playersMax: null,
  friendIds: [],
  genres: [],
  protonDbTier: null,
  userStatus: null,
  minReview: null,
  sortBy: "name",
  sortOrder: "asc",
};

export const PLAYTIME_SLIDER_MAX_HOURS = 200;
export const HLTB_SLIDER_MAX_HOURS = 120;
export const PLAYERS_SLIDER_MIN = 1;
export const PLAYERS_SLIDER_MAX = 8;

export function filtersToSearchParams(filters: LibraryFilters): URLSearchParams {
  const params = new URLSearchParams();
  const search = filters.search.trim();
  if (search) params.set("search", search);
  if (filters.playtimeMin !== null) params.set("minPlaytime", String(Math.round(filters.playtimeMin * 60)));
  if (filters.playtimeMax !== null) params.set("maxPlaytime", String(Math.round(filters.playtimeMax * 60)));
  if (filters.hltbMin !== null) params.set("minHltb", String(filters.hltbMin));
  if (filters.hltbMax !== null) params.set("maxHltb", String(filters.hltbMax));
  if (filters.isLocalCoop) params.set("isLocalCoop", "true");
  if (filters.isSplitScreen) params.set("isSplitScreen", "true");
  if (filters.controllerSupport) params.set("controllerSupport", filters.controllerSupport);
  if (filters.playersMin !== null) params.set("minPlayers", String(filters.playersMin));
  if (filters.playersMax !== null) params.set("maxPlayers", String(filters.playersMax));
  if (filters.friendIds.length > 0) params.set("friendIds", filters.friendIds.join(","));
  if (filters.genres.length > 0) params.set("genres", filters.genres.join(","));
  if (filters.protonDbTier) params.set("protonDbTier", filters.protonDbTier);
  if (filters.userStatus) params.set("userStatus", filters.userStatus);
  if (filters.minReview !== null) params.set("minReview", String(filters.minReview));
  params.set("sortBy", filters.sortBy);
  params.set("sortOrder", filters.sortOrder);
  return params;
}

export function countActiveFilters(filters: LibraryFilters): number {
  let count = 0;
  if (filters.search.trim()) count += 1;
  if (filters.playtimeMin !== null || filters.playtimeMax !== null) count += 1;
  if (filters.hltbMin !== null || filters.hltbMax !== null) count += 1;
  if (filters.isLocalCoop) count += 1;
  if (filters.isSplitScreen) count += 1;
  if (filters.controllerSupport) count += 1;
  if (filters.playersMin !== null || filters.playersMax !== null) count += 1;
  if (filters.friendIds.length > 0) count += 1;
  if (filters.genres.length > 0) count += 1;
  if (filters.protonDbTier) count += 1;
  if (filters.userStatus) count += 1;
  if (filters.minReview !== null) count += 1;
  return count;
}

export function clampRange(
  min: number | null,
  max: number | null,
  bounds: { min: number; max: number },
): { min: number | null; max: number | null } {
  const clamp = (value: number) => Math.min(bounds.max, Math.max(bounds.min, value));
  const nextMin = min === null ? null : clamp(min);
  const nextMax = max === null ? null : clamp(max);
  if (nextMin !== null && nextMax !== null && nextMin > nextMax) {
    return { min: nextMax, max: nextMin };
  }
  return { min: nextMin, max: nextMax };
}

export function formatPlaytimeHours(minutes: number | null | undefined): string {
  if (minutes === null || minutes === undefined) return "—";
  const hours = minutes / 60;
  if (hours < 1) return `${minutes} min`;
  return `${hours.toFixed(hours < 10 ? 1 : 0)} h`;
}

export function formatHltbHours(hours: number | null | undefined): string {
  if (hours === null || hours === undefined || hours <= 0) return "—";
  return `${hours.toFixed(hours < 10 ? 1 : 0)} h`;
}

export function formatPlayers(min: number | null | undefined, max: number | null | undefined): string {
  if (min === null || min === undefined || max === null || max === undefined) return "—";
  if (min === max) return `${min}`;
  return `${min}–${max}`;
}

export function formatReviewScore(score: number | null | undefined): string {
  if (score === null || score === undefined || score <= 0) return "—";
  return `${score}%`;
}
