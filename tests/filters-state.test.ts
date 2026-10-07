import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  DEFAULT_FILTERS,
  clampRange,
  countActiveFilters,
  filtersToSearchParams,
  formatHltbHours,
  formatPlaytimeHours,
  formatReviewScore,
  userStatusLabel,
  type LibraryFilters,
} from "@/lib/filters-state";

function filters(overrides: Partial<LibraryFilters> = {}): LibraryFilters {
  return { ...DEFAULT_FILTERS, ...overrides };
}

describe("filtersToSearchParams", () => {
  it("solo envía los filtros activos y los valores por defecto de orden", () => {
    const params = filtersToSearchParams(DEFAULT_FILTERS);
    assert.equal(params.get("sortBy"), "name");
    assert.equal(params.get("sortOrder"), "asc");
    assert.equal(params.get("search"), null);
    assert.equal(params.get("minPlaytime"), null);
    assert.equal(params.get("isLocalCoop"), null);
    assert.equal(params.get("friendIds"), null);
    assert.equal(params.get("userStatus"), null);
    assert.equal(params.get("minReview"), null);
  });

  it("convierte horas a minutos, listas a CSV y booleanos a true", () => {
    const params = filtersToSearchParams(
      filters({
        search: "Portal",
        playtimeMin: 1.5,
        playtimeMax: 10,
        hltbMin: 5,
        hltbMax: 20,
        isLocalCoop: true,
        isSplitScreen: true,
        controllerSupport: "full",
        playersMin: 2,
        playersMax: 4,
        friendIds: ["111", "222"],
        genres: ["Action", "Indie"],
        protonDbTier: "NATIVE",
        userStatus: "Playing",
        minReview: 90,
        sortBy: "playtime",
        sortOrder: "desc",
      }),
    );

    assert.equal(params.get("search"), "Portal");
    assert.equal(params.get("minPlaytime"), "90");
    assert.equal(params.get("maxPlaytime"), "600");
    assert.equal(params.get("minHltb"), "5");
    assert.equal(params.get("maxHltb"), "20");
    assert.equal(params.get("isLocalCoop"), "true");
    assert.equal(params.get("isSplitScreen"), "true");
    assert.equal(params.get("controllerSupport"), "full");
    assert.equal(params.get("minPlayers"), "2");
    assert.equal(params.get("maxPlayers"), "4");
    assert.equal(params.get("friendIds"), "111,222");
    assert.equal(params.get("genres"), "Action,Indie");
    assert.equal(params.get("protonDbTier"), "NATIVE");
    assert.equal(params.get("userStatus"), "Playing");
    assert.equal(params.get("minReview"), "90");
    assert.equal(params.get("sortBy"), "playtime");
    assert.equal(params.get("sortOrder"), "desc");
  });

  it("envía estados computados de la biblioteca como userStatus", () => {
    assert.equal(filtersToSearchParams(filters({ userStatus: "notPlayed" })).get("userStatus"), "notPlayed");
    assert.equal(filtersToSearchParams(filters({ userStatus: "tested" })).get("userStatus"), "tested");
    assert.equal(filtersToSearchParams(filters({ userStatus: "Abandoned" })).get("userStatus"), "Abandoned");
  });

  it("ignora búsquedas vacías o solo espacios", () => {
    assert.equal(filtersToSearchParams(filters({ search: "   " })).get("search"), null);
  });
});

describe("countActiveFilters", () => {
  it("cuenta los grupos de filtros activos", () => {
    assert.equal(countActiveFilters(DEFAULT_FILTERS), 0);
    assert.equal(countActiveFilters(filters({ search: "x" })), 1);
    assert.equal(countActiveFilters(filters({ hltbMax: 10 })), 1);
    assert.equal(countActiveFilters(filters({ playtimeMin: 1, playtimeMax: 5 })), 1);
    assert.equal(
      countActiveFilters(
        filters({ isLocalCoop: true, friendIds: ["1"], genres: ["Action"], sortBy: "hltb" }),
      ),
      3,
    );
    assert.equal(countActiveFilters(filters({ userStatus: "Completed" })), 1);
    assert.equal(countActiveFilters(filters({ minReview: 85 })), 1);
    assert.equal(
      countActiveFilters(filters({ userStatus: "notPlayed", minReview: 0 })),
      2,
    );
  });
});

describe("userStatusLabel", () => {
  it("traduce los estados de usuario conocidos", () => {
    assert.equal(userStatusLabel("Backlog"), "Backlog");
    assert.equal(userStatusLabel("Playing"), "En progreso");
    assert.equal(userStatusLabel("Completed"), "Completado");
    assert.equal(userStatusLabel("Abandoned"), "Abandonado");
    assert.equal(userStatusLabel("Desconocido"), "Desconocido");
    assert.equal(userStatusLabel(null), "—");
  });
});

describe("clampRange", () => {
  const bounds = { min: 0, max: 10 };

  it("respeta los límites e intercambia min/max si hace falta", () => {
    assert.deepEqual(clampRange(-5, 20, bounds), { min: 0, max: 10 });
    assert.deepEqual(clampRange(8, 2, bounds), { min: 2, max: 8 });
    assert.deepEqual(clampRange(null, null, bounds), { min: null, max: null });
    assert.deepEqual(clampRange(3, null, bounds), { min: 3, max: null });
  });
});

describe("formatters", () => {
  it("formatea horas jugadas, HLTB y reseñas", () => {
    assert.equal(formatPlaytimeHours(null), "—");
    assert.equal(formatPlaytimeHours(45), "45 min");
    assert.equal(formatPlaytimeHours(90), "1.5 h");
    assert.equal(formatPlaytimeHours(300), "5.0 h");
    assert.equal(formatHltbHours(0), "—");
    assert.equal(formatHltbHours(8.6), "8.6 h");
    assert.equal(formatReviewScore(99), "99%");
    assert.equal(formatReviewScore(null), "—");
  });
});
