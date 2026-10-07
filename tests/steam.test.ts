import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildHeaderImageUrl,
  classifyCategories,
  computeReviewScore,
  createSteamClient,
  DEFAULT_STEAM_CONFIG,
  extractPlayerRange,
  getSteamConfig,
  isRetryableStatus,
  normalizeAppDetails,
  normalizeFriend,
  normalizeOwnedGame,
  parseDiskSpaceGb,
  parsePriceOverview,
  redactSecrets,
  SteamConfigError,
  type SteamConfig,
} from "@/lib/steam";

const apiKey = "TEST_API_KEY_1234567890";

const steamConfig: SteamConfig = {
  apiKey,
  steamId: "76561190000000000",
  locale: "english",
  country: "us",
  storeDelayMs: 1000,
  requestTimeoutMs: 5000,
  maxRetries: 2,
};

function axiosError(status: number | undefined, message = "boom"): unknown {
  const error = new Error(message) as Error & {
    isAxiosError: boolean;
    response?: { status: number; headers: Record<string, string> };
    config?: unknown;
  };
  error.isAxiosError = true;
  if (status !== undefined) {
    error.response = { status, headers: {} };
  }
  return error;
}

describe("normalizeOwnedGame", () => {
  it("mapea la respuesta real de GetOwnedGames", () => {
    const game = normalizeOwnedGame({
      appid: 400,
      name: "Portal",
      playtime_forever: 145,
      img_icon_url: "cfa928ab4119dd137e50d728e8fe703e4e970aff",
      has_community_visible_stats: true,
    });

    assert.deepEqual(game, {
      appid: 400,
      name: "Portal",
      playtimeForever: 145,
      imgIconUrl: "cfa928ab4119dd137e50d728e8fe703e4e970aff",
      hasCommunityVisibleStats: true,
    });
  });

  it("descarta entradas sin appid o nombre válidos", () => {
    assert.equal(normalizeOwnedGame({ name: "Sin appid" }), null);
    assert.equal(normalizeOwnedGame({ appid: 0, name: "Appid inválido" }), null);
    assert.equal(normalizeOwnedGame({ appid: 10 }), null);
    assert.equal(normalizeOwnedGame(null), null);
  });
});

describe("normalizeFriend", () => {
  it("mapea la respuesta real de GetFriendList", () => {
    const friend = normalizeFriend({
      steamid: "76561190000000001",
      personaname: "Amigo",
      profileurl: "https://steamcommunity.com/id/amigo/",
      avatarfull: "https://avatars.example/full.jpg",
      friend_since: 1500000000,
    });

    assert.equal(friend?.personaname, "Amigo");
    assert.equal(friend?.avatarfull, "https://avatars.example/full.jpg");
    assert.equal(friend?.friendSince, 1500000000);
  });

  it("descarta amigos sin steamid", () => {
    assert.equal(normalizeFriend({ personaname: "Sin id" }), null);
  });
});

describe("normalizeAppDetails", () => {
  it("deriva los metadatos de juego cooperativo local", () => {
    const details = normalizeAppDetails(620, {
      is_free: false,
      required_age: 0,
      short_description: "Juego cooperativo local",
      header_image: "https://cdn.example/header.jpg",
      controller_support: "full",
      categories: [
        { id: 1, description: "Single-player" },
        { id: 9, description: "Co-op" },
        { id: 28, description: "Shared/Split Screen Co-op" },
      ],
      genres: [{ id: 1, description: "Action" }],
      pc_requirements: {
        minimum: "<strong>Storage:</strong> 8 GB available space",
        recommended: "<strong>Storage:</strong> 12 GB available space",
      },
    });

    assert.equal(details.isMultiplayer, true);
    assert.equal(details.isLocalCoop, true);
    assert.equal(details.isSplitScreen, true);
    assert.equal(details.controllerSupport, "full");
    assert.equal(details.diskSpaceGb, 12);
    assert.equal(details.protonDbTier, "UNKNOWN");
    assert.deepEqual(details.genres, ["Action"]);
    assert.equal(details.minPlayers, 1);
    assert.equal(details.maxPlayers, 4, "Co-op sin conteo explícito asume techo 4");
  });

  it("marca como no cooperativo un juego single-player", () => {
    const details = normalizeAppDetails(400, {
      categories: [{ id: 2, description: "Single-player" }],
      genres: [],
    });

    assert.equal(details.isMultiplayer, false);
    assert.equal(details.isLocalCoop, false);
    assert.equal(details.isSplitScreen, false);
    assert.equal(details.controllerSupport, "none");
    assert.equal(details.diskSpaceGb, 0);
    assert.equal(details.headerImage, null);
    assert.deepEqual({ minPlayers: details.minPlayers, maxPlayers: details.maxPlayers }, { minPlayers: 1, maxPlayers: 1 });
  });
});

describe("extractPlayerRange", () => {
  it("lee rangos explícitos en las descripciones de categorías", () => {
    assert.deepEqual(
      extractPlayerRange([{ id: 1, description: "2-8 Players" }]),
      { minPlayers: 2, maxPlayers: 8 },
    );
    assert.deepEqual(
      extractPlayerRange([{ id: 1, description: "4+ Players" }]),
      { minPlayers: 2, maxPlayers: 4 },
    );
  });

  it("asume 1-1 sin categorías multijugador y 2-4 con multiplayer sin conteo", () => {
    assert.deepEqual(
      extractPlayerRange([{ id: 2, description: "Single-player" }]),
      { minPlayers: 1, maxPlayers: 1 },
    );
    assert.deepEqual(
      extractPlayerRange([{ id: 9, description: "Co-op" }]),
      { minPlayers: 2, maxPlayers: 4 },
    );
    assert.deepEqual(
      extractPlayerRange([
        { id: 2, description: "Single-player" },
        { id: 9, description: "Co-op" },
      ]),
      { minPlayers: 1, maxPlayers: 4 },
    );
  });

  it("analiza short_description para contar jugadores", () => {
    assert.deepEqual(
      extractPlayerRange([], "Play with up to 8 players online"),
      { minPlayers: 2, maxPlayers: 8 },
    );
    assert.deepEqual(
      extractPlayerRange([{ id: 2, description: "Single-player" }], "Co-op for 4 players"),
      { minPlayers: 1, maxPlayers: 4 },
    );
    assert.deepEqual(
      extractPlayerRange([], "1-4 players cooperativos"),
      { minPlayers: 1, maxPlayers: 4 },
    );
    assert.deepEqual(
      extractPlayerRange([], "Un juego de un solo jugador"),
      { minPlayers: 1, maxPlayers: 1 },
    );
  });
});

describe("parsePriceOverview", () => {
  it("extrae precios y descuento del price_overview de la Store API", () => {
    const overview = parsePriceOverview({
      currency: "USD",
      initial: "1999",
      final: "999",
      discount_percent: 50,
      is_free: false,
    });
    assert.equal(overview.initialPrice, "1999");
    assert.equal(overview.finalPrice, "999");
    assert.equal(overview.discountPercent, 50);
  });

  it("prefiere initial_formatted y final_formatted cuando existen", () => {
    const overview = parsePriceOverview({
      currency: "USD",
      initial: 1999,
      final: 999,
      initial_formatted: "$19.99",
      final_formatted: "$9.99",
      discount_percent: 50,
      is_free: false,
    });
    assert.equal(overview.initialPrice, "$19.99");
    assert.equal(overview.finalPrice, "$9.99");
    assert.equal(overview.discountPercent, 50);
  });

  it("devuelve valores vacíos cuando no hay price_overview", () => {
    const overview = parsePriceOverview(undefined);
    assert.deepEqual(overview, {
      currency: null,
      initialPrice: null,
      finalPrice: null,
      discountPercent: 0,
      isFree: false,
    });
  });
});

describe("classifyCategories", () => {
  it("distingue cooperativo online de pantalla partida", () => {
    assert.deepEqual(
      classifyCategories([{ id: 9, description: "Multi-player" }, { id: 36, description: "Online Co-op" }]),
      { isMultiplayer: true, isLocalCoop: false, isSplitScreen: false },
    );
  });

  it("normaliza las categorías de Steam", () => {
    assert.deepEqual(
      classifyCategories([{ id: 2, description: "Single-player" }]),
      { isMultiplayer: false, isLocalCoop: false, isSplitScreen: false },
    );
  });
});

describe("parseDiskSpaceGb", () => {
  it("convierte MB, GB y TB al mayor valor recomendado", () => {
    assert.equal(parseDiskSpaceGb({ minimum: "Storage: 500 MB available space" }), 0.5);
    assert.equal(parseDiskSpaceGb({ recommended: "Storage: 1.5 GB available space" }), 1.5);
    assert.equal(parseDiskSpaceGb({ minimum: "Storage: 2 TB available space" }), 2048);
    assert.equal(parseDiskSpaceGb(undefined), 0);
    assert.equal(parseDiskSpaceGb({}), 0);
  });
});

describe("computeReviewScore", () => {
  it("devuelve el porcentaje de reseñas positivas", () => {
    assert.equal(computeReviewScore({ total_positive: 750, total_reviews: 1000 }), 75);
    assert.equal(computeReviewScore({ total_positive: 1, total_reviews: 3 }), 33);
    assert.equal(computeReviewScore({ total_positive: 0, total_reviews: 0 }), null);
    assert.equal(computeReviewScore(undefined), null);
  });
});

describe("buildHeaderImageUrl", () => {
  it("construye la cabecera a partir del icono", () => {
    assert.equal(
      buildHeaderImageUrl(400, "abc123"),
      "https://cdn.cloudflare.steamstatic.com/steamcommunity/public/images/apps/400/abc123.jpg",
    );
    assert.equal(buildHeaderImageUrl(400, null), null);
  });
});

describe("getSteamConfig", () => {
  it("lanza SteamConfigError si faltan variables", () => {
    assert.throws(() => getSteamConfig({}), SteamConfigError);
    assert.throws(() => getSteamConfig({ STEAM_API_KEY: "k" }), SteamConfigError);
    assert.throws(() => getSteamConfig({ STEAM_ID: "1" }), SteamConfigError);
  });

  it("lee las variables con overrides de rate limit", () => {
    const config = getSteamConfig({
      STEAM_API_KEY: apiKey,
      STEAM_ID: "76561190000000000",
      STEAM_STORE_DELAY_MS: "2500",
    });

    assert.equal(config.apiKey, apiKey);
    assert.equal(config.storeDelayMs, 2500);
    assert.equal(config.locale, DEFAULT_STEAM_CONFIG.locale);
    assert.equal(config.country, DEFAULT_STEAM_CONFIG.country);
  });
});

describe("rate limiting de la Store API", () => {
  it("espeta el retardo entre llamadas a appdetails", async () => {
    const requestTimes: number[] = [];
    let fakeNow = 0;

    const client = createSteamClient({
      config: steamConfig,
      http: {
        get: async () => {
          requestTimes.push(fakeNow);
          return { data: { "620": { success: true, data: { categories: [] } } } };
        },
      } as never,
      minIntervalMs: 1000,
      now: () => fakeNow,
      sleep: async (ms: number) => {
        fakeNow += ms;
      },
    });

    await Promise.all([client.getAppDetails(620), client.getAppDetails(620), client.getAppDetails(620)]);

    assert.equal(client.getStoreRequestCount(), 3);
    assert.equal(requestTimes.length, 3);
    assert.ok(
      requestTimes[1] - requestTimes[0] >= 1000,
      `intervalo real: ${requestTimes[1] - requestTimes[0]}`,
    );
    assert.ok(
      requestTimes[2] - requestTimes[1] >= 1000,
      `intervalo real: ${requestTimes[2] - requestTimes[1]}`,
    );
  });

  it("no aplica retardo a las peticiones de la Web API", async () => {
    let calls = 0;
    const client = createSteamClient({
      config: steamConfig,
      http: {
        get: async () => {
          calls += 1;
          return { data: { response: { games: [] } } };
        },
      } as never,
      minIntervalMs: 5000,
      sleep: async () => {
        throw new Error("no debería dormir en la Web API");
      },
    });

    await client.getOwnedGames(steamConfig.steamId);
    await client.getOwnedGames(steamConfig.steamId);

    assert.equal(calls, 2);
    assert.equal(client.getStoreRequestCount(), 0);
  });
});

describe("manejo de errores y rate limits", () => {
  it("reintenta ante 429 y respeta Retry-After", async () => {
    let attempts = 0;
    const waits: number[] = [];
    const retries: number[] = [];

    const client = createSteamClient({
      config: { ...steamConfig, maxRetries: 3 },
      http: {
        get: async () => {
          attempts += 1;
          if (attempts === 1) {
            const error = axiosError(429, "Too Many Requests") as Error & {
              response: { status: number; headers: Record<string, string> };
            };
            error.response.headers["retry-after"] = "5";
            throw error;
          }
          return { data: { "620": { success: true, data: { categories: [] } } } };
        },
      } as never,
      minIntervalMs: 0,
      sleep: async (ms: number) => {
        waits.push(ms);
      },
      onRetry: ({ attempt }) => retries.push(attempt),
    });

    const details = await client.getAppDetails(620);

    assert.equal(attempts, 2);
    assert.deepEqual(waits, [5000]);
    assert.deepEqual(retries, [1]);
    assert.equal(details?.appid, 620);
  });

  it("reintenta errores de red sin respuesta", async () => {
    let attempts = 0;
    const client = createSteamClient({
      config: { ...steamConfig, maxRetries: 2 },
      http: {
        get: async () => {
          attempts += 1;
          if (attempts < 3) throw axiosError(undefined, "ECONNRESET");
          return { data: { friends: [] } };
        },
      } as never,
      sleep: async () => undefined,
    });

    const friends = await client.getFriendList(steamConfig.steamId);

    assert.equal(attempts, 3);
    assert.deepEqual(friends, []);
  });

  it("propaga el error tras agotar los reintentos y oculta la API key", async () => {
    const client = createSteamClient({
      config: { ...steamConfig, maxRetries: 1 },
      http: {
        get: async () => {
          throw axiosError(403, `Forbidden for key=${apiKey}`);
        },
      } as never,
      sleep: async () => undefined,
    });

    await assert.rejects(
      () => client.getOwnedGames(steamConfig.steamId),
      (error: Error) => {
        assert.match(error.message, /status=403/);
        assert.ok(!error.message.includes(apiKey), "la API key no debe aparecer en el error");
        return true;
      },
    );
  });

  it("devuelve null cuando appdetails responde success:false", async () => {
    const client = createSteamClient({
      config: steamConfig,
      http: {
        get: async () => ({ data: { "9999999": { success: false } } }),
      } as never,
      minIntervalMs: 0,
      sleep: async () => undefined,
    });

    assert.equal(await client.getAppDetails(9999999), null);
  });
});

describe("helpers de red", () => {
  it("clasifica estados reintentables", () => {
    assert.equal(isRetryableStatus(429), true);
    assert.equal(isRetryableStatus(500), true);
    assert.equal(isRetryableStatus(503), true);
    assert.equal(isRetryableStatus(403), false);
    assert.equal(isRetryableStatus(404), false);
    assert.equal(isRetryableStatus(undefined), false);
  });

  it("redacta secretos", () => {
    assert.equal(redactSecrets(`key=${apiKey}`, [apiKey]), "key=***");
    assert.equal(redactSecrets("sin secretos", [undefined]), "sin secretos");
  });
});