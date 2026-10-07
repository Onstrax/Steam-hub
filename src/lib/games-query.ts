import {
  and,
  asc,
  desc,
  eq,
  exists,
  gt,
  gte,
  inArray,
  lte,
  sql,
  type SQL,
} from "drizzle-orm";

import type { SteamHubDatabase } from "@/lib/db";
import {
  categories,
  friendGames,
  friends,
  games,
  PROTON_DB_TIERS,
  type ControllerSupport,
  type Game,
  type ProtonDbTier,
  type UserStatus,
} from "@/lib/db/schema";

export const GAME_SORT_FIELDS = ["name", "playtime", "hltb", "review", "maxPlayers", "updated"] as const;
export type GameSortField = (typeof GAME_SORT_FIELDS)[number];

export const CONTROLLER_SUPPORT_VALUES: ControllerSupport[] = ["full", "partial", "none"];
export const PROTON_DB_TIER_VALUES: ProtonDbTier[] = PROTON_DB_TIERS;
export const USER_STATUS_VALUES: UserStatus[] = ["Backlog", "Playing", "Completed", "Abandoned"];
export const LIBRARY_STATE_VALUES = ["notPlayed", "tested", ...USER_STATUS_VALUES] as const;
export type LibraryState = (typeof LIBRARY_STATE_VALUES)[number];

export interface GamesQuery {
  search?: string;
  minPlaytime?: number;
  maxPlaytime?: number;
  minHltb?: number;
  maxHltb?: number;
  isLocalCoop?: boolean;
  isSplitScreen?: boolean;
  controllerSupport?: ControllerSupport[];
  minPlayers?: number;
  maxPlayers?: number;
  friendIds?: string[];
  genres?: string[];
  protonDbTier?: ProtonDbTier[];
  userStatus?: LibraryState;
  minReview?: number;
  sortBy: GameSortField;
  sortOrder: "asc" | "desc";
}

export interface GameFriendOwner {
  steamid: string;
  personaname: string | null;
  avatarfull: string | null;
}

export interface GameListItem extends Game {
  categories: string[];
  friends: GameFriendOwner[];
}

export class GamesQueryError extends Error {
  readonly param: string;

  constructor(param: string, message: string) {
    super(message);
    this.name = "GamesQueryError";
    this.param = param;
  }
}

const TRUE_VALUES = new Set(["true", "1", "yes", "on"]);
const FALSE_VALUES = new Set(["false", "0", "no", "off"]);

export function parseGamesQuery(params: URLSearchParams): GamesQuery {
  return {
    search: readText(params, "search"),
    minPlaytime: readNumber(params, "minPlaytime", { integer: true }),
    maxPlaytime: readNumber(params, "maxPlaytime", { integer: true }),
    minHltb: readNumber(params, "minHltb"),
    maxHltb: readNumber(params, "maxHltb"),
    isLocalCoop: readBoolean(params, "isLocalCoop"),
    isSplitScreen: readBoolean(params, "isSplitScreen"),
    controllerSupport: readEnumList<ControllerSupport>(
      params,
      "controllerSupport",
      CONTROLLER_SUPPORT_VALUES,
    ),
    minPlayers: readNumber(params, "minPlayers", { integer: true }),
    maxPlayers: readNumber(params, "maxPlayers", { integer: true }),
    friendIds: readList(params, "friendIds"),
    genres: readList(params, "genres"),
    protonDbTier: readEnumList<ProtonDbTier>(
      params,
      "protonDbTier",
      PROTON_DB_TIER_VALUES,
    ),
    userStatus: readLibraryState(params),
    minReview: readNumber(params, "minReview", { integer: true }),
    sortBy: readSortField(params),
    sortOrder: readSortOrder(params),
  };
}

export async function queryGames(
  db: SteamHubDatabase,
  query: GamesQuery,
): Promise<GameListItem[]> {
  const conditions: SQL[] = [];

  if (query.search) {
    const pattern = `%${query.search.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
    conditions.push(sql`${games.name} LIKE ${pattern} ESCAPE '\\'`);
  }

  if (query.minPlaytime !== undefined) {
    conditions.push(gte(games.playtimeForever, query.minPlaytime));
  }
  if (query.maxPlaytime !== undefined) {
    conditions.push(lte(games.playtimeForever, query.maxPlaytime));
  }

  if (query.minHltb !== undefined || query.maxHltb !== undefined) {
    conditions.push(gt(games.hltbMainStory, 0));
    if (query.minHltb !== undefined) conditions.push(gte(games.hltbMainStory, query.minHltb));
    if (query.maxHltb !== undefined) conditions.push(lte(games.hltbMainStory, query.maxHltb));
  }

  if (query.isLocalCoop !== undefined) {
    conditions.push(eq(games.isLocalCoop, query.isLocalCoop));
  }
  if (query.isSplitScreen !== undefined) {
    conditions.push(eq(games.isSplitScreen, query.isSplitScreen));
  }

  if (query.controllerSupport && query.controllerSupport.length > 0) {
    conditions.push(inArray(games.controllerSupport, query.controllerSupport));
  }

  if (query.minPlayers !== undefined) {
    // Intersección de rangos: el juego debe soportar al menos minPlayers jugadores.
    conditions.push(gte(games.maxPlayers, query.minPlayers));
  }
  if (query.maxPlayers !== undefined) {
    conditions.push(lte(games.minPlayers, query.maxPlayers));
  }

  if (query.protonDbTier && query.protonDbTier.length > 0) {
    conditions.push(inArray(games.protonDbTier, query.protonDbTier));
  }

  if (query.userStatus === "notPlayed") {
    conditions.push(eq(games.playtimeForever, 0));
  } else if (query.userStatus === "tested") {
    conditions.push(sql`${games.playtimeForever} > 0 AND ${games.playtimeForever} < 120`);
  } else if (query.userStatus) {
    conditions.push(eq(games.userStatus, query.userStatus));
  }

  if (query.minReview !== undefined) {
    conditions.push(gte(games.reviewScore, query.minReview));
  }

  if (query.genres && query.genres.length > 0) {
    const genreFilter = db
      .select({ appid: categories.appid })
      .from(categories)
      .where(
        and(eq(categories.appid, games.appid), inArray(categories.name, query.genres)),
      );
    conditions.push(exists(genreFilter));
  }

  for (const steamid of query.friendIds ?? []) {
    const ownedByFriend = db
      .select({ appid: friendGames.appid })
      .from(friendGames)
      .where(and(eq(friendGames.steamid, steamid), eq(friendGames.appid, games.appid)));
    conditions.push(exists(ownedByFriend));
  }

  const sortColumns: Record<GameSortField, SQL> = {
    name: sql`lower(${games.name})`,
    playtime: sql`${games.playtimeForever}`,
    hltb: sql`${games.hltbMainStory}`,
    review: sql`${games.reviewScore}`,
    maxPlayers: sql`${games.maxPlayers}`,
    updated: sql`${games.updatedAt}`,
  };
  const sortColumn = sortColumns[query.sortBy];
  const order = query.sortOrder === "desc" ? desc(sortColumn) : asc(sortColumn);

  const rows = await db
    .select()
    .from(games)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(order, asc(games.appid))
    .all();

  const appids = rows.map((game) => game.appid);
  const [categoryRows, friendRows] = await Promise.all([
    appids.length > 0
      ? db
          .select({ appid: categories.appid, name: categories.name })
          .from(categories)
          .where(inArray(categories.appid, appids))
          .all()
      : Promise.resolve([]),
    appids.length > 0
      ? db
          .select({
            appid: friendGames.appid,
            steamid: friends.steamid,
            personaname: friends.personaname,
            avatarfull: friends.avatarfull,
          })
          .from(friendGames)
          .innerJoin(friends, eq(friendGames.steamid, friends.steamid))
          .where(inArray(friendGames.appid, appids))
          .all()
      : Promise.resolve([]),
  ]);

  const categoriesByAppid = new Map<number, string[]>();
  for (const row of categoryRows) {
    if (row.appid === null || !row.name) continue;
    const list = categoriesByAppid.get(row.appid) ?? [];
    list.push(row.name);
    categoriesByAppid.set(row.appid, list);
  }

  const friendsByAppid = new Map<number, GameFriendOwner[]>();
  for (const row of friendRows) {
    const list = friendsByAppid.get(row.appid) ?? [];
    list.push({
      steamid: row.steamid,
      personaname: row.personaname,
      avatarfull: row.avatarfull,
    });
    friendsByAppid.set(row.appid, list);
  }

  return rows.map((game) => ({
    ...game,
    categories: categoriesByAppid.get(game.appid) ?? [],
    friends: friendsByAppid.get(game.appid) ?? [],
  }));
}

function readText(params: URLSearchParams, name: string): string | undefined {
  const raw = params.get(name);
  if (raw === null) return undefined;
  const value = raw.trim();
  return value.length > 0 ? value : undefined;
}

function readBoolean(params: URLSearchParams, name: string): boolean | undefined {
  const value = readText(params, name)?.toLowerCase();
  if (value === undefined) return undefined;
  if (TRUE_VALUES.has(value)) return true;
  if (FALSE_VALUES.has(value)) return false;
  throw new GamesQueryError(name, `Parámetro inválido: ${name} debe ser true o false`);
}

function readNumber(
  params: URLSearchParams,
  name: string,
  options: { integer?: boolean; min?: number } = {},
): number | undefined {
  const raw = readText(params, name);
  if (raw === undefined) return undefined;

  const value = Number(raw);
  if (!Number.isFinite(value)) {
    throw new GamesQueryError(name, `Parámetro inválido: ${name} debe ser numérico`);
  }
  if (options.integer && !Number.isInteger(value)) {
    throw new GamesQueryError(name, `Parámetro inválido: ${name} debe ser un entero`);
  }
  const min = options.min ?? 0;
  if (value < min) {
    throw new GamesQueryError(name, `Parámetro inválido: ${name} debe ser mayor o igual que ${min}`);
  }

  return value;
}

function readList(params: URLSearchParams, name: string): string[] | undefined {
  const raw = params.get(name);
  if (raw === null || raw.trim() === "") return undefined;

  const items = [...new Set(raw.split(",").map((item) => item.trim()).filter(Boolean))];
  return items.length > 0 ? items : undefined;
}

function readEnumList<T extends string>(
  params: URLSearchParams,
  name: string,
  allowed: readonly T[],
): T[] | undefined {
  const items = readList(params, name);
  if (!items) return undefined;

  return items.map((item) => {
    const match = allowed.find((value) => value.toLowerCase() === item.toLowerCase());
    if (!match) {
      throw new GamesQueryError(
        name,
        `Parámetro inválido: ${name} admite ${allowed.join(", ")}`,
      );
    }
    return match;
  });
}

function readSortField(params: URLSearchParams): GameSortField {
  const raw = readText(params, "sortBy");
  if (raw === undefined) return "name";

  const match = GAME_SORT_FIELDS.find((field) => field.toLowerCase() === raw.toLowerCase());
  if (!match) {
    throw new GamesQueryError(
      "sortBy",
      `Parámetro inválido: sortBy admite ${GAME_SORT_FIELDS.join(", ")}`,
    );
  }
  return match;
}

function readSortOrder(params: URLSearchParams): "asc" | "desc" {
  const raw = readText(params, "sortOrder");
  if (raw === undefined) return "asc";

  const normalized = raw.toLowerCase();
  if (normalized !== "asc" && normalized !== "desc") {
    throw new GamesQueryError("sortOrder", "Parámetro inválido: sortOrder admite asc o desc");
  }
  return normalized;
}

function readLibraryState(params: URLSearchParams): LibraryState | undefined {
  const raw = readText(params, "userStatus");
  if (raw === undefined) return undefined;

  const match = LIBRARY_STATE_VALUES.find(
    (value) => value.toLowerCase() === raw.toLowerCase(),
  );
  if (!match) {
    throw new GamesQueryError(
      "userStatus",
      `Parámetro inválido: userStatus admite ${LIBRARY_STATE_VALUES.join(", ")}`,
    );
  }
  return match;
}
