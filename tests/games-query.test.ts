import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";

import type { SteamHubDatabase } from "@/lib/db";
import type { GamesQuery } from "@/lib/games-query";

const tempDirs: string[] = [];

process.env.DATABASE_PATH = createTempDbPath();
process.env.STEAM_API_KEY ??= "TEST_API_KEY_0000000000";
process.env.STEAM_ID ??= "76561190000000000";

let db: SteamHubDatabase;
let createDatabase: typeof import("@/lib/db").createDatabase;
let runMigrations: typeof import("@/lib/db/migrate").runMigrations;
let schema: typeof import("@/lib/db/schema");
let setSyncDependencies: typeof import("@/lib/sync-deps").setSyncDependencies;
let parseGamesQuery: typeof import("@/lib/games-query").parseGamesQuery;
let queryGames: typeof import("@/lib/games-query").queryGames;
let GamesQueryError: typeof import("@/lib/games-query").GamesQueryError;
let GET: typeof import("@/app/api/games/route").GET;

const FRIEND_VISIBLE = "76561190000000001";
const FRIEND_COOP = "76561190000000002";
const FRIEND_PRIVATE = "76561190000000003";

function createTempDbPath(): string {
  const dir = mkdtempSync(path.join(tmpdir(), "steam-hub-games-"));
  tempDirs.push(dir);
  return path.join(dir, "steam_hub_test.db");
}

function search(params: string): URLSearchParams {
  return new URLSearchParams(params);
}

function appids(list: Array<{ appid: number }>): number[] {
  return list.map((game) => game.appid);
}

before(async () => {
  ({ createDatabase } = await import("@/lib/db"));
  ({ runMigrations } = await import("@/lib/db/migrate"));
  schema = await import("@/lib/db/schema");
  ({ setSyncDependencies } = await import("@/lib/sync-deps"));
  ({ parseGamesQuery, queryGames, GamesQueryError } = await import("@/lib/games-query"));
  ({ GET } = await import("@/app/api/games/route"));

  db = createDatabase(process.env.DATABASE_PATH);
  runMigrations(db);

  await db
    .insert(schema.games)
    .values([
      {
        appid: 400,
        name: "Portal",
        playtimeForever: 145,
        userStatus: "Completed",
        controllerSupport: "full",
        minPlayers: 1,
        maxPlayers: 1,
        isLocalCoop: false,
        isSplitScreen: false,
        isMultiplayer: false,
        protonDbTier: "NATIVE",
        reviewScore: 99,
        hltbMainStory: 3.1,
        hltbMainExtra: 5.3,
        hltbCompletionist: 10.5,
        headerImage: "https://cdn.example/400.jpg",
      },
      {
        appid: 620,
        name: "Portal 2",
        playtimeForever: 500,
        userStatus: "Playing",
        controllerSupport: "partial",
        minPlayers: 1,
        maxPlayers: 4,
        isLocalCoop: true,
        isSplitScreen: true,
        isMultiplayer: true,
        protonDbTier: "PLATINUM",
        reviewScore: 99,
        hltbMainStory: 8.6,
        hltbMainExtra: 13.8,
        hltbCompletionist: 22.9,
      },
      {
        appid: 548430,
        name: "Deep Rock Galactic",
        playtimeForever: 2400,
        userStatus: "Playing",
        controllerSupport: "partial",
        minPlayers: 1,
        maxPlayers: 4,
        isLocalCoop: true,
        isSplitScreen: false,
        isMultiplayer: true,
        protonDbTier: "GOLD",
        reviewScore: 97,
        hltbMainStory: 43.1,
      },
      {
        appid: 1145360,
        name: "Hades",
        playtimeForever: 300,
        userStatus: "Backlog",
        controllerSupport: "none",
        minPlayers: 1,
        maxPlayers: 1,
        isLocalCoop: false,
        isSplitScreen: false,
        isMultiplayer: false,
        protonDbTier: "UNKNOWN",
        reviewScore: 98,
        hltbMainStory: 0,
      },
      {
        appid: 208650,
        name: "Hitman: Sniper Challenge",
        playtimeForever: 0,
        userStatus: "Backlog",
        minPlayers: 1,
        maxPlayers: 1,
        isLocalCoop: false,
        isSplitScreen: false,
        isMultiplayer: false,
        protonDbTier: "UNKNOWN",
        reviewScore: 0,
        hltbMainStory: 0,
      },
    ])
    .run();

  await db
    .insert(schema.categories)
    .values([
      { appid: 400, name: "Action" },
      { appid: 400, name: "Single-player" },
      { appid: 620, name: "Action" },
      { appid: 620, name: "Co-op" },
      { appid: 620, name: "Shared/Split Screen Co-op" },
      { appid: 548430, name: "Action" },
      { appid: 548430, name: "Co-op" },
      { appid: 548430, name: "Simulation" },
      { appid: 1145360, name: "Action" },
      { appid: 1145360, name: "Roguelike" },
    ])
    .run();

  await db
    .insert(schema.friends)
    .values([
      {
        steamid: FRIEND_VISIBLE,
        personaname: "Amigo Visible",
        avatarfull: "https://avatars.example/1.jpg",
      },
      {
        steamid: FRIEND_COOP,
        personaname: "Amigo Cooperativo",
        avatarfull: "https://avatars.example/2.jpg",
      },
      {
        steamid: FRIEND_PRIVATE,
        personaname: "Amigo Privado",
        avatarfull: "https://avatars.example/3.jpg",
      },
    ])
    .run();

  await db
    .insert(schema.friendGames)
    .values([
      { steamid: FRIEND_VISIBLE, appid: 400 },
      { steamid: FRIEND_VISIBLE, appid: 620 },
      { steamid: FRIEND_COOP, appid: 620 },
      { steamid: FRIEND_COOP, appid: 548430 },
      { steamid: FRIEND_PRIVATE, appid: 1145360 },
    ])
    .run();

  setSyncDependencies({ db });
});

after(() => {
  setSyncDependencies(null);
});

describe("parseGamesQuery", () => {
  it("aplica valores por defecto y parsea los filtros", () => {
    const query = parseGamesQuery(
      search(
        "search=Portal&minPlaytime=100&maxPlaytime=600&maxHltb=10&isLocalCoop=true&isSplitScreen=1&controllerSupport=full,partial&minPlayers=1&maxPlayers=8&friendIds=1,2&genres=Action,Co-op&protonDbTier=native&userStatus=playing&minReview=90&sortBy=playtime&sortOrder=desc",
      ),
    );

    assert.deepEqual(query, {
      search: "Portal",
      minPlaytime: 100,
      maxPlaytime: 600,
      minHltb: undefined,
      maxHltb: 10,
      isLocalCoop: true,
      isSplitScreen: true,
      controllerSupport: ["full", "partial"],
      minPlayers: 1,
      maxPlayers: 8,
      friendIds: ["1", "2"],
      genres: ["Action", "Co-op"],
      protonDbTier: ["NATIVE"],
      userStatus: "Playing",
      minReview: 90,
      sortBy: "playtime",
      sortOrder: "desc",
    } satisfies GamesQuery);
  });

  it("acepta estados computados de la biblioteca en userStatus", () => {
    assert.equal(parseGamesQuery(search("userStatus=notPlayed")).userStatus, "notPlayed");
    assert.equal(parseGamesQuery(search("userStatus=tested")).userStatus, "tested");
    assert.equal(parseGamesQuery(search("userStatus=ABANDONED")).userStatus, "Abandoned");
  });

  it("usa orden por nombre ascendente cuando no se indican sortBy ni sortOrder", () => {
    const query = parseGamesQuery(search("search=%20"));
    assert.equal(query.sortBy, "name");
    assert.equal(query.sortOrder, "asc");
    assert.equal(query.search, undefined);
    assert.equal(query.userStatus, undefined);
    assert.equal(query.minReview, undefined);
  });

  it("rechaza parámetros inválidos", () => {
    const invalid: Array<[string, string]> = [
      ["sortBy=nombre", "sortBy"],
      ["sortOrder=down", "sortOrder"],
      ["controllerSupport=total", "controllerSupport"],
      ["protonDbTier=VERIFIED|PLAYABLE", "protonDbTier"],
      ["userStatus=Volando", "userStatus"],
      ["minReview=90%", "minReview"],
      ["minReview=-5", "minReview"],
      ["isLocalCoop=quizas", "isLocalCoop"],
      ["minPlaytime=mucho", "minPlaytime"],
      ["minPlaytime=-5", "minPlaytime"],
      ["minPlayers=1.5", "minPlayers"],
      ["maxHltb=20%", "maxHltb"],
    ];

    for (const [params, param] of invalid) {
      assert.throws(
        () => parseGamesQuery(search(params)),
        (error: unknown) => {
          assert.ok(error instanceof GamesQueryError);
          assert.equal(error.param, param);
          return true;
        },
        params,
      );
    }
  });
});

describe("queryGames", () => {
  it("devuelve la biblioteca completa ordenada por nombre", async () => {
    const list = await queryGames(db, parseGamesQuery(search("")));
    assert.deepEqual(appids(list), [548430, 1145360, 208650, 400, 620]);
  });

  it("busca por nombre sin distinguir mayúsculas y escapa comodines", async () => {
    const matches = await queryGames(db, parseGamesQuery(search("search=portal")));
    assert.deepEqual(appids(matches), [400, 620]);

    const escaped = await queryGames(db, parseGamesQuery(search("search=portal%")));
    assert.deepEqual(appids(escaped), []);
  });

  it("filtra por tiempo jugado", async () => {
    const min = await queryGames(db, parseGamesQuery(search("minPlaytime=200")));
    assert.deepEqual(appids(min), [548430, 1145360, 620]);

    const max = await queryGames(db, parseGamesQuery(search("maxPlaytime=200")));
    assert.deepEqual(appids(max), [208650, 400]);
  });

  it("filtra por duración HLTB e ignora los juegos sin datos", async () => {
    const short = await queryGames(db, parseGamesQuery(search("maxHltb=5")));
    assert.deepEqual(appids(short), [400]);

    const long = await queryGames(db, parseGamesQuery(search("minHltb=20")));
    assert.deepEqual(appids(long), [548430]);

    const range = await queryGames(db, parseGamesQuery(search("minHltb=5&maxHltb=15")));
    assert.deepEqual(appids(range), [620]);
  });

  it("filtra modos de juego, mando y rango de jugadores", async () => {
    const coop = await queryGames(db, parseGamesQuery(search("isLocalCoop=true")));
    assert.deepEqual(appids(coop), [548430, 620]);

    const splitScreen = await queryGames(db, parseGamesQuery(search("isSplitScreen=1")));
    assert.deepEqual(appids(splitScreen), [620]);

    const singlePlayer = await queryGames(db, parseGamesQuery(search("isLocalCoop=false")));
    assert.deepEqual(appids(singlePlayer), [1145360, 208650, 400]);

    const controller = await queryGames(
      db,
      parseGamesQuery(search("controllerSupport=full,partial")),
    );
    assert.deepEqual(appids(controller), [548430, 400, 620]);

    // Intersección de rangos: el juego debe soportar al menos 2 jugadores
    // y admitir rangos que toquen hasta 8 jugadores.
    const players = await queryGames(
      db,
      parseGamesQuery(search("minPlayers=2&maxPlayers=8")),
    );
    assert.deepEqual(appids(players), [548430, 620]);

    const atLeastTwo = await queryGames(db, parseGamesQuery(search("minPlayers=2")));
    assert.deepEqual(appids(atLeastTwo), [548430, 620]);

    const tooManyPlayers = await queryGames(db, parseGamesQuery(search("minPlayers=5")));
    assert.deepEqual(appids(tooManyPlayers), []);

    const soloPlayers = await queryGames(
      db,
      parseGamesQuery(search("minPlayers=1&maxPlayers=1")),
    );
    assert.deepEqual(appids(soloPlayers), [548430, 1145360, 208650, 400, 620]);
  });

  it("filtra por compatibilidad ProtonDB", async () => {
    const native = await queryGames(db, parseGamesQuery(search("protonDbTier=NATIVE")));
    assert.deepEqual(appids(native), [400]);

    const gold = await queryGames(db, parseGamesQuery(search("protonDbTier=GOLD")));
    assert.deepEqual(appids(gold), [548430]);

    const unknown = await queryGames(db, parseGamesQuery(search("protonDbTier=UNKNOWN")));
    assert.deepEqual(appids(unknown), [1145360, 208650]);
  });

  it("filtra por estado de usuario y estados computados", async () => {
    const playing = await queryGames(db, parseGamesQuery(search("userStatus=playing")));
    assert.deepEqual(appids(playing), [548430, 620]);

    const completed = await queryGames(db, parseGamesQuery(search("userStatus=Completed")));
    assert.deepEqual(appids(completed), [400]);

    const backlog = await queryGames(db, parseGamesQuery(search("userStatus=Backlog")));
    assert.deepEqual(appids(backlog), [1145360, 208650]);

    const notPlayed = await queryGames(db, parseGamesQuery(search("userStatus=notPlayed")));
    assert.deepEqual(appids(notPlayed), [208650]);

    const tested = await queryGames(db, parseGamesQuery(search("userStatus=tested")));
    assert.deepEqual(appids(tested), []);
  });

  it("filtra por porcentaje mínimo de reseñas positivas", async () => {
    const high = await queryGames(db, parseGamesQuery(search("minReview=98")));
    assert.deepEqual(appids(high), [1145360, 400, 620]);

    const perfect = await queryGames(db, parseGamesQuery(search("minReview=99")));
    assert.deepEqual(appids(perfect), [400, 620]);

    const none = await queryGames(db, parseGamesQuery(search("minReview=100")));
    assert.deepEqual(appids(none), []);
  });

  it("filtra por géneros con semántica OR", async () => {
    const action = await queryGames(db, parseGamesQuery(search("genres=Action")));
    assert.deepEqual(appids(action), [548430, 1145360, 400, 620]);

    const multi = await queryGames(db, parseGamesQuery(search("genres=Co-op,Simulation")));
    assert.deepEqual(appids(multi), [548430, 620]);

    const unknownGenre = await queryGames(db, parseGamesQuery(search("genres=Survival Horror")));
    assert.deepEqual(appids(unknownGenre), []);
  });

  it("devuelve los amigos que poseen cada juego", async () => {
    const list = await queryGames(db, parseGamesQuery(search("search=Portal 2")));
    assert.equal(list.length, 1);
    assert.deepEqual(
      list[0].friends.map((friend) => friend.steamid).sort(),
      [FRIEND_VISIBLE, FRIEND_COOP],
    );
    assert.deepEqual(
      list[0].friends
        .map((friend) => friend.personaname)
        .sort((a, b) => (a ?? "").localeCompare(b ?? "")),
      ["Amigo Cooperativo", "Amigo Visible"],
    );
    assert.ok(list[0].categories.includes("Shared/Split Screen Co-op"));
  });

  it("filtra por amigos con semántica de intersección (TODOS los elegidos)", async () => {
    const onlyVisible = await queryGames(
      db,
      parseGamesQuery(search(`friendIds=${FRIEND_VISIBLE}`)),
    );
    assert.deepEqual(appids(onlyVisible), [400, 620]);

    const intersection = await queryGames(
      db,
      parseGamesQuery(search(`friendIds=${FRIEND_VISIBLE},${FRIEND_COOP}`)),
    );
    assert.deepEqual(appids(intersection), [620]);
    assert.deepEqual(
      intersection[0].friends.map((friend) => friend.steamid).sort(),
      [FRIEND_VISIBLE, FRIEND_COOP],
    );

    const allThree = await queryGames(
      db,
      parseGamesQuery(search(`friendIds=${FRIEND_VISIBLE},${FRIEND_COOP},${FRIEND_PRIVATE}`)),
    );
    assert.deepEqual(appids(allThree), []);
  });

  it("ordena por las columnas permitidas", async () => {
    const byPlaytime = await queryGames(
      db,
      parseGamesQuery(search("sortBy=playtime&sortOrder=desc")),
    );
    assert.deepEqual(appids(byPlaytime), [548430, 620, 1145360, 400, 208650]);

    const byHltb = await queryGames(db, parseGamesQuery(search("sortBy=hltb&sortOrder=asc")));
    assert.deepEqual(appids(byHltb), [208650, 1145360, 400, 620, 548430]);

    const byReview = await queryGames(db, parseGamesQuery(search("sortBy=review&sortOrder=desc")));
    assert.deepEqual(appids(byReview).slice(0, 2), [400, 620]);
  });

  it("combina varios filtros a la vez", async () => {
    const combined = await queryGames(
      db,
      parseGamesQuery(
        search("search=portal&isLocalCoop=true&minPlaytime=100&protonDbTier=PLATINUM,NATIVE"),
      ),
    );
    assert.deepEqual(appids(combined), [620]);

    const statusAndReview = await queryGames(
      db,
      parseGamesQuery(search("userStatus=Backlog&minReview=98")),
    );
    assert.deepEqual(appids(statusAndReview), [1145360]);
  });
});

describe("GET /api/games", () => {
  it("responde 200 con el listado filtrado", async () => {
    const response = await GET(new Request("http://localhost/api/games?search=portal"));
    const body = (await response.json()) as {
      count: number;
      sortBy: string;
      games: Array<{ appid: number; friends: unknown[] }>;
    };

    assert.equal(response.status, 200);
    assert.equal(body.count, 2);
    assert.equal(body.sortBy, "name");
    assert.deepEqual(
      body.games.map((game) => game.appid),
      [400, 620],
    );
  });

  it("devuelve 400 cuando un parámetro es inválido", async () => {
    const response = await GET(new Request("http://localhost/api/games?sortBy=loquesea"));
    const body = (await response.json()) as { error: string; param: string };

    assert.equal(response.status, 400);
    assert.equal(body.param, "sortBy");
    assert.match(body.error, /sortBy/);

    const badStatus = await GET(new Request("http://localhost/api/games?userStatus=Volando"));
    const statusBody = (await badStatus.json()) as { param: string };
    assert.equal(badStatus.status, 400);
    assert.equal(statusBody.param, "userStatus");
  });
});
