import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  createProtonDbClient,
  normalizeProtonDbSummary,
  normalizeProtonTier,
} from "@/lib/proton";

describe("normalizeProtonTier", () => {
  it("mapea los tiers de la API de ProtonDB a mayúsculas", () => {
    assert.equal(normalizeProtonTier("native"), "NATIVE");
    assert.equal(normalizeProtonTier("Platinum"), "PLATINUM");
    assert.equal(normalizeProtonTier("GOLD"), "GOLD");
    assert.equal(normalizeProtonTier("silver"), "SILVER");
    assert.equal(normalizeProtonTier("bronze"), "BRONZE");
    assert.equal(normalizeProtonTier("borked"), "BORKED");
    assert.equal(normalizeProtonTier("unknown"), "UNKNOWN");
    assert.equal(normalizeProtonTier(undefined), "UNKNOWN");
  });
});

describe("normalizeProtonDbSummary", () => {
  it("extrae tier, confianza y totales del reporte", () => {
    const summary = normalizeProtonDbSummary(620, {
      bestReportedTier: "platinum",
      confidence: "strong",
      score: 0.88,
      tier: "platinum",
      total: 343,
      trendingTier: "platinum",
    });

    assert.deepEqual(summary, {
      appid: 620,
      tier: "PLATINUM",
      bestReportedTier: "PLATINUM",
      trendingTier: "PLATINUM",
      confidence: "strong",
      score: 0.88,
      total: 343,
    });
  });

  it("devuelve null sin cuerpo válido", () => {
    assert.equal(normalizeProtonDbSummary(400, null), null);
    assert.equal(normalizeProtonDbSummary(400, "nope"), null);
  });
});

describe("createProtonDbClient", () => {
  it("consulta el endpoint de summaries y normaliza el tier", async () => {
    const urls: string[] = [];
    const client = createProtonDbClient({
      minIntervalMs: 0,
      sleep: async () => undefined,
      http: {
        get: async (url: string) => {
          urls.push(url);
          return {
            data: { tier: "gold", confidence: "good", total: 42 },
          };
        },
      } as never,
    });

    const summary = await client.getSummary(1145360);

    assert.equal(urls[0], "https://www.protondb.com/api/v1/reports/summaries/1145360.json");
    assert.equal(summary?.tier, "GOLD");
    assert.equal(summary?.total, 42);
    assert.equal(client.getRequestCount(), 1);
  });

  it("devuelve null en 404 (sin reporte) y propaga errores de red", async () => {
    const notFound = createProtonDbClient({
      minIntervalMs: 0,
      sleep: async () => undefined,
      http: {
        get: async () => {
          const error = new Error("Not Found") as Error & { response?: { status: number } };
          error.response = { status: 404 };
          throw error;
        },
      } as never,
    });
    assert.equal(await notFound.getSummary(999999), null);

    const failing = createProtonDbClient({
      minIntervalMs: 0,
      maxRetries: 0,
      sleep: async () => undefined,
      http: {
        get: async () => {
          throw new Error("ECONNRESET");
        },
      } as never,
    });
    await assert.rejects(() => failing.getSummary(400), /ProtonDB request failed/);
  });
});
