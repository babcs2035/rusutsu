import assert from "node:assert/strict";
import { test } from "node:test";
import type { FinalizedResortMapData } from "@/lib/finalizedResortGeojsonShared";
import { escapeXml, shareMapData } from "./mapCard";

test("share map removes changing operation details without mutating source data", () => {
  const source = {
    courses: {
      source: "osm",
      observedAt: "2026-11-06T01:00:00Z",
      sourceUrls: ["https://source.example"],
      features: [
        {
          id: "c1",
          name: "Course",
          displayName: "Course",
          groupId: "g1",
          sectionName: null,
          coordinates: [[0, 0]],
          latestStatusName: "営業中",
          statusSnapshotId: "snapshot",
          sourceUrls: ["https://feature.example"],
          properties: {
            name: "Course",
            level: "初級",
            status: "営業中",
            update: "today",
            latestNote: "open",
            piste: null,
          },
        },
      ],
    },
    lifts: null,
  } as unknown as FinalizedResortMapData;
  const before = structuredClone(source);
  const sanitized = shareMapData(source);

  assert.deepEqual(source, before);
  assert.equal(sanitized?.courses?.observedAt, null);
  assert.deepEqual(sanitized?.courses?.sourceUrls, []);
  assert.equal(sanitized?.courses?.features[0].latestStatusName, null);
  assert.equal(sanitized?.courses?.features[0].statusSnapshotId, null);
  assert.deepEqual(sanitized?.courses?.features[0].sourceUrls, []);
  assert.equal(sanitized?.courses?.features[0].properties.status, null);
  assert.equal(sanitized?.courses?.features[0].properties.update, null);
  assert.equal(sanitized?.courses?.features[0].properties.latestNote, null);
  assert.equal(sanitized?.courses?.features[0].properties.level, "初級");
  assert.equal(shareMapData(null), null);
});

test("XML escaping protects all five XML-sensitive characters", () => {
  assert.equal(
    escapeXml(`<雪 & "斜度" '道'>`),
    "&lt;雪 &amp; &quot;斜度&quot; &apos;道&apos;&gt;",
  );
});
