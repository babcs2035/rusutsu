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
        courseUrl: ["https://example.com/course", "https://example.com/status"],
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
        liftUrl: "https://example.com/lift",
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
    assert.deepEqual(workspace.sourceUrls, [
      "https://example.com/course",
      "https://example.com/status",
    ]);
    const liftWorkspace = await loadLatestStatusMappingWorkspace(
      temporaryRoot,
      resortId,
      "lifts",
    );
    assert.deepEqual(liftWorkspace.sourceUrls, ["https://example.com/lift"]);
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

test("Waybackの保存日時を表示へ渡し、同じ取得結果で対応表を保存できる", async () => {
  const temporaryRoot = await fs.mkdtemp(
    path.join(os.tmpdir(), "wayback-mapping-"),
  );
  try {
    for (const kind of ["courses", "lifts"] as const) {
      const name = kind === "courses" ? "サザンクロスA" : "第1";
      const loader = async () => ({
        fileName: `wayback-20260214095743-${kind}.json`,
        time: "2026-09-14T13:09:03Z",
        archiveTimestamp: "20260214095743",
        items: [{ name, status: "○" }],
        sourceUrls: ["https://new-greenpia.com/"],
      });
      const workspace = await loadLatestStatusMappingWorkspace(
        temporaryRoot,
        "new-greenpia-tsunan",
        kind,
        [name],
        loader,
      );
      assert.equal(workspace.archiveTimestamp, "20260214095743");
      assert.equal(workspace.crawledItems.length, 1);
      assert(workspace.latestFile);
      const saved = await saveLatestStatusMappingFile(
        temporaryRoot,
        {
          resortId: "new-greenpia-tsunan",
          kind,
          latestFile: workspace.latestFile,
          mappingFileHash: workspace.mappingFileHash,
          rows: workspace.rows,
          geojsonNames: [name],
        },
        loader,
      );
      assert.equal(saved.ok, true);
    }
  } finally {
    await fs.rm(temporaryRoot, { recursive: true, force: true });
  }
});

test("異なる取得履歴の別名を同じ線に保存し、履歴がなくなっても保持する", async () => {
  const parent = path.resolve(
    "src/private/data/resorts-temporary/tmp/mapping-tests",
  );
  await fs.mkdir(parent, { recursive: true });
  const root = await fs.mkdtemp(path.join(parent, "aliases-"));
  const current = async () => ({
    fileName: "current.json",
    time: null,
    items: [{ name: "現在名", status: "○" }],
    sourceUrls: [],
  });
  const history = async () => [
    {
      fileName: "old.json",
      time: null,
      items: [{ name: "旧名", status: "×" }],
      sourceUrls: [],
      archiveTimestamp: "20250201",
    },
  ];
  try {
    const workspace = await loadLatestStatusMappingWorkspace(
      root,
      "sample",
      "courses",
      ["地図"],
      current,
      history,
    );
    assert.equal(workspace.patterns?.length, 2);
    const request = {
      resortId: "sample",
      kind: "courses" as const,
      latestFile: "old.json",
      mappingFileHash: null as string | null,
      geojsonNames: ["地図"],
      geometries: [{ id: "id", name: "地図" }],
      rows: [
        {
          geometryId: "id",
          geojsonName: "地図",
          crawledName: "現在名",
          crawledNames: ["現在名", "旧名"],
        },
      ],
    };
    const saved = await saveLatestStatusMappingFile(
      root,
      request,
      current,
      history,
    );
    assert(saved.ok);
    const resolved = await readResolvedLatestStatusMapping(
      root,
      "sample",
      "courses",
    );
    assert.deepEqual(resolved.namesByGeometryId?.get("id"), ["現在名", "旧名"]);
    const preserved = await saveLatestStatusMappingFile(
      root,
      {
        ...request,
        latestFile: "current.json",
        mappingFileHash: saved.mappingFileHash,
      },
      current,
    );
    assert(preserved.ok);
    const rejected = await saveLatestStatusMappingFile(
      root,
      {
        ...request,
        latestFile: "current.json",
        mappingFileHash: preserved.mappingFileHash,
        rows: [
          { ...request.rows[0], crawledNames: ["現在名", "存在しない名前"] },
        ],
      },
      current,
      history,
    );
    assert.equal(rejected.ok, false);
    const conflict = await saveLatestStatusMappingFile(
      root,
      request,
      current,
      history,
    );
    assert.equal(conflict.ok, false);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("採用済み結果がなくても取得履歴から対応を開始できる", async () => {
  const parent = path.resolve(
    "src/private/data/resorts-temporary/tmp/mapping-tests",
  );
  await fs.mkdir(parent, { recursive: true });
  const root = await fs.mkdtemp(path.join(parent, "history-only-"));
  try {
    const workspace = await loadLatestStatusMappingWorkspace(
      root,
      "sample",
      "lifts",
      ["第1"],
      async () => null,
      async () => [
        {
          fileName: "history.json",
          time: null,
          items: [{ name: "第1", status: null }],
          sourceUrls: [],
        },
      ],
    );
    assert.equal(workspace.latestFile, "history.json");
    assert.equal(workspace.crawledItems[0].name, "第1");
    assert.equal(workspace.patterns?.length, 1);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
