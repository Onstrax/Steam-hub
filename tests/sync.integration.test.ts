import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";

import type { AppDetailsResult, OwnedGame, SteamClient, SteamFriend } from "@/lib/steam";
import type { HltbClient, HltbDurations } from "@/lib/hltb";
import type { ProtonDbClient, ProtonDbSummary } from "@/lib/proton";
import type { CheapSharkClient, CheapSharkPriceHistory } from "@/lib/cheapshark";

const tempDirs: string[] = [];
const STEAM_ID = "76561190000000000";
const TEST_API_KEY = "TEST_API_KEY_0000000000";

process.env.STEAM_API_KEY = TEST_API_KEY;
process.env.STEAM_ID = STEAM_ID;

const tempDbPath = createTempDbPath();
process.env.DATABASE_PATH = tempDbPath;

let createDatabase: typeof import("@/lib/db").createDatabase;
let runMigrations: typeof import("@/lib/db/migrate").runMigrations;
let categories: typeof import("@/lib/db/schema").categories;
let friendGames: typeof import("@/lib/db/schema").friendGames;
let friends: typeof import("@/lib/db/schema").friends;
let games: typeof import("@/lib/db/schema").games;
let settings: typeof import("@/lib/db/schema").settings;
let setSyncDependencies: typeof import("@/lib/sync-deps").setSyncDependencies;
let eq: typeof import("drizzle-orm").eq;
let normalizeAppDetails: typeof import("@/lib/steam").normalizeAppDetails;
let POST: typeof import("@/app/api/sync/route").POST;
let GET: typeof import("@/app/api/sync/route").GET;
let DELETE: typeof import("@/app/api/sync/route").DELETE;

type SyncRoute = typeof import("@/app/api/sync/route");
type SyncProgressShape = {
  jobId: string;
  status: string;
  phase: string;
  message: string;
  percent: number;
  processed: number;
  total: number;
  stats: Record<string, number>;
  error: string | null;
};

function createTempDbPath(): string {
  const dir = mkdtempSync(path.join(tmpdir(), "steam-hub-test-"));
  tempDirs.push(dir);
  return path.join(dir, "steam_hub_test.db");
}

const ownedGamesFixture: OwnedGame[] = [
  {
    appid: 400,
    name: "Portal",
    playtimeForever: 145,
    imgIconUrl: "cfa928ab4119dd137e50d728e8fe703e4e970aff",
    hasCommunityVisibleStats: true,
  },
  {
    appid: 620,
    name: "Portal 2",
    playtimeForever: 500,
    imgIconUrl: "aa11bb22cc33dd44",
    hasCommunityVisibleStats: true,
  },
  {
    appid: 1145360,
    name: "Hades",
    playtimeForever: 0,
    imgIconUrl: "aabbccdd11223344",
    hasCommunityVisibleStats: true,
  },
  {
    appid: 548430,
    name: "Deep Rock Galactic",
    playtimeForever: 3000,
    imgIconUrl: "1122334455667788",
    hasCommunityVisibleStats: true,
  },
];

const friendsFixture: SteamFriend[] = [
  {
    steamid: "76561190000000001",
    personaname: "Amigo Visible",
    profileurl: "https://steamcommunity.com/id/amigo1/",
    avatarfull: "https://avatars.example/1.jpg",
    friendSince: 1500000000,
  },
  {
    steamid: "76561190000000002",
    personaname: "Amigo Privado",
    profileurl: "https://steamcommunity.com/id/amigo2/",
    avatarfull: "https://avatars.example/2.jpg",
    friendSince: 1600000000,
  },
];

const friendLibrariesFixture: Record<string, OwnedGame[]> = {
  "76561190000000001": [
    { ...ownedGamesFixture[0] },
    { ...ownedGamesFixture[1] },
    {
      appid: 480,
      name: "Spacewar",
      playtimeForever: 12,
      imgIconUrl: "spacewar-icon",
      hasCommunityVisibleStats: false,
    },
  ],
  "76561190000000002": [],
};

const appDetailsFixture: Record<number, Record<string, unknown>> = {
  400: {
    is_free: false,
    required_age: 0,
    short_description: "Portal™ es un juego de un solo jugador.",
    header_image: "https://cdn.example/400.jpg",
    controller_support: "full",
    categories: [{ id: 2, description: "Single-player" }],
    genres: [{ id: 1, description: "Action" }],
    pc_requirements: { recommended: "<strong>Storage:</strong> 2 GB available space" },
    price_overview: {
      currency: "USD",
      initial: "999",
      final: "999",
      discount_percent: 0,
      is_free: false,
    },
  },
  620: {
    is_free: false,
    required_age: 0,
    short_description: "Portal 2 cooperativo local y online.",
    header_image: "https://cdn.example/620.jpg",
    controller_support: "partial",
    categories: [
      { id: 1, description: "Single-player" },
      { id: 9, description: "Co-op" },
      { id: 28, description: "Shared/Split Screen Co-op" },
    ],
    genres: [{ id: 1, description: "Action" }],
    pc_requirements: { recommended: "<strong>Storage:</strong> 10&nbsp;GB available space" },
    price_overview: {
      currency: "USD",
      initial: 1999,
      final: 999,
      initial_formatted: "$19.99",
      final_formatted: "$9.99",
      discount_percent: 50,
      is_free: false,
    },
  },
  548430: {
    is_free: false,
    required_age: 0,
    short_description: "Excavación cooperativa para cuatro jugadores.",
    header_image: "https://cdn.example/548430.jpg",
    controller_support: "partial",
    categories: [
      { id: 9, description: "Multi-player" },
      { id: 36, description: "Online Co-op" },
    ],
    genres: [{ id: 28, description: "Simulation" }],
  },
};

const reviewScoresFixture: Record<number, number> = { 400: 95, 620: 82, 548430: 91 };

const protonFixture: Record<number, ProtonDbSummary | null> = {
  400: {
    appid: 400,
    tier: "NATIVE",
    bestReportedTier: "NATIVE",
    trendingTier: null,
    confidence: "strong",
    score: 0.95,
    total: 1200,
  },
  620: {
    appid: 620,
    tier: "PLATINUM",
    bestReportedTier: "PLATINUM",
    trendingTier: "PLATINUM",
    confidence: "strong",
    score: 0.88,
    total: 343,
  },
  1145360: null,
  548430: null,
};

const cheapsharkFixture: Record<number, CheapSharkPriceHistory | null> = {
  400: null,
  620: {
    appid: 620,
    cheapestEverPrice: "1.99",
    cheapestEverDate: "2020-09-13",
    currentCheapest: "1.99",
    lowestPrice: "1.99",
    lowestDiscountPercent: 80,
    lowestPriceDate: "2020-09-13",
  },
  1145360: null,
  548430: {
    appid: 548430,
    cheapestEverPrice: "8.74",
    cheapestEverDate: "2022-06-01",
    currentCheapest: "14.99",
    lowestPrice: "8.74",
    lowestDiscountPercent: 41,
    lowestPriceDate: "2022-06-01",
  },
};

const hltbFixture: Record<string, HltbDurations> = {
  portal: {
    hltbId: "1234",
    matchedName: "Portal",
    similarity: 1,
    mainStory: 3,
    mainExtra: 4.5,
    completionist: 8,
  },
  "deep rock galactic": {
    hltbId: "5678",
    matchedName: "Deep Rock Galactic",
    similarity: 1,
    mainStory: 30,
    mainExtra: 60,
    completionist: 150,
  },
};

function createFakeProton(): ProtonDbClient & { appids: number[] } {
  const appids: number[] = [];
  return {
    appids,
    async getSummary(appid: number) {
      appids.push(appid);
      return protonFixture[appid] ?? null;
    },
    getRequestCount() {
      return appids.length;
    },
  };
}

function createFakeCheapShark(): CheapSharkClient & { appids: number[] } {
  const appids: number[] = [];
  return {
    appids,
    async getPriceHistory(appid: number) {
      appids.push(appid);
      return cheapsharkFixture[appid] ?? null;
    },
    getRequestCount() {
      return appids.length;
    },
  };
}

interface FakeSteamOptions {
  onGetOwnedGames?: (steamId: string, signal?: AbortSignal) => Promise<void>;
  failOwnedGames?: boolean;
  unavailableAppids?: number[];
}

function createFakeSteam(options: FakeSteamOptions = {}): SteamClient & { calls: string[] } {
  const calls: string[] = [];
  let storeRequests = 0;

  return {
    calls,
    async getOwnedGames(steamId: string, signal?: AbortSignal) {
      calls.push(`getOwnedGames:${steamId}`);
      await options.onGetOwnedGames?.(steamId, signal);
      if (options.failOwnedGames) throw new Error("Steam Web API no disponible");
      if (steamId === STEAM_ID) return ownedGamesFixture;
      return friendLibrariesFixture[steamId] ?? [];
    },
    async getFriendList(steamId: string) {
      calls.push(`getFriendList:${steamId}`);
      return friendsFixture;
    },
    async getAppDetails(appid: number) {
      calls.push(`getAppDetails:${appid}`);
      storeRequests += 1;
      if (options.unavailableAppids?.includes(appid)) return null;

      const data = appDetailsFixture[appid];
      if (!data) return null;
      return mapDetails(appid, data) as AppDetailsResult;
    },
    async getReviewScore(appid: number) {
      calls.push(`getReviewScore:${appid}`);
      storeRequests += 1;
      return reviewScoresFixture[appid] ?? null;
    },
    getStoreRequestCount() {
      return storeRequests;
    },
  };
}

function mapDetails(appid: number, data: Record<string, unknown>) {
  return normalizeAppDetails(appid, data);
}

function createFakeHltb(): HltbClient & { names: string[] } {
  const names: string[] = [];
  return {
    names,
    async getDurations(gameName: string) {
      names.push(gameName);
      return hltbFixture[gameName.toLowerCase()] ?? null;
    },
    getRequestCount() {
      return names.length;
    },
  };
}

function useFreshDatabase() {
  const dbPath = createTempDbPath();
  process.env.DATABASE_PATH = dbPath;
  const db = createDatabase(dbPath);
  runMigrations(db);
  return db;
}

async function callRoute(
  handler: SyncRoute["GET"] | SyncRoute["POST"] | SyncRoute["DELETE"],
  init?: RequestInit,
): Promise<{ status: number; body: any }> {
  const response = await handler(new Request("http://localhost/api/sync", init));
  return { status: response.status, body: await response.json() };
}

async function waitForSyncToFinish(timeoutMs = 15000): Promise<SyncProgressShape> {
  const deadline = Date.now() + timeoutMs;

  for (;;) {
    const { body } = await callRoute(GET);
    const progress = body.progress as SyncProgressShape | null;

    if (progress && typeof progress.status === "string" && progress.status !== "running") {
      return progress;
    }
    if (Date.now() > deadline) throw new Error("la sincronización no terminó a tiempo");

    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolveFn: () => void = () => undefined;
  const promise = new Promise<void>((resolve) => {
    resolveFn = resolve;
  });
  return { promise, resolve: resolveFn };
}

describe("POST /api/sync (integración con SQLite)", () => {
  before(async () => {
    ({ createDatabase } = await import("@/lib/db"));
    ({ runMigrations } = await import("@/lib/db/migrate"));
    ({ categories, friendGames, friends, games, settings } = await import("@/lib/db/schema"));
    ({ setSyncDependencies } = await import("@/lib/sync-deps"));
    ({ eq } = await import("drizzle-orm"));
    ({ normalizeAppDetails } = await import("@/lib/steam"));
    ({ POST, GET, DELETE } = await import("@/app/api/sync/route"));
  });

  after(() => {
    setSyncDependencies(null);
    for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
  });

  it("sincroniza biblioteca, amigos, ProtonDB, CheapShark y metadatos de la Store API", async () => {
    const db = useFreshDatabase();
    const steam = createFakeSteam({ unavailableAppids: [1145360] });
    const hltb = createFakeHltb();
    const proton = createFakeProton();
    const cheapshark = createFakeCheapShark();
    setSyncDependencies({ db, steam, hltb, proton, cheapshark });

    const started = await callRoute(POST, { method: "POST", body: "{}" });

    assert.equal(started.status, 202);
    assert.equal(started.body.status, "running");
    assert.equal(typeof started.body.jobId, "string");

    const progress = await waitForSyncToFinish();

    assert.equal(progress.jobId, started.body.jobId, "el jobId devuelto coincide con el progreso");
    assert.equal(progress.status, "completed");
    assert.equal(progress.phase, "completed");
    assert.equal(progress.percent, 100);
    assert.equal(progress.error, null);
    assert.equal(progress.stats.games, 4);
    assert.equal(progress.stats.friends, 2);
    assert.equal(progress.stats.friendLibraries, 1);
    assert.equal(progress.stats.friendGames, 3);
    assert.equal(progress.stats.storeMetadata, 3);
    assert.equal(progress.stats.storeFailed, 2, "Hades y el juego ajeno de amigo sin appdetails");
    assert.equal(progress.stats.protonTiers, 2);
    assert.equal(progress.stats.protonUnavailable, 3);
    assert.equal(progress.stats.cheapsharkPrices, 2);
    assert.equal(progress.stats.cheapsharkUnavailable, 3);
    assert.equal(progress.stats.hltbMatches, 2);

    const gameRows = db.select().from(games).all();
    assert.equal(gameRows.length, 5, "incluye el juego solo en biblioteca de amigo");

    const portal = gameRows.find((game) => game.appid === 400);
    assert.equal(portal?.name, "Portal");
    assert.equal(portal?.playtimeForever, 145);
    assert.equal(portal?.userStatus, "Backlog");
    assert.equal(portal?.isFree, false);
    assert.equal(portal?.controllerSupport, "full");
    assert.equal(portal?.reviewScore, 95);
    assert.equal(portal?.diskSpaceGb, 2);
    assert.equal(portal?.shortDescription, "Portal™ es un juego de un solo jugador.");
    assert.equal(portal?.headerImage, "https://cdn.example/400.jpg");
    assert.equal(portal?.protonDbTier, "NATIVE");
    assert.equal(portal?.minPlayers, 1);
    assert.equal(portal?.maxPlayers, 1);

    const portal2Game = gameRows.find((game) => game.appid === 620);
    assert.equal(portal2Game?.playtimeForever, 500);
    assert.equal(portal2Game?.isMultiplayer, true);
    assert.equal(portal2Game?.isLocalCoop, true);
    assert.equal(portal2Game?.isSplitScreen, true);
    assert.equal(portal2Game?.diskSpaceGb, 10);
    assert.equal(portal2Game?.hltbMainStory, 0);
    assert.equal(portal2Game?.minPlayers, 1);
    assert.equal(portal2Game?.maxPlayers, 4);
    assert.equal(portal2Game?.currentPrice, "$9.99");
    assert.equal(portal2Game?.initialPrice, "$19.99");
    assert.equal(portal2Game?.discountPercent, 50);
    assert.equal(portal2Game?.protonDbTier, "PLATINUM");
    assert.equal(portal2Game?.lowestPrice, "1.99");
    assert.equal(portal2Game?.lowestDiscountPercent, 80);
    assert.equal(portal2Game?.lowestPriceDate, "2020-09-13");

    const hades = gameRows.find((game) => game.appid === 1145360);
    assert.equal(hades?.controllerSupport, null, "sin appdetails el juego queda pendiente");
    assert.equal(hades?.hltbMainStory, 0);
    assert.equal(hades?.protonDbTier, "UNKNOWN", "sin reporte ProtonDB se marca UNKNOWN");

    const drg = gameRows.find((game) => game.appid === 548430);
    assert.equal(drg?.controllerSupport, "partial");
    assert.equal(drg?.isMultiplayer, true);
    assert.equal(drg?.isSplitScreen, false);
    assert.equal(drg?.reviewScore, 91);
    assert.equal(drg?.hltbMainStory, 30);
    assert.equal(drg?.hltbMainExtra, 60);
    assert.equal(drg?.hltbCompletionist, 150);
    assert.equal(drg?.protonDbTier, "UNKNOWN");
    assert.equal(drg?.minPlayers, 2);
    assert.equal(drg?.maxPlayers, 4);
    assert.equal(drg?.lowestPrice, "8.74");
    assert.equal(drg?.lowestDiscountPercent, 41);

    const spacewar = gameRows.find((game) => game.appid === 480);
    assert.equal(spacewar?.name, "Spacewar");
    assert.equal(spacewar?.playtimeForever, 0, "solo se conserva la ficha mínima del juego de amigo");

    const categoryRows = db.select().from(categories).all();
    const portal2Categories = categoryRows.filter((row) => row.appid === 620).map((row) => row.name);
    assert.ok(portal2Categories.includes("Shared/Split Screen Co-op"));
    assert.ok(portal2Categories.includes("Action"));
    assert.ok(portal2Categories.includes("Multi-player") === false);

    const friendRows = db.select().from(friends).all();
    assert.equal(friendRows.length, 2);
    assert.deepEqual(
      friendRows.map((friend) => friend.personaname).sort(),
      ["Amigo Privado", "Amigo Visible"],
    );

    const friendGameRows = db.select().from(friendGames).all();
    assert.equal(friendGameRows.length, 3);
    assert.ok(
      friendGameRows.every((row) => row.steamid === "76561190000000001"),
      "solo el amigo con biblioteca pública aporta juegos",
    );
    assert.ok(
      friendGameRows.some((row) => row.appid === 480),
      "se persiste el juego que el usuario no posee",
    );

    const settingRows = db.select().from(settings).all();
    const progressSetting = settingRows.find((row) => row.key === "sync:progress");
    assert.ok(progressSetting?.value);
    assert.equal(JSON.parse(progressSetting.value).status, "completed");

    const storeFailedSetting = settingRows.find((row) => row.key === "sync:storeFailed");
    assert.deepEqual(
      JSON.parse(storeFailedSetting?.value ?? "[]").sort((a: number, b: number) => a - b),
      [480, 1145360],
    );

    const protonChecked = settingRows.find((row) => row.key === "sync:protonChecked");
    assert.deepEqual(
      JSON.parse(protonChecked?.value ?? "[]").sort((a: number, b: number) => a - b),
      [400, 480, 620, 548430, 1145360],
    );

    const cheapsharkChecked = settingRows.find((row) => row.key === "sync:cheapsharkChecked");
    assert.deepEqual(
      JSON.parse(cheapsharkChecked?.value ?? "[]").sort((a: number, b: number) => a - b),
      [400, 480, 620, 548430, 1145360],
    );

    const hltbMissingSetting = settingRows.find((row) => row.key === "sync:hltbMissing");
    assert.deepEqual(
      JSON.parse(hltbMissingSetting?.value ?? "[]").sort((a: number, b: number) => a - b),
      [480, 620, 1145360],
    );

    assert.ok(
      hltb.names.includes("Portal"),
      "HLTB se consulta con el nombre del juego",
    );
    assert.ok(steam.calls.includes("getOwnedGames:76561190000000002"));
    assert.ok(proton.appids.includes(620));
    assert.ok(cheapshark.appids.includes(548430));
  });

  it("no sobrescribe user_status ni duplica filas al re-sincronizar", async () => {
    const db = useFreshDatabase();
    const steam = createFakeSteam();
    const hltb = createFakeHltb();
    setSyncDependencies({ db, steam, hltb, proton: createFakeProton(), cheapshark: createFakeCheapShark() });

    await callRoute(POST, { method: "POST", body: JSON.stringify({ enrichHltb: false }) });
    await waitForSyncToFinish();

    db.update(games).set({ userStatus: "Completed" }).where(eq(games.appid, 400)).run();

    ownedGamesFixture[0] = { ...ownedGamesFixture[0], playtimeForever: 999 };

    const second = await callRoute(POST, { method: "POST", body: "{}" });
    assert.equal(second.status, 202);
    await waitForSyncToFinish();

    ownedGamesFixture[0] = { ...ownedGamesFixture[0], playtimeForever: 145 };

    const rows = db.select().from(games).all();
    assert.equal(rows.length, 5, "no se duplican filas");
    const portal = rows.find((game) => game.appid === 400);
    assert.equal(portal?.userStatus, "Completed", "el estado manual se conserva");
    assert.equal(portal?.playtimeForever, 999);
    assert.equal(portal?.reviewScore, 95);
    assert.equal(portal?.protonDbTier, "NATIVE");

    const categoryCount = db.select().from(categories).all().length;
    const categoriesAfterSecondRun = db.select().from(categories).all();
    assert.equal(categoryCount, categoriesAfterSecondRun.length);
    assert.ok(
      categoriesAfterSecondRun.every((row) => row.name !== null),
      "las categorías siguen pobladas",
    );
  });

  it("responde 409 mientras hay una sincronización en curso", async () => {
    const db = useFreshDatabase();
    const gate = deferred();
    const steam = createFakeSteam({ onGetOwnedGames: () => gate.promise });
    setSyncDependencies({
      db,
      steam,
      hltb: createFakeHltb(),
      proton: createFakeProton(),
      cheapshark: createFakeCheapShark(),
    });

    const first = await callRoute(POST, { method: "POST", body: "{}" });
    assert.equal(first.status, 202);

    const second = await callRoute(POST, { method: "POST", body: "{}" });
    assert.equal(second.status, 409);
    assert.equal(second.body.jobId, first.body.jobId, "el 409 reporta la job en curso");
    assert.match(second.body.error, /en curso/);

    gate.resolve();
    await waitForSyncToFinish();
  });

  it("marca la sincronización como fallida si la Web API de Steam responde con error", async () => {
    const db = useFreshDatabase();
    const steam = createFakeSteam({ failOwnedGames: true });
    setSyncDependencies({
      db,
      steam,
      hltb: createFakeHltb(),
      proton: createFakeProton(),
      cheapshark: createFakeCheapShark(),
    });

    const started = await callRoute(POST, { method: "POST", body: "{}" });
    assert.equal(started.status, 202);

    const progress = await waitForSyncToFinish();

    assert.equal(progress.status, "failed");
    assert.equal(progress.phase, "failed");
    assert.match(progress.error ?? "", /Steam Web API no disponible/);
    assert.equal(db.select().from(games).all().length, 0);
  });

  it("DELETE cancela la sincronización en curso", async () => {
    const db = useFreshDatabase();
    const gate = deferred();
    const steam = createFakeSteam({ onGetOwnedGames: () => gate.promise });
    setSyncDependencies({
      db,
      steam,
      hltb: createFakeHltb(),
      proton: createFakeProton(),
      cheapshark: createFakeCheapShark(),
    });

    const started = await callRoute(POST, { method: "POST", body: "{}" });
    assert.equal(started.status, 202);

    const cancelled = await callRoute(DELETE);
    assert.equal(cancelled.status, 202);
    assert.equal(cancelled.body.cancelled, true);

    gate.resolve();
    const progress = await waitForSyncToFinish();

    assert.equal(progress.status, "cancelled");
    assert.equal(progress.phase, "cancelled");

    const secondDelete = await callRoute(DELETE);
    assert.equal(secondDelete.status, 409);
  });

  it("clasifica como cancelada una petición en vuelo que termina con error de aborto", async () => {
    const db = useFreshDatabase();
    const steam = createFakeSteam({
      onGetOwnedGames: async (_steamId, signal) => {
        await new Promise<void>((_resolve, reject) => {
          signal?.addEventListener("abort", () => {
            const error = new Error("The operation was aborted");
            error.name = "AbortError";
            reject(error);
          });
        });
      },
    });
    setSyncDependencies({
      db,
      steam,
      hltb: createFakeHltb(),
      proton: createFakeProton(),
      cheapshark: createFakeCheapShark(),
    });

    const started = await callRoute(POST, { method: "POST", body: "{}" });
    assert.equal(started.status, 202);

    await new Promise((resolve) => setTimeout(resolve, 30));
    const cancelled = await callRoute(DELETE);
    assert.equal(cancelled.status, 202);

    const progress = await waitForSyncToFinish();
    assert.equal(progress.status, "cancelled");
    assert.equal(progress.phase, "cancelled");
    assert.equal(progress.error, null);
  });

  it("GET devuelve el progreso persistido aunque no haya job activa", async () => {
    const db = useFreshDatabase();
    setSyncDependencies({
      db,
      steam: createFakeSteam(),
      hltb: createFakeHltb(),
      proton: createFakeProton(),
      cheapshark: createFakeCheapShark(),
    });

    const empty = await callRoute(GET);
    assert.equal(empty.status, 200);
    assert.equal(empty.body.running, false);
    assert.equal(empty.body.progress, null);

    await callRoute(POST, { method: "POST", body: "{}" });
    await waitForSyncToFinish();

    const stored = await callRoute(GET);
    assert.equal(stored.body.running, false);
    assert.equal(stored.body.progress.status, "completed");
    assert.equal(stored.body.progress.stats.games, 4);
  });

  it("rechaza un cuerpo JSON inválido", async () => {
    const db = useFreshDatabase();
    setSyncDependencies({
      db,
      steam: createFakeSteam(),
      hltb: createFakeHltb(),
      proton: createFakeProton(),
      cheapshark: createFakeCheapShark(),
    });

    const response = await callRoute(POST, { method: "POST", body: "no-json" });
    assert.equal(response.status, 400);
    assert.match(response.body.error, /JSON inválido/);
  });
});