import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  createCheapSharkClient,
  normalizePriceString,
  normalizeSavingsPercent,
  normalizeUnixDate,
  parseCheapSharkGameDetails,
  parseCheapSharkSearchResult,
} from "@/lib/cheapshark";

describe("helpers CheapShark", () => {
  it("normaliza precios, ahorros y fechas", () => {
    assert.equal(normalizePriceString("1.99"), "1.99");
    assert.equal(normalizePriceString(2.49), "2.49");
    assert.equal(normalizePriceString(""), null);
    assert.equal(normalizeSavingsPercent("50.03"), 50);
    assert.equal(normalizeSavingsPercent(-1), null);
    assert.equal(normalizeUnixDate(1418927336), "2014-12-18");
    assert.equal(normalizeUnixDate("nope"), null);
  });
});

describe("parseCheapSharkSearchResult", () => {
  it("lee gameID y cheapest del listado por steamAppID", () => {
    const search = parseCheapSharkSearchResult(620, [
      {
        gameID: "36",
        steamAppID: "620",
        cheapest: "1.99",
        external: "Portal 2",
      },
    ]);
    assert.deepEqual(search, { gameId: "36", currentCheapest: "1.99" });
  });

  it("devuelve null sin resultados", () => {
    assert.equal(parseCheapSharkSearchResult(400, []), null);
    assert.equal(parseCheapSharkSearchResult(400, null), null);
  });
});

describe("parseCheapSharkGameDetails", () => {
  it("extrae el mínimo histórico y el mayor descuento de deals", () => {
    const history = parseCheapSharkGameDetails(620, { gameId: "36", currentCheapest: "1.99" }, {
      cheapestPriceEver: { price: "1.99", date: 1600000000 },
      deals: [
        { price: "6.99", retailPrice: "9.99", savings: "30.03" },
        { price: "1.99", retailPrice: "9.99", savings: "80.08" },
      ],
    });

    assert.equal(history.lowestPrice, "1.99");
    assert.equal(history.lowestDiscountPercent, 80);
    assert.equal(history.lowestPriceDate, "2020-09-13");
    assert.equal(history.currentCheapest, "1.99");
  });
});

describe("createCheapSharkClient", () => {
  it("busca por steamAppID y luego por gameID", async () => {
    const urls: string[] = [];
    const client = createCheapSharkClient({
      minIntervalMs: 0,
      sleep: async () => undefined,
      http: {
        get: async (url: string) => {
          urls.push(url);
          if (url.includes("steamAppID=620")) {
            return { data: [{ gameID: "36", cheapest: "1.99" }] };
          }
          return {
            data: {
              cheapestPriceEver: { price: "1.99", date: 1600000000 },
              deals: [{ savings: "80.08" }],
            },
          };
        },
      } as never,
    });

    const history = await client.getPriceHistory(620);

    assert.deepEqual(urls, [
      "https://www.cheapshark.com/api/1.0/games?steamAppID=620",
      "https://www.cheapshark.com/api/1.0/games?id=36",
    ]);
    assert.equal(history?.lowestPrice, "1.99");
    assert.equal(history?.lowestDiscountPercent, 80);
    assert.equal(client.getRequestCount(), 2);
  });

  it("devuelve null si el juego no está en CheapShark", async () => {
    const client = createCheapSharkClient({
      minIntervalMs: 0,
      sleep: async () => undefined,
      http: {
        get: async () => ({ data: [] }),
      } as never,
    });
    assert.equal(await client.getPriceHistory(480), null);
  });
});
