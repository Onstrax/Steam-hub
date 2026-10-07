import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildSearchBody,
  createHltbClient,
  mapSearchEntries,
  pickBestEntry,
  safeGameNameForHltb,
  titleSimilarity,
} from "@/lib/hltb";

const portalPayload = {
  count: 1,
  data: [
    {
      game_id: 7230,
      game_name: "Portal",
      game_type: "game",
      comp_main: 11228,
      comp_plus: 18942,
      comp_100: 37897,
    },
  ],
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

interface RecordedCall {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: unknown;
}

function createFetchStub(
  handler: (call: RecordedCall, index: number) => Response | Promise<Response>,
): { fetchImpl: typeof fetch; calls: RecordedCall[] } {
  const calls: RecordedCall[] = [];

  const fetchImpl = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const call: RecordedCall = {
      url: String(input),
      method: init.method ?? "GET",
      headers: (init.headers ?? {}) as Record<string, string>,
      body: typeof init.body === "string" ? JSON.parse(init.body) : init.body,
    };
    calls.push(call);
    return handler(call, calls.length - 1);
  }) as typeof fetch;

  return { fetchImpl, calls };
}

describe("createHltbClient", () => {
  it("obtiene el token de init y envía x-auth-token en la búsqueda", async () => {
    const { fetchImpl, calls } = createFetchStub((call) => {
      if (call.url.includes("/api/search/site/init")) return jsonResponse({ token: "token-1" });
      return jsonResponse(portalPayload);
    });

    const hltb = createHltbClient({ fetchImpl, minIntervalMs: 0, sleep: async () => {} });
    const durations = await hltb.getDurations("Portal");

    assert.equal(calls.length, 2);
    assert.match(calls[0].url, /\/api\/search\/site\/init\?t=\d+/);
    assert.equal(calls[1].url, "https://howlongtobeat.com/api/search/site");
    assert.equal(calls[1].method, "POST");
    assert.equal(calls[1].headers["x-auth-token"], "token-1");
    assert.equal(hltb.getRequestCount(), 1);

    assert.ok(durations);
    assert.equal(durations.hltbId, "7230");
    assert.equal(durations.matchedName, "Portal");
    assert.equal(durations.similarity, 1);
    assert.equal(durations.mainStory, 3.1);
    assert.equal(durations.mainExtra, 5.3);
    assert.equal(durations.completionist, 10.5);
  });

  it("renueva el token cuando la búsqueda responde 403", async () => {
    const { fetchImpl, calls } = createFetchStub((call, index) => {
      if (call.url.includes("/init")) {
        return jsonResponse({ token: `token-${index}` });
      }
      const token = call.headers["x-auth-token"];
      return token === "token-0" ? new Response("forbidden", { status: 403 }) : jsonResponse(portalPayload);
    });

    const hltb = createHltbClient({ fetchImpl, minIntervalMs: 0, sleep: async () => {} });
    const durations = await hltb.getDurations("Portal");

    assert.ok(durations);
    const initCalls = calls.filter((call) => call.url.includes("/init"));
    assert.equal(initCalls.length, 2);
    assert.equal(calls[calls.length - 1].headers["x-auth-token"], "token-2");
  });

  it("devuelve null si ningún resultado supera la similitud mínima", async () => {
    const { fetchImpl } = createFetchStub((call) => {
      if (call.url.includes("/init")) return jsonResponse({ token: "t" });
      return jsonResponse({
        count: 1,
        data: [
          {
            game_id: 99,
            game_name: "Tetris Effect",
            comp_main: 3600,
            comp_plus: 7200,
            comp_100: 10800,
          },
        ],
      });
    });

    const hltb = createHltbClient({ fetchImpl, minIntervalMs: 0, sleep: async () => {} });
    assert.equal(await hltb.getDurations("Portal"), null);
  });

  it("reintenta ante errores del servidor y devuelve null al agotar reintentos", async () => {
    const { fetchImpl, calls } = createFetchStub((call) => {
      if (call.url.includes("/init")) return jsonResponse({ token: "t" });
      return new Response("error", { status: 500 });
    });

    const hltb = createHltbClient({
      fetchImpl,
      minIntervalMs: 0,
      maxRetries: 2,
      sleep: async () => {},
    });

    assert.equal(await hltb.getDurations("Portal"), null);
    assert.equal(hltb.getRequestCount(), 3);
    assert.equal(
      calls.filter((call) => call.url.includes("/init")).length,
      1,
      "el token se cachea entre reintentos",
    );
  });

  it("no consulta nada si el nombre está vacío o la señal está abortada", async () => {
    const { fetchImpl, calls } = createFetchStub(() => jsonResponse({ token: "t" }));

    const hltb = createHltbClient({ fetchImpl, minIntervalMs: 0, sleep: async () => {} });
    assert.equal(await hltb.getDurations("   "), null);

    const controller = new AbortController();
    controller.abort();
    assert.equal(await hltb.getDurations("Portal", controller.signal), null);
    assert.equal(calls.length, 0);
    assert.equal(hltb.getRequestCount(), 0);
  });
});

describe("buildSearchBody", () => {
  it("arma la consulta con los términos del título", () => {
    const body = buildSearchBody("Half Life 2") as { searchTerms: string[]; searchType: string };
    assert.deepEqual(body.searchTerms, ["Half", "Life", "2"]);
    assert.equal(body.searchType, "games");
  });
});

describe("mapSearchEntries", () => {
  it("convierte los tiempos de segundos a horas", () => {
    const entries = mapSearchEntries(
      { data: [{ game_id: 1, game_name: "Portal", comp_main: 7200, comp_plus: 10800, comp_100: 18000 }] },
      "Portal",
    );

    assert.equal(entries.length, 1);
    assert.equal(entries[0].gameplayMain, 2);
    assert.equal(entries[0].gameplayMainExtra, 3);
    assert.equal(entries[0].gameplayCompletionist, 5);
    assert.equal(entries[0].similarity, 1);
  });
});

describe("pickBestEntry", () => {
  const entries = [
    {
      id: "1",
      name: "Portal",
      gameplayMain: 3,
      gameplayMainExtra: 5,
      gameplayCompletionist: 10,
    },
    {
      id: "2",
      name: "Portal Stories: Mel",
      gameplayMain: 4,
      gameplayMainExtra: 5,
      gameplayCompletionist: 8,
    },
  ].map((entry) => ({ ...entry, similarity: titleSimilarity(entry.name, "Portal") }));

  it("elige el resultado más similar y descarta los que no llegan al umbral", () => {
    const best = pickBestEntry(entries, "Portal", 0.75);
    assert.equal(best?.hltbId, "1");

    const unrelated = entries.map((entry) => ({ ...entry, similarity: titleSimilarity(entry.name, "Dark Souls") }));
    assert.equal(pickBestEntry(unrelated, "Dark Souls", 0.75), null);
    assert.equal(pickBestEntry([], "Portal", 0.75), null);
  });

  it("descarta resultados sin duración de historia principal", () => {
    const withoutTime = [{ ...entries[0], id: "3", gameplayMain: 0, similarity: 1 }];
    assert.equal(pickBestEntry(withoutTime, "Portal", 0.75), null);
  });
});

describe("titleSimilarity", () => {
  it("puntúa igualdad, prefijos y tokens compartidos", () => {
    assert.equal(titleSimilarity("Portal", "Portal"), 1);
    assert.equal(titleSimilarity("Portal", "port"), 0.95);
    assert.equal(titleSimilarity("The Portal Chronicles", "portal"), 0.9);
    assert.equal(titleSimilarity("Portal", "Tetris"), 0);
    assert.equal(titleSimilarity("", "Portal"), 0);
  });
});

describe("safeGameNameForHltb", () => {
  it("limpia sufijos y paréntesis del título", () => {
    assert.equal(safeGameNameForHltb("Portal (Steam Deck)"), "Portal");
    assert.equal(safeGameNameForHltb("Portal - DX11"), "Portal");
    assert.equal(safeGameNameForHltb("Hades"), "Hades");
  });
});
