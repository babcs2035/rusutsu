import assert from "node:assert/strict";
import test from "node:test";
import {
  linkSaveSchema,
  linksFromDocument,
  patchLinksDocument,
} from "@/features/links/model";
import {
  getWeathernewsLinks,
  parseWeatherLinkId,
  resolveResortWeatherIds,
  weatherIdsFromLinks,
  weatherLinksMapFromDocument,
} from "./weatherLinks";
import { prepareWeatherLinksMigration } from "./weatherLinksMigration";

const family = {
  tenkijpUrls: [
    {
      url: "https://tenki.jp/season/ski/3/23/10239/",
      description: "一の瀬ファミリー",
    },
  ],
  snowForecastUrls: [
    {
      url: "https://ja.snow-forecast.com/resorts/IchinoseFamily/6day/mid",
      description: "一の瀬ファミリー",
    },
  ],
  weathernewsUrls: [{ url: "https://weathernews.jp/ski/spot/34820/" }],
};

test("天気サイトの地点URLを検証し、偽装ホストや地点のないURLを拒否する", () => {
  for (const [platform, links] of Object.entries(family)) {
    assert.equal(
      linkSaveSchema.safeParse({
        resortId: "family",
        platform,
        links,
        expectedLinks: [],
      }).success,
      true,
    );
    assert.equal(
      linkSaveSchema.safeParse({
        resortId: "family",
        platform,
        links: [{ url: "https://example.com/" }],
        expectedLinks: [],
      }).success,
      false,
    );
  }
  assert.equal(
    parseWeatherLinkId(
      "snowForecastUrls",
      "https://www.snow-forecast.com/resorts/IchinoseFamily/6day/top",
    ),
    "IchinoseFamily",
  );
  assert.equal(
    parseWeatherLinkId(
      "tenkijpUrls",
      "https://tenki.jp/season/ski/3/23/10239/index.html",
    ),
    "3/23/10239",
  );
  for (const url of [
    "https://ja.snow-forecast.com/",
    "https://ja.snow-forecast.com.evil.test/resorts/A",
    "https://user@ja.snow-forecast.com/resorts/A",
    "https://ja.snow-forecast.com/resorts/A/unknown",
  ]) {
    assert.equal(parseWeatherLinkId("snowForecastUrls", url), null);
  }
  assert.equal(
    linkSaveSchema.safeParse({
      resortId: "family",
      platform: "weathernewsUrls",
      links: [
        ...family.weathernewsUrls,
        { url: "https://weathernews.jp/ski/spot/1/" },
      ],
      expectedLinks: [],
    }).success,
    true,
  );
});

test("親の代表地点を優先し、明示的な空設定は子地点で補充しない", () => {
  assert.deepEqual(weatherLinksMapFromDocument("invalid"), {});
  assert.deepEqual(
    weatherLinksMapFromDocument(JSON.stringify({ broken: null, family })),
    { family },
  );
  const ids = weatherIdsFromLinks(family);
  assert.equal(ids?.snowForecast[0].snowForecastId, "IchinoseFamily");
  assert.equal(ids?.tenkijp[0].tenkijpId, "3/23/10239");
  assert.equal(ids?.weathernewsSpotId, "34820");
  assert.deepEqual(ids?.weathernews, [
    { weathernewsSpotId: "34820", displayName: null },
  ]);
  const map = {
    family,
    central: family,
    other: {
      snowForecastUrls: [{ url: "https://ja.snow-forecast.com/resorts/Other" }],
    },
  };
  assert.deepEqual(
    resolveResortWeatherIds(map, "central", ["family", "other"]),
    ids,
  );
  assert.equal(
    resolveResortWeatherIds(map, "missing", ["family", "family"])?.snowForecast
      .length,
    1,
  );
  assert.deepEqual(
    resolveResortWeatherIds(
      { ...map, central: { snowForecastUrls: [] } },
      "central",
      ["family"],
    )?.snowForecast,
    [],
  );
  assert.equal(resolveResortWeatherIds(map, "missing"), null);
});

test("Weathernews links retain labels, merge by ID, and support legacy cached IDs", () => {
  const parent = {
    weathernewsUrls: [
      { url: "https://weathernews.jp/ski/spot/34820/", description: "Family" },
      { url: "https://weathernews.jp/ski/spot/55/", description: "Yakebitai" },
    ],
  };
  const child = {
    weathernewsUrls: [
      { url: "https://weathernews.jp/ski/spot/55/", description: "duplicate" },
      { url: "https://weathernews.jp/ski/spot/77/", description: "Okushiga" },
    ],
  };
  assert.deepEqual(weatherIdsFromLinks(parent)?.weathernews, [
    { weathernewsSpotId: "34820", displayName: "Family" },
    { weathernewsSpotId: "55", displayName: "Yakebitai" },
  ]);
  assert.deepEqual(
    resolveResortWeatherIds({ parent, child }, "missing", ["parent", "child"])
      ?.weathernews,
    [
      { weathernewsSpotId: "34820", displayName: "Family" },
      { weathernewsSpotId: "55", displayName: "Yakebitai" },
      { weathernewsSpotId: "77", displayName: "Okushiga" },
    ],
  );
  assert.deepEqual(
    resolveResortWeatherIds(
      { parent, empty: { weathernewsUrls: [] } },
      "empty",
      ["parent"],
    )?.weathernews,
    [],
  );
  assert.deepEqual(getWeathernewsLinks({ weathernewsSpotId: "34820" }), [
    {
      id: "34820",
      displayName: "34820",
      url: "https://weathernews.jp/ski/spot/34820/",
    },
  ]);
  assert.deepEqual(
    getWeathernewsLinks({ weathernewsSpotId: "34820", weathernews: [] }),
    [],
  );
});

test("複数のWeathernewsリンクを保存して順序と地点名を維持する", () => {
  const request = {
    resortId: "family",
    platform: "weathernewsUrls" as const,
    links: [
      { url: "https://weathernews.jp/ski/spot/34820/", description: "Family" },
      { url: "https://weathernews.jp/ski/spot/55/", description: "Yakebitai" },
    ],
    expectedLinks: [],
  };
  const saved = patchLinksDocument(null, request);
  assert.deepEqual(
    linksFromDocument(saved).family?.weathernewsUrls,
    request.links,
  );
});

test("移行は既存URL・他項目を保持し、再実行や空設定でリンクを復活させない", () => {
  const legacy = [
    {
      skiResortId: "family",
      tenkijp: [{ tenkijpId: "3/23/10239", tenkijpName: "一の瀬" }],
      snowForecast: [
        { snowForecastId: "IchinoseFamily", snowForecastName: "Family" },
      ],
      weathernewsSpotId: "34820",
      weathernewsSpotName: "一の瀬",
    },
  ];
  const original = {
    family: {
      officialSiteUrls: ["https://example.com"],
      snowForecastUrls: [],
      custom: { keep: true },
    },
    other: { mapUrls: ["https://example.com/map.pdf"] },
  };
  const migrated = prepareWeatherLinksMigration(
    JSON.stringify(original),
    legacy,
  );
  const after = JSON.parse(migrated.content);
  assert.equal(migrated.addedFields, 2);
  assert.equal(migrated.addedLinks, 2);
  assert.deepEqual(after.family.snowForecastUrls, []);
  assert.deepEqual(after.family.custom, original.family.custom);
  assert.deepEqual(after.other, original.other);
  assert.deepEqual(
    after.family.officialSiteUrls,
    original.family.officialSiteUrls,
  );
  assert.deepEqual(after.family.tenkijpUrls, [
    { url: "https://tenki.jp/season/ski/3/23/10239/", description: "一の瀬" },
  ]);
  const repeated = prepareWeatherLinksMigration(migrated.content, legacy);
  assert.equal(repeated.addedFields, 0);
  assert.equal(repeated.content, migrated.content);
  assert.throws(
    () => prepareWeatherLinksMigration("{}", [...legacy, ...legacy]),
    /Duplicate/,
  );
  assert.throws(
    () =>
      prepareWeatherLinksMigration("{}", [
        { skiResortId: "family", snowForecast: [{ snowForecastId: "../bad" }] },
      ]),
    /Invalid weather ID/,
  );
});
