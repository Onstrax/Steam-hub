import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";

import type { SteamHubDatabase } from "@/lib/db";

process.env.DATABASE_PATH = createTempDbPath();
process.env.STEAM_API_KEY ??= "TEST_API_KEY_0000000000";
process.env.STEAM_ID ??= "76561190000000000";

let db: SteamHubDatabase;
let createDatabase: typeof import("@/lib/db").createDatabase;
let runMigrations: typeof import("@/lib/db/migrate").runMigrations;
let schema: typeof import("@/lib/db/schema");
let setSyncDependencies: typeof import("@/lib/sync-deps").setSyncDependencies;
let PATCH: typeof import("@/app/api/games/[appid]/route").PATCH;
let GET_GAMES: typeof import("@/app/api/games/route").GET;

function createTempDbPath(): string {
  const dir = mkdtempSync(path.join(tmpdir(), "steam-hub-patch-"));
  return path.join(dir, "steam_hub_test.db");
}

function patchRequest(appid: number | string, body: unknown): Request {
  return new Request(`http://localhost/api/games/${appid}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

before(async () => {
  ({ createDatabase } = await import("@/lib/db"));
  ({ runMigrations } = await import("@/lib/db/migrate"));
  schema = await import("@/lib/db/schema");
  ({ setSyncDependencies } = await import("@/lib/sync-deps"));
  ({ PATCH } = await import("@/app/api/games/[appid]/route"));
  ({ GET: GET_GAMES } = await import("@/app/api/games/route"));

  db = createDatabase(process.env.DATABASE_PATH);
  runMigrations(db);

  await db
    .insert(schema.games)
    .values([
      { appid: 400, name: "Portal", playtimeForever: 145, userStatus: "Backlog", reviewScore: 99 },
      { appid: 620, name: "Portal 2", playtimeForever: 500, userStatus: "Playing", reviewScore: 99 },
      { appid: 1145360, name: "Hades", playtimeForever: 300, userStatus: "Backlog", reviewScore: 98 },
    ])
    .run();

  setSyncDependencies({ db });
});

after(() => {
  setSyncDependencies(null);
});

describe("PATCH /api/games/[appid]", () => {
  it("actualiza el estado del juego en la base de datos", async () => {
    const response = await PATCH(patchRequest(400, { userStatus: "Completed" }), {
      params: { appid: "400" },
    });
    const body = (await response.json()) as { appid: number; userStatus: string };

    assert.equal(response.status, 200);
    assert.deepEqual(body, { appid: 400, userStatus: "Completed" });

    const row = db.select().from(schema.games).all().find((game) => game.appid === 400);
    assert.equal(row?.userStatus, "Completed");
  });

  it("el filtro userStatus del GET refleja el cambio", async () => {
    await PATCH(patchRequest(1145360, { userStatus: "Abandoned" }), {
      params: { appid: "1145360" },
    });

    const response = await GET_GAMES(new Request("http://localhost/api/games?userStatus=Abandoned"));
    const body = (await response.json()) as { count: number; games: Array<{ appid: number }> };

    assert.equal(response.status, 200);
    assert.deepEqual(
      body.games.map((game) => game.appid),
      [1145360],
    );
  });

  it("rechaza estados, identificadores y cuerpos inválidos", async () => {
    const invalidStatus = await PATCH(patchRequest(400, { userStatus: "Volando" }), {
      params: { appid: "400" },
    });
    const statusBody = (await invalidStatus.json()) as { error: string; param: string };
    assert.equal(invalidStatus.status, 400);
    assert.equal(statusBody.param, "userStatus");

    const invalidAppid = await PATCH(patchRequest("abc", { userStatus: "Playing" }), {
      params: { appid: "abc" },
    });
    assert.equal(invalidAppid.status, 400);

    const invalidJson = await PATCH(patchRequest(400, "{no-json"), { params: { appid: "400" } });
    assert.equal(invalidJson.status, 400);

    const notFound = await PATCH(patchRequest(999999, { userStatus: "Playing" }), {
      params: { appid: "999999" },
    });
    assert.equal(notFound.status, 404);
  });
});
