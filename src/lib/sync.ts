import { randomUUID } from "node:crypto";
import { and, eq, inArray, isNull, notInArray, or } from "drizzle-orm";
import { sql } from "drizzle-orm";

import type { CheapSharkClient } from "@/lib/cheapshark";
import type { SteamHubDatabase } from "@/lib/db";
import { categories, friendGames, friends, games, settings } from "@/lib/db/schema";
import { safeGameNameForHltb, type HltbClient } from "@/lib/hltb";
import type { ProtonDbClient } from "@/lib/proton";
import { buildHeaderImageUrl, type SteamClient } from "@/lib/steam";

export type SyncPhase =
  | "owned_games"
  | "friends"
  | "friend_libraries"
  | "store_metadata"
  | "proton"
  | "cheapshark"
  | "hltb"
  | "completed"
  | "failed"
  | "cancelled";

export type SyncStatus = "running" | "completed" | "failed" | "cancelled";

export interface SyncStats {
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

export interface SyncProgress {
  jobId: string;
  status: SyncStatus;
  phase: SyncPhase;
  message: string;
  processed: number;
  total: number;
  percent: number;
  startedAt: string;
  updatedAt: string;
  finishedAt: string | null;
  error: string | null;
  stats: SyncStats;
}

export interface SyncDependencies {
  db: SteamHubDatabase;
  steam: SteamClient;
  hltb: HltbClient;
  proton: ProtonDbClient;
  cheapshark: CheapSharkClient;
}

export interface SyncOptions {
  jobId?: string;
  steamId?: string;
  enrichStoreMetadata?: boolean;
  enrichHltb?: boolean;
  enrichProton?: boolean;
  enrichCheapShark?: boolean;
  maxFriendLibraries?: number;
  signal?: AbortSignal;
  onProgress?: (progress: SyncProgress) => void;
}

const SETTINGS_PROGRESS_KEY = "sync:progress";
const SETTINGS_STORE_FAILED_KEY = "sync:storeFailed";
const SETTINGS_HLTB_MISSING_KEY = "sync:hltbMissing";
const SETTINGS_PROTON_CHECKED_KEY = "sync:protonChecked";
const SETTINGS_CHEAPSHARK_CHECKED_KEY = "sync:cheapsharkChecked";
const INSERT_CHUNK_SIZE = 200;
const DEFAULT_MAX_FRIEND_LIBRARIES = 50;

export class SyncCancelledError extends Error {
  constructor() {
    super("Sincronización cancelada");
    this.name = "SyncCancelledError";
  }
}

function emptyStats(): SyncStats {
  return {
    games: 0,
    newGames: 0,
    friends: 0,
    friendLibraries: 0,
    friendGames: 0,
    storeMetadata: 0,
    storeFailed: 0,
    protonTiers: 0,
    protonUnavailable: 0,
    cheapsharkPrices: 0,
    cheapsharkUnavailable: 0,
    hltbMatches: 0,
    hltbNotFound: 0,
    storeRequests: 0,
    protonRequests: 0,
    cheapsharkRequests: 0,
    hltbRequests: 0,
  };
}

export async function runSync(
  deps: SyncDependencies,
  options: SyncOptions = {},
): Promise<SyncProgress> {
  const { db, steam, hltb, proton, cheapshark } = deps;
  const {
    steamId = process.env.STEAM_ID ?? "",
    enrichStoreMetadata = true,
    enrichHltb = true,
    enrichProton = true,
    enrichCheapShark = true,
    maxFriendLibraries = DEFAULT_MAX_FRIEND_LIBRARIES,
    signal,
    onProgress,
  } = options;

  const stats = emptyStats();
  const plan = { units: 0, done: 0 };
  const jobId = options.jobId ?? randomUUID();
  const startedAt = new Date();

  let progress: SyncProgress = {
    jobId,
    status: "running",
    phase: "owned_games",
    message: "Descargando biblioteca de Steam",
    processed: 0,
    total: 0,
    percent: 0,
    startedAt: startedAt.toISOString(),
    updatedAt: startedAt.toISOString(),
    finishedAt: null,
    error: null,
    stats,
  };

  const emit = (patch: Partial<SyncProgress>): SyncProgress => {
    progress = {
      ...progress,
      ...patch,
      stats,
      updatedAt: new Date().toISOString(),
      processed: plan.done,
      total: plan.units,
      percent: plan.units > 0 ? Math.min(100, Math.round((plan.done / plan.units) * 100)) : 0,
    };
    persistProgress(db, progress);
    onProgress?.(progress);
    return progress;
  };

  const reserve = (count: number) => {
    plan.units += Math.max(1, count);
  };

  const advance = (count = 1) => {
    plan.done = Math.min(plan.units, plan.done + Math.max(1, count));
  };

  try {
    if (signal?.aborted) throw new SyncCancelledError();
    if (!steamId) {
      throw new Error("STEAM_ID no está definido; revisa .env.local");
    }

    reserve(1);
    emit({ message: "Descargando biblioteca de Steam (GetOwnedGames)" });
    const ownedGames = await steam.getOwnedGames(steamId, signal);
    assertNotCancelled(signal);
    const syncResult = await persistOwnedGames(db, ownedGames);
    stats.games = ownedGames.length;
    stats.newGames = syncResult.inserted;
    advance();

    reserve(1);
    const friendList = await steam.getFriendList(steamId, signal);
    assertNotCancelled(signal);
    await persistFriends(db, friendList);
    stats.friends = friendList.length;

    const libraryPlan = Math.min(friendList.length, maxFriendLibraries);

    reserve(libraryPlan);
    reserve(1);

    emit({
      phase: "friends",
      message: `${stats.friends} amigos encontrados`,
    });
    advance();

    emit({ phase: "friend_libraries", message: "Descargando bibliotecas de amigos" });
    for (const friend of friendList.slice(0, maxFriendLibraries)) {
      assertNotCancelled(signal);
      const libraryGames = await steam.getOwnedGames(friend.steamid, signal).catch(() => null);
      if (libraryGames && libraryGames.length > 0) {
        stats.friendGames += await persistFriendGames(db, friend.steamid, libraryGames);
        stats.friendLibraries += 1;
      }
      advance();
      emit({});
    }
    if (libraryPlan === 0) advance();
    emit({ message: `${stats.friendLibraries} bibliotecas de amigos sincronizadas` });

    const storeCandidates = enrichStoreMetadata
      ? await findStoreMetadataCandidates(db)
      : [];
    const protonCandidates = enrichProton ? await findProtonCandidates(db) : [];
    const cheapsharkCandidates = enrichCheapShark ? await findCheapSharkCandidates(db) : [];
    const hltbCandidates = enrichHltb ? await findHltbCandidates(db) : [];

    reserve(enrichStoreMetadata ? storeCandidates.length : 1);
    reserve(enrichProton ? protonCandidates.length : 1);
    reserve(enrichCheapShark ? cheapsharkCandidates.length : 1);
    reserve(enrichHltb ? hltbCandidates.length : 1);

    if (enrichStoreMetadata) {
      const previousFailed = await readSettingArray(db, SETTINGS_STORE_FAILED_KEY);
      emit({
        phase: "store_metadata",
        message: `Descargando metadatos de la Store API (${storeCandidates.length} juegos)`,
      });
      const storeFailed: number[] = [];
      for (const game of storeCandidates) {
        assertNotCancelled(signal);
        const details = await steam.getAppDetails(game.appid, signal).catch(() => null);

        if (details) {
          await persistStoreMetadata(db, game.appid, details);
          const reviewScore = await steam.getReviewScore(game.appid, signal).catch(() => null);
          if (reviewScore !== null) {
            await db
              .update(games)
              .set({ reviewScore })
              .where(eq(games.appid, game.appid))
              .run();
          }
          stats.storeMetadata += 1;
        } else {
          storeFailed.push(game.appid);
          stats.storeFailed += 1;
        }
        advance();
        emit({});
      }
      if (storeCandidates.length === 0) advance();
      const stillWithoutMetadata = new Set(
        db
          .select({ appid: games.appid })
          .from(games)
          .where(or(isNull(games.controllerSupport), isNull(games.currentPrice)))
          .all()
          .map((row) => row.appid),
      );
      const mergedFailed = [
        ...new Set([
          ...previousFailed.filter((appid) => stillWithoutMetadata.has(appid)),
          ...storeFailed,
        ]),
      ].sort((a, b) => a - b);
      await writeSetting(db, SETTINGS_STORE_FAILED_KEY, JSON.stringify(mergedFailed));
      emit({ message: `${stats.storeMetadata} metadatos actualizados` });
    } else {
      advance();
    }

    if (enrichProton) {
      const protonChecked = new Set(await readSettingArray(db, SETTINGS_PROTON_CHECKED_KEY));
      emit({
        phase: "proton",
        message: `Consultando ProtonDB (${protonCandidates.length} juegos)`,
      });
      for (const game of protonCandidates) {
        assertNotCancelled(signal);
        try {
          const summary = await proton.getSummary(game.appid, signal);
          if (summary) {
            await db
              .update(games)
              .set({ protonDbTier: summary.tier })
              .where(eq(games.appid, game.appid))
              .run();
            if (summary.tier !== "UNKNOWN") {
              stats.protonTiers += 1;
            } else {
              stats.protonUnavailable += 1;
            }
          } else {
            await db
              .update(games)
              .set({ protonDbTier: "UNKNOWN" })
              .where(eq(games.appid, game.appid))
              .run();
            stats.protonUnavailable += 1;
          }
          protonChecked.add(game.appid);
        } catch {
          stats.protonUnavailable += 1;
        }
        advance();
        emit({});
      }
      if (protonCandidates.length === 0) advance();
      await writeSetting(
        db,
        SETTINGS_PROTON_CHECKED_KEY,
        JSON.stringify([...protonChecked].sort((a, b) => a - b)),
      );
      emit({ message: `${stats.protonTiers} tiers ProtonDB actualizados` });
    } else {
      advance();
    }

    if (enrichCheapShark) {
      const cheapsharkChecked = new Set(
        await readSettingArray(db, SETTINGS_CHEAPSHARK_CHECKED_KEY),
      );
      emit({
        phase: "cheapshark",
        message: `Consultando CheapShark (${cheapsharkCandidates.length} juegos)`,
      });
      for (const game of cheapsharkCandidates) {
        assertNotCancelled(signal);
        try {
          const history = await cheapshark.getPriceHistory(game.appid, signal);
          if (history) {
            await db
              .update(games)
              .set({
                lowestPrice: history.lowestPrice,
                lowestDiscountPercent: history.lowestDiscountPercent,
                lowestPriceDate: history.lowestPriceDate,
              })
              .where(eq(games.appid, game.appid))
              .run();
            if (history.lowestPrice || history.lowestDiscountPercent !== null) {
              stats.cheapsharkPrices += 1;
            } else {
              stats.cheapsharkUnavailable += 1;
            }
            cheapsharkChecked.add(game.appid);
          } else {
            stats.cheapsharkUnavailable += 1;
            cheapsharkChecked.add(game.appid);
          }
        } catch {
          stats.cheapsharkUnavailable += 1;
        }
        advance();
        emit({});
      }
      if (cheapsharkCandidates.length === 0) advance();
      await writeSetting(
        db,
        SETTINGS_CHEAPSHARK_CHECKED_KEY,
        JSON.stringify([...cheapsharkChecked].sort((a, b) => a - b)),
      );
      emit({ message: `${stats.cheapsharkPrices} históricos de precio obtenidos` });
    } else {
      advance();
    }

    if (enrichHltb) {
      emit({
        phase: "hltb",
        message: `Consultando HowLongToBeat (${hltbCandidates.length} juegos)`,
      });
      let notFound = 0;
      for (const game of hltbCandidates) {
        assertNotCancelled(signal);
        const durations = await hltb.getDurations(safeGameNameForHltb(game.name), signal);

        if (durations) {
          await db
            .update(games)
            .set({
              hltbMainStory: durations.mainStory,
              hltbMainExtra: durations.mainExtra,
              hltbCompletionist: durations.completionist,
            })
            .where(eq(games.appid, game.appid))
            .run();
          stats.hltbMatches += 1;
        } else {
          notFound += 1;
        }
        advance();
        emit({});
      }
      if (hltbCandidates.length === 0) advance();
      stats.hltbNotFound = notFound;
      await writeSetting(
        db,
        SETTINGS_HLTB_MISSING_KEY,
        JSON.stringify(await missingHltbAppids(db)),
      );
      emit({ message: `${stats.hltbMatches} duraciones HLTB obtenidas` });
    } else {
      advance();
    }

    stats.storeRequests = steam.getStoreRequestCount();
    stats.protonRequests = proton.getRequestCount();
    stats.cheapsharkRequests = cheapshark.getRequestCount();
    stats.hltbRequests = hltb.getRequestCount();

    advance();

    return emit({
      phase: "completed",
      status: "completed",
      message: `Sincronización completada: ${stats.games} juegos, ${stats.friends} amigos`,
      finishedAt: new Date().toISOString(),
    });
  } catch (error) {
    const cancelled =
      error instanceof SyncCancelledError ||
      signal?.aborted === true ||
      (error instanceof Error && (error.name === "AbortError" || error.name === "CanceledError"));
    stats.storeRequests = steam.getStoreRequestCount();
    stats.protonRequests = proton.getRequestCount();
    stats.cheapsharkRequests = cheapshark.getRequestCount();
    stats.hltbRequests = hltb.getRequestCount();

    return emit({
      phase: cancelled ? "cancelled" : "failed",
      status: cancelled ? "cancelled" : "failed",
      message: cancelled ? "Sincronización cancelada" : "Sincronización fallida",
      error: cancelled ? null : error instanceof Error ? error.message : String(error),
      finishedAt: new Date().toISOString(),
    });
  }
}

function assertNotCancelled(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw new SyncCancelledError();
}

async function persistOwnedGames(
  db: SteamHubDatabase,
  ownedGames: Array<{ appid: number; name: string; playtimeForever: number; imgIconUrl: string | null }>,
): Promise<{ inserted: number }> {
  if (ownedGames.length === 0) return { inserted: 0 };

  const appids = ownedGames.map((game) => game.appid);
  const existing = await db
    .select({ appid: games.appid })
    .from(games)
    .where(inArray(games.appid, appids))
    .all();

  const rows = ownedGames.map((game) => ({
    appid: game.appid,
    name: game.name,
    playtimeForever: game.playtimeForever,
    imgIconUrl: game.imgIconUrl,
    headerImage: buildHeaderImageUrl(game.appid, game.imgIconUrl),
    updatedAt: new Date().toISOString(),
  }));

  for (const chunk of chunkArray(rows, INSERT_CHUNK_SIZE)) {
    await db
      .insert(games)
      .values(chunk)
      .onConflictDoUpdate({
        target: games.appid,
        set: {
          name: sql`excluded.name`,
          playtimeForever: sql`excluded.playtime_forever`,
          imgIconUrl: sql`excluded.img_icon_url`,
          headerImage: sql`coalesce(${games.headerImage}, excluded.header_image)`,
          updatedAt: sql`CURRENT_TIMESTAMP`,
        },
      })
      .run();
  }

  return { inserted: ownedGames.length - existing.length };
}

async function persistFriends(
  db: SteamHubDatabase,
  friendList: Array<{ steamid: string; personaname: string; avatarfull: string }>,
): Promise<void> {
  if (friendList.length === 0) return;

  const rows = friendList.map((friend) => ({
    steamid: friend.steamid,
    personaname: friend.personaname,
    avatarfull: friend.avatarfull,
  }));

  for (const chunk of chunkArray(rows, INSERT_CHUNK_SIZE)) {
    await db
      .insert(friends)
      .values(chunk)
      .onConflictDoUpdate({
        target: friends.steamid,
        set: {
          personaname: sql`excluded.personaname`,
          avatarfull: sql`excluded.avatarfull`,
        },
      })
      .run();
  }
}

async function persistFriendGames(
  db: SteamHubDatabase,
  steamid: string,
  libraryGames: Array<{ appid: number; name: string; imgIconUrl?: string | null }>,
): Promise<number> {
  if (libraryGames.length === 0) return 0;

  const appids = libraryGames.map((game) => game.appid);
  const existing = new Set(
    db
      .select({ appid: games.appid })
      .from(games)
      .where(inArray(games.appid, appids))
      .all()
      .map((row) => row.appid),
  );
  const missing = libraryGames.filter((game) => !existing.has(game.appid));

  if (missing.length > 0) {
    const gameRows = missing.map((game) => ({
      appid: game.appid,
      name: game.name.length > 0 ? game.name : `Juego ${game.appid}`,
      imgIconUrl: game.imgIconUrl ?? null,
      headerImage: buildHeaderImageUrl(game.appid, game.imgIconUrl ?? null),
      updatedAt: new Date().toISOString(),
    }));
    for (const chunk of chunkArray(gameRows, INSERT_CHUNK_SIZE)) {
      await db
        .insert(games)
        .values(chunk)
        .onConflictDoNothing()
        .run();
    }
  }

  const rows = libraryGames.map((game) => ({ steamid, appid: game.appid }));
  let inserted = 0;

  for (const chunk of chunkArray(rows, INSERT_CHUNK_SIZE)) {
    const result = await db
      .insert(friendGames)
      .values(chunk)
      .onConflictDoNothing()
      .run();
    inserted += result.changes;
  }

  return inserted;
}

async function persistStoreMetadata(
  db: SteamHubDatabase,
  appid: number,
  details: {
    isFree: boolean;
    requiredAge: number;
    shortDescription: string | null;
    headerImage: string | null;
    controllerSupport: "full" | "partial" | "none";
    isMultiplayer: boolean;
    isLocalCoop: boolean;
    isSplitScreen: boolean;
    diskSpaceGb: number;
    priceOverview: {
      currency: string | null;
      initialPrice: string | null;
      finalPrice: string | null;
      discountPercent: number;
      isFree: boolean;
    };
    minPlayers: number;
    maxPlayers: number;
    categories: Array<{ id: number; description: string }>;
    genres: string[];
  },
): Promise<void> {
  await db
    .update(games)
    .set({
      isFree: details.isFree,
      requiredAge: details.requiredAge,
      shortDescription: details.shortDescription,
      headerImage: details.headerImage,
      controllerSupport: details.controllerSupport,
      isMultiplayer: details.isMultiplayer,
      isLocalCoop: details.isLocalCoop,
      isSplitScreen: details.isSplitScreen,
      diskSpaceGb: details.diskSpaceGb,
      currentPrice: details.priceOverview.finalPrice,
      initialPrice: details.priceOverview.initialPrice,
      discountPercent: details.priceOverview.discountPercent,
      minPlayers: details.minPlayers,
      maxPlayers: details.maxPlayers,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(games.appid, appid))
    .run();

  await db.delete(categories).where(eq(categories.appid, appid)).run();

  const categoryRows = [...details.categories, ...details.genres.map(toCategoryRow)].filter(
    (category, index, all) =>
      all.findIndex((item) => item.description === category.description) === index,
  );

  if (categoryRows.length > 0) {
    await db
      .insert(categories)
      .values(categoryRows.map((category) => ({ appid, name: category.description })))
      .run();
  }
}

function toCategoryRow(genre: string): { id: number; description: string } {
  return { id: -1, description: genre };
}

async function findStoreMetadataCandidates(
  db: SteamHubDatabase,
): Promise<Array<{ appid: number; name: string }>> {
  const failed = await readSettingArray(db, SETTINGS_STORE_FAILED_KEY);
  const needsMetadata = or(isNull(games.controllerSupport), isNull(games.currentPrice));
  const condition =
    failed.length > 0 ? and(needsMetadata, notInArray(games.appid, failed)) : needsMetadata;

  return db
    .select({ appid: games.appid, name: games.name })
    .from(games)
    .where(condition)
    .all();
}

async function findProtonCandidates(
  db: SteamHubDatabase,
): Promise<Array<{ appid: number; name: string }>> {
  const checked = await readSettingArray(db, SETTINGS_PROTON_CHECKED_KEY);
  const condition = or(isNull(games.protonDbTier), eq(games.protonDbTier, "UNKNOWN"));
  const finalCondition =
    checked.length > 0 ? and(condition, notInArray(games.appid, checked)) : condition;

  return db
    .select({ appid: games.appid, name: games.name })
    .from(games)
    .where(finalCondition)
    .all();
}

async function findCheapSharkCandidates(
  db: SteamHubDatabase,
): Promise<Array<{ appid: number; name: string }>> {
  const checked = await readSettingArray(db, SETTINGS_CHEAPSHARK_CHECKED_KEY);
  const condition = isNull(games.lowestPrice);
  const finalCondition = checked.length > 0 ? and(condition, notInArray(games.appid, checked)) : condition;

  return db
    .select({ appid: games.appid, name: games.name })
    .from(games)
    .where(finalCondition)
    .all();
}

async function findHltbCandidates(
  db: SteamHubDatabase,
): Promise<Array<{ appid: number; name: string }>> {
  const missing = await readSettingArray(db, SETTINGS_HLTB_MISSING_KEY);
  const baseCondition = eq(games.hltbMainStory, 0);
  const condition = missing.length > 0 ? and(baseCondition, notInArray(games.appid, missing)) : baseCondition;

  return db
    .select({ appid: games.appid, name: games.name })
    .from(games)
    .where(condition)
    .all();
}

async function missingHltbAppids(db: SteamHubDatabase): Promise<number[]> {
  const rows = await db
    .select({ appid: games.appid })
    .from(games)
    .where(eq(games.hltbMainStory, 0))
    .all();

  return rows.map((row) => row.appid);
}

function persistProgress(db: SteamHubDatabase, progress: SyncProgress): void {
  try {
    writeSettingSync(db, SETTINGS_PROGRESS_KEY, JSON.stringify(progress));
  } catch {
    return;
  }
}

function writeSettingSync(db: SteamHubDatabase, key: string, value: string): void {
  db.run(sql`
    INSERT INTO settings (key, value) VALUES (${key}, ${value})
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `);
}

async function writeSetting(
  db: SteamHubDatabase,
  key: string,
  value: string,
): Promise<void> {
  await db
    .insert(settings)
    .values({ key, value })
    .onConflictDoUpdate({ target: settings.key, set: { value } })
    .run();
}

async function readSettingArray(db: SteamHubDatabase, key: string): Promise<number[]> {
  const row = db.select({ value: settings.value }).from(settings).where(eq(settings.key, key)).get();
  if (!row?.value) return [];

  try {
    const parsed = JSON.parse(row.value);
    return Array.isArray(parsed) ? parsed.filter((item): item is number => typeof item === "number") : [];
  } catch {
    return [];
  }
}

export async function readStoredProgress(db: SteamHubDatabase): Promise<SyncProgress | null> {
  const row = db.select({ value: settings.value }).from(settings).where(eq(settings.key, SETTINGS_PROGRESS_KEY)).get();
  if (!row?.value) return null;

  try {
    return JSON.parse(row.value) as SyncProgress;
  } catch {
    return null;
  }
}

function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

interface RunningJob {
  jobId: string;
  controller: AbortController;
  promise: Promise<SyncProgress> | null;
  progress: SyncProgress | null;
}

let runningJob: RunningJob | null = null;

export function getRunningJob(): { jobId: string; progress: SyncProgress | null } | null {
  return runningJob ? { jobId: runningJob.jobId, progress: runningJob.progress } : null;
}

export function cancelRunningJob(): boolean {
  if (!runningJob) return false;
  runningJob.controller.abort();
  return true;
}

export function startSyncJob(
  deps: SyncDependencies,
  options: SyncOptions = {},
): { jobId: string; promise: Promise<SyncProgress> } {
  if (runningJob) {
    throw new SyncAlreadyRunningError(runningJob.jobId);
  }

  const controller = new AbortController();
  const jobId = options.jobId ?? randomUUID();

  const job: RunningJob = { jobId, controller, promise: null, progress: null };
  runningJob = job;

  const promise = runSync(deps, {
    ...options,
    jobId,
    signal: options.signal ?? controller.signal,
    onProgress: (progress) => {
      job.progress = progress;
      options.onProgress?.(progress);
    },
  }).finally(() => {
    if (runningJob === job) runningJob = null;
  });

  job.promise = promise;
  return { jobId, promise };
}

export class SyncAlreadyRunningError extends Error {
  readonly jobId: string;

  constructor(jobId: string) {
    super(`Ya hay una sincronización en curso (job ${jobId})`);
    this.name = "SyncAlreadyRunningError";
    this.jobId = jobId;
  }
}