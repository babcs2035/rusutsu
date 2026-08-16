import assert from "node:assert/strict";
import { test } from "node:test";
import type { SlopeSourceData } from "../types";
import { normalizeLevel, sourceDataToCourses } from "./loadSource";

test("normalizeLevel keeps the five supported levels", () => {
  for (const level of ["初級", "初中級", "中級", "中上級", "上級"]) {
    assert.deepEqual(normalizeLevel(level), {
      level,
      raw: level,
      issue: null,
    });
  }
  assert.equal(normalizeLevel("初・中級").level, "初中級");
  assert.equal(normalizeLevel("中・上級").level, "中上級");
});

test("normalizeLevel infers a supported level from included markers", () => {
  assert.equal(normalizeLevel("初心者向け").level, "初級");
  assert.equal(normalizeLevel("初、中級").level, "初中級");
  assert.equal(normalizeLevel("初心者から中級者向け").level, "初中級");
  assert.equal(normalizeLevel("中斜面").level, "中級");
  assert.equal(normalizeLevel("中、上級").level, "中上級");
  assert.equal(normalizeLevel("中級から上級者向け").level, "中上級");
  assert.equal(normalizeLevel("上級者専用").level, "上級");
});

test("normalizeLevel leaves conflicts and unrecognized text blank", () => {
  assert.deepEqual(normalizeLevel("初級または上級"), {
    level: "",
    raw: "初級または上級",
    issue: "conflict",
  });
  assert.deepEqual(normalizeLevel("初心者から上級者まですべて"), {
    level: "",
    raw: "初心者から上級者まですべて",
    issue: "conflict",
  });
  assert.deepEqual(normalizeLevel("エキスパート"), {
    level: "",
    raw: "エキスパート",
    issue: "no-marker",
  });
  assert.deepEqual(normalizeLevel(""), {
    level: "",
    raw: "",
    issue: "empty",
  });
});

test("sourceDataToCourses warns and does not fall back from invalid detail level", () => {
  const source: SlopeSourceData = {
    geojson: {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: { name: "テストコース", level: "中級" },
          geometry: {
            type: "LineString",
            coordinates: [
              [140, 40],
              [140.01, 40.01],
            ],
          },
        },
      ],
    },
    details: [
      {
        name: "テストコース",
        level: "エキスパート",
      },
    ],
    fileHash: null,
    detailFileHash: null,
  };

  const result = sourceDataToCourses(source);

  assert.equal(result.courses[0].detail.level, "");
  assert.equal(result.warnings.length, 1);
  assert.match(result.warnings[0], /テストコース/);
  assert.match(result.warnings[0], /空欄にしました/);
});
