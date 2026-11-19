import assert from "node:assert/strict";
import { test } from "node:test";
import type { MapSkiResort } from "@/types/skiResorts";
import { DEFAULT_FILTERS } from "../constants";
import {
  areFiltersEqual,
  isFilterActive,
  matchesFilters,
} from "./filterResorts";

const resort = (passProgramIds: MapSkiResort["passProgramIds"]) =>
  ({
    nameJa: "テスト",
    prefecture: "長野県",
    town: "",
    formerNames: [],
    yukiMagiId: null,
    evChargerSummary: null,
    passProgramIds,
  }) as unknown as MapSkiResort;

test("シーズン券・キッズパスは、選んだ全部の対象一覧に載っているスキー場だけに絞る", () => {
  const filters = { ...DEFAULT_FILTERS, passPrograms: ["macEarth" as const] };
  assert.equal(isFilterActive(filters), true);
  assert.equal(matchesFilters(resort(["macEarth"]), filters), true);
  assert.equal(matchesFilters(resort(["nsdKids"]), filters), false);
  assert.equal(
    matchesFilters(resort(["macEarth"]), {
      ...filters,
      passPrograms: ["macEarth", "snowbirds"],
    }),
    false,
  );
  assert.equal(matchesFilters(resort([]), DEFAULT_FILTERS), true);
});

test("シーズン券の選択は順番が違っても同じ条件とみなす", () => {
  assert.equal(
    areFiltersEqual(
      { ...DEFAULT_FILTERS, passPrograms: ["nsdKids", "macEarth"] },
      { ...DEFAULT_FILTERS, passPrograms: ["macEarth", "nsdKids"] },
    ),
    true,
  );
  assert.equal(
    areFiltersEqual(DEFAULT_FILTERS, {
      ...DEFAULT_FILTERS,
      passPrograms: ["nsdKids"],
    }),
    false,
  );
});
