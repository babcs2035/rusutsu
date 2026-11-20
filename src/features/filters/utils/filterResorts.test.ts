import assert from "node:assert/strict";
import { test } from "node:test";
import { toSearchTokens } from "@/shared/utils/japaneseSearchText";
import type { MapSkiResort } from "@/types/skiResorts";
import { DEFAULT_FILTERS } from "../constants";
import {
  areFiltersEqual,
  createKeywordTokenCache,
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

test("キーワードは正式名・英名・所在地・読み・旧名の読みで検索できる", () => {
  const resortWithNames = {
    nameJa: "白馬テスト",
    nameEn: "Hakuba Test",
    prefecture: "長野県",
    town: "白馬村",
    reading: "はくばてすと",
    formerNames: [{ name: "旧白馬", reading: "きゅうはくば" }],
    yukiMagiId: null,
    evChargerSummary: null,
    passProgramIds: [],
  } as unknown as MapSkiResort;

  for (const keyword of [
    "白馬テスト",
    "hakuba test",
    "長野県 白馬村",
    "はくばてすと",
    "旧白馬",
    "きゅうはくば",
  ]) {
    assert.equal(
      matchesFilters(resortWithNames, { ...DEFAULT_FILTERS, keyword }),
      true,
      keyword,
    );
  }
  assert.equal(
    matchesFilters(resortWithNames, {
      ...DEFAULT_FILTERS,
      keyword: "存在しない名前",
    }),
    false,
  );
});

test("キーワード token は同じ filter object で一度だけ作り，値の変更で更新する", () => {
  let tokenizationCount = 0;
  const getTokens = createKeywordTokenCache(keyword => {
    tokenizationCount += 1;
    return toSearchTokens(keyword);
  });
  const filters = { ...DEFAULT_FILTERS, keyword: "Hakuba test" };

  const firstTokens = getTokens(filters);
  for (let index = 0; index < 100; index += 1) {
    assert.strictEqual(getTokens(filters), firstTokens);
  }
  assert.equal(tokenizationCount, 1);

  filters.keyword = "長野県";
  assert.deepEqual(getTokens(filters), ["長野県"]);
  assert.equal(tokenizationCount, 2);
});

test("営業基準では滑走可能な標高・コース・リフト・距離を使い，未知を通さない", () => {
  const operatingResort = {
    nameJa: "テスト",
    prefecture: "長野県",
    town: "白馬村",
    formerNames: [],
    yukiMagiId: null,
    evChargerSummary: null,
    passProgramIds: [],
    topElevation: 2000,
    baseElevation: 1000,
    verticalDrop: 1000,
    numberOfCourses: 10,
    numberOfLifts: 4,
    operatingCounts: {
      hasMap: true,
      courses: { active: 3, total: 5 },
      lifts: { active: 2, total: 4 },
      courseDistance: { total: 6000, open: 3200 },
      openElevation: { top: 1900, base: 1100 },
    },
  } as unknown as MapSkiResort;
  const openFilters = {
    ...DEFAULT_FILTERS,
    scaleBasis: "open" as const,
    minVertical: 700,
    minTopElevation: 1800,
    minBaseElevation: 1000,
    minCourses: 3,
    minLifts: 2,
    minCourseDistance: 3,
  };

  assert.equal(matchesFilters(operatingResort, openFilters), true);
  assert.equal(
    matchesFilters(operatingResort, {
      ...openFilters,
      minCourseDistance: 4,
    }),
    false,
  );
  assert.equal(
    matchesFilters(
      {
        ...operatingResort,
        operatingCounts: {
          ...operatingResort.operatingCounts,
          openElevation: null,
        },
      },
      openFilters,
    ),
    false,
  );
});
