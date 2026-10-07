import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";

process.env.DATABASE_PATH = (() => {
  const dir = mkdtempSync(path.join(tmpdir(), "steam-hub-friends-"));
  return path.join(dir, "steam_hub_test.db");
})();
process.env.STEAM_API_KEY ??= "TEST_API_KEY_0000000000";
process.env.STEAM_ID ??= "76561190000000000";

let createDatabase: typeof import("@/lib/db").createDatabase;
let runMigrations: typeof import("@/lib/db/migrate").runMigrations;
let schema: typeof import("@/lib/db/schema");
let setSyncDependencies: typeof import("@/lib/sync-deps").setSyncDependencies;
let GET_FRIENDS: typeof import("@/app/api/friends/route").GET;
let GET_GENRES: typeof import("@/app/api/genres/route").GET;

before(async () => {
  ({ createDatabase } = await import("@/lib/db"));
  ({ runMigrations } = await import("@/lib/db/migrate"));
  schema = await import("@/lib/db/schema");
  ({ setSyncDependencies } = await import("@/lib/sync-deps"));
  ({ GET: GET_FRIENDS } = await import("@/app/api/friends/route"));
  ({ GET: GET_GENRES } = await import("@/app/api/genres/route"));

  const db = createDatabase(process.env.DATABASE_PATH);
  runMigrations(db);

  await db.insert(schema.friends).values([
    { steamid: "76561190000000002", personaname: "beta", avatarfull: "https://a.example/2.jpg" },
    { steamid: "76561190000000001", personaname: "Alfa", avatarfull: null },
  ]).run();

  await db.insert(schema.games).values([
    { appid: 400, name: "Portal" },
    { appid: 620, name: "Portal 2" },
    { appid: 548430, name: "Deep Rock Galactic" },
  ]).run();

  await db.insert(schema.friendGames).values([
    { steamid: "76561190000000001", appid: 400 },
    { steamid: "76561190000000001", appid: 620 },
    { steamid: "76561190000000002", appid: 620 },
  ]).run();

  await db.insert(schema.categories).values([
    { appid: 400, name: "Action" },
    { appid: 620, name: "Action" },
    { appid: 620, name: "Co-op" },
    { appid: 548430, name: "Simulation" },
    { appid: 548430, name: null },
  ]).run();

  setSyncDependencies({ db });
});

after(() => {
  setSyncDependencies(null);
});

describe("GET /api/friends", () => {
  it("devuelve los amigos ordenados por nombre con su conteo de juegos", async () => {
    const response = await GET_FRIENDS();
    const body = (await response.json()) as {
      count: number;
      friends: Array<{ steamid: string; personaname: string; gameCount: number }>;
    };

    assert.equal(response.status, 200);
    assert.equal(body.count, 2);
    assert.deepEqual(
      body.friends.map((friend) => friend.personaname),
      ["Alfa", "beta"],
    );
    assert.equal(body.friends[0].gameCount, 2);
    assert.equal(body.friends[1].gameCount, 1);
  });
});

describe("GET /api/genres", () => {
  it("devuelve categorías y géneros únicos sin nulos", async () => {
    const response = await GET_GENRES();
    const body = (await response.json()) as { count: number; genres: string[] };

    assert.equal(response.status, 200);
    assert.deepEqual(body.genres, ["Action", "Co-op", "Simulation"]);
    assert.equal(body.count, 3);
  });
});
