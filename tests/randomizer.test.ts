import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { nextCyclingIndex, pickRandomGame } from "@/lib/randomizer";

describe("pickRandomGame", () => {
  const games = ["Portal", "Portal 2", "Hades"];

  it("devuelve null con lista vacía", () => {
    assert.equal(pickRandomGame([]), null);
  });

  it("elige un elemento de la lista con el generador indicado", () => {
    assert.equal(pickRandomGame(games, () => 0), "Portal");
    assert.equal(pickRandomGame(games, () => 0.34), "Portal 2");
    assert.equal(pickRandomGame(games, () => 0.99), "Hades");
  });

  it("nunca se sale de los límites aunque el aleatorio sea 1", () => {
    assert.equal(pickRandomGame(games, () => 1), "Hades");
  });
});

describe("nextCyclingIndex", () => {
  it("siempre avanza a un índice distinto", () => {
    for (let current = 0; current < 5; current += 1) {
      const next = nextCyclingIndex(current, 5, () => 0);
      assert.notEqual(next, current);
    }
  });

  it("con un solo elemento devuelve 0", () => {
    assert.equal(nextCyclingIndex(0, 1, () => 0.5), 0);
    assert.equal(nextCyclingIndex(3, 0, () => 0.5), 0);
  });
});
