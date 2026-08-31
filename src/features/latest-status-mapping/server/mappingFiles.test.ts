import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import {
  loadLatestStatusMappingWorkspace,
  readResolvedLatestStatusMapping,
  saveLatestStatusMappingFile,
} from "./mappingFiles";

test("対応表を読み込み、保存し、地図用lookupへ戻せる", async () => {
  const temporaryRoot = await fs.mkdtemp(
    path.join(os.tmpdir(), "latest-status-mapping-"),
  );
  const resortId = "test-resort";
  const latestFile = "2026_0101_000000.json";
  const newerFileWithoutCourses = "2026_0101_000100.json";

  try {
    await fs.mkdir(path.join(temporaryRoot, "latest_data", resortId), {
      recursive: true,
    });
    await fs.mkdir(path.join(temporaryRoot, "slope_10m"), {
      recursive: true,
    });
    await fs.writeFile(
      path.join(temporaryRoot, "latest_data", resortId, latestFile),
      JSON.stringify({
        time: "2026/1/1 7:00",
        courses: [{ name: "白樺ゲレンデ上部", status: "○" }],
      }),
    );
    await fs.writeFile(
      path.join(
        temporaryRoot,
        "latest_data",
        resortId,
        newerFileWithoutCourses,
      ),
      JSON.stringify({
        time: "2026/1/1 7:01",
        lifts: [{ name: "第1リフト", status: "○" }],
      }),
    );
    await fs.writeFile(
      path.join(temporaryRoot, "slope_10m", `${resortId}.geojson`),
      JSON.stringify({
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            geometry: {
              type: "LineString",
              coordinates: [
                [140, 40],
                [140.1, 40.1],
              ],
            },
            properties: { name: "白樺ゲレンデ_#上部" },
          },
        ],
      }),
    );

    const workspace = await loadLatestStatusMappingWorkspace(
      temporaryRoot,
      resortId,
      "courses",
    );
    assert.equal(workspace.latestFile, latestFile);
    assert.equal(workspace.needsSave, true);
    assert.deepEqual(workspace.rows, [
      {
        crawledName: "白樺ゲレンデ上部",
        geojsonName: "白樺ゲレンデ_#上部",
      },
    ]);

    const saved = await saveLatestStatusMappingFile(temporaryRoot, {
      resortId,
      kind: "courses",
      latestFile,
      mappingFileHash: workspace.mappingFileHash,
      rows: workspace.rows,
    });
    assert.equal(saved.ok, true);

    const reloaded = await loadLatestStatusMappingWorkspace(
      temporaryRoot,
      resortId,
      "courses",
    );
    assert.equal(reloaded.needsSave, false);

    const resolved = await readResolvedLatestStatusMapping(
      temporaryRoot,
      resortId,
      "courses",
    );
    assert.equal(resolved.configured, true);
    assert.equal(
      resolved.byGeojsonName.get("白樺ゲレンデ_#上部"),
      "白樺ゲレンデ上部",
    );
  } finally {
    await fs.rm(temporaryRoot, { recursive: true, force: true });
  }
});

test("確認済みとOSMが共存すると両方のコース名を読み込む", async () => {
  const temporaryRoot = await fs.mkdtemp(
    path.join(os.tmpdir(), "latest-status-mapping-mixed-"),
  );
  const resortId = "mixed-resort";
  const writeCourseGeojson = async (directory: string, name: string) => {
    await fs.mkdir(path.join(temporaryRoot, directory), { recursive: true });
    await fs.writeFile(
      path.join(temporaryRoot, directory, `${resortId}.geojson`),
      JSON.stringify({
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            geometry: {
              type: "LineString",
              coordinates: [
                [140, 40],
                [140.1, 40.1],
              ],
            },
            properties: { name },
          },
        ],
      }),
    );
  };

  try {
    await writeCourseGeojson("slope_before", "確認済みコース");
    await writeCourseGeojson("slope_10m_osm", "OSMコース");

    const workspace = await loadLatestStatusMappingWorkspace(
      temporaryRoot,
      resortId,
      "courses",
    );
    assert.deepEqual(
      workspace.rows.map(row => row.geojsonName),
      ["確認済みコース", "OSMコース"],
    );
  } finally {
    await fs.rm(temporaryRoot, { recursive: true, force: true });
  }
});
