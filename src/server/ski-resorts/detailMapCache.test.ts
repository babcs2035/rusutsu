// detail service の canonical map cache が revision と capture を守ることを検査する．
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
import { testArtifactPath } from "../../../scripts/testArtifacts";

const testRoot = testArtifactPath("detail-map-cache-tests");

test("canonical map data is reused only while its revision remains current", async t => {
  await fs.mkdir(testRoot, { recursive: true });
  const bundlePath = path.join(testRoot, "detail-map-cache.mjs");
  const stubs: Record<string, string> = {
    "server-only": "export {};",
    "detail-map-cache-state": `
      export const counts = { revision: 0, snapshot: 0, direct: 0 };
      const revisions = new Map();
      const snapshots = new Map();
      let editCapture = false;
      export function reset() {
      counts.revision = 0;
      counts.snapshot = 0;
      counts.direct = 0;
      revisions.clear();
      snapshots.clear();
      editCapture = false;
      }
      export function setRevision(id, revision, enabled = true) {
      revisions.set(id, { enabled, revision });
      }
      export function setSnapshot(id, snapshot) { snapshots.set(id, snapshot); }
      export function setEditCapture(value) { editCapture = value; }
      export function readRevision(id) {
      counts.revision += 1;
      return revisions.get(id) ?? { enabled: false, revision: "" };
      }
      export function readSnapshot(id) {
      counts.snapshot += 1;
      return snapshots.get(id);
      }
      export function readDirect(id) {
      counts.direct += 1;
      return snapshots.get(id)?.data ?? null;
      }
      export function isEditCapture() { return editCapture; }
      `,
    "@/lib/finalizedResortGeojson": `
      import { readSnapshot, readDirect } from 'detail-map-cache-state';
      export const getFinalizedResortMapDataSnapshot = async id => readSnapshot(id);
      export const getFinalizedResortMapData = async id => readDirect(id);
      `,
    "@/server/course-lift/mapData": `
      import { readRevision } from 'detail-map-cache-state';
      export const readCanonicalResortMapRevision = async id => readRevision(id);
      `,
    "@/server/edit-requests/capture": `
      import { isEditCapture } from 'detail-map-cache-state';
      export const currentEditCapture = isEditCapture;
      `,
    "@/features/lift/server/liftFiles":
      "export const SKI_RESORT_LINKS_DOCUMENT_KEY = 'links'; export const parseResortLinksMap = () => ({});",
    "@/features/resort-detail/utils/trailMapLinks":
      "export const collectNewsLinks = () => []; export const collectTrailMapLinks = () => [];",
    "@/features/weather/weatherLinks":
      "export const resolveResortWeatherIds = () => []; export const weatherLinksMapFromDocument = () => ({});",
    "@/lib/crawlLatestCurrent":
      "export const readCurrentResortConditions = async () => ({});",
    "@/lib/resortDecisionData":
      "export const getResortDecisionData = async () => ({ liftTickets: [] });",
    "@/lib/resortDisplayGroups":
      "export const readDisplayGroupsForResort = async () => [];",
    "@/lib/resortReadings": "export const getResortReadingInfo = () => ({});",
    "@/lib/skiResortData":
      "export const readSkiResortById = async id => ({ id });",
    "@/server/course-lift/summaryClient":
      "export const readOperatingSummaries = async () => ({});",
    "@/server/data-documents/client":
      "export const getDataDocument = async () => null; export const listDataDocuments = async () => [];",
    "@/server/ski-resorts/publicAccess":
      "export const readPublicResortAccess = async () => ({ sourceIdsByResort: new Map() });",
    "@/shared/utils/resortElevation":
      "export const withMapElevation = value => value;",
  };
  await build({
    stdin: {
      contents: `
        export { readResortMapDataByIds, readSkiResortDetails } from '@/server/ski-resorts/detail';
        export { reset, setRevision, setSnapshot, setEditCapture, counts } from 'detail-map-cache-state';
      `,
      resolveDir: process.cwd(),
      sourcefile: "detail-map-cache-test.ts",
      loader: "ts",
    },
    outfile: bundlePath,
    platform: "node",
    format: "esm",
    bundle: true,
    packages: "external",
    plugins: [
      {
        name: "detail-map-cache-test-stubs",
        setup(builder) {
          builder.onResolve({ filter: /./ }, ({ path }) =>
            Object.hasOwn(stubs, path)
              ? { path, namespace: "detail-map-cache-test" }
              : undefined,
          );
          builder.onLoad(
            { filter: /./, namespace: "detail-map-cache-test" },
            ({ path }) => ({ loader: "js", contents: stubs[path] }),
          );
        },
      },
    ],
  });

  const api = await import(pathToFileURL(bundlePath).href);
  const map = (label: string): { label: string } => ({ label });

  await t.test(
    "cold read uses the canonical response revision without a probe",
    async () => {
      api.reset();
      api.setRevision("cold", "v1");
      api.setSnapshot("cold", {
        canonicalEnabled: true,
        revision: "v1",
        data: map("first"),
      });

      const [result] = await api.readResortMapDataByIds(["cold"]);

      assert.deepEqual(api.counts, { revision: 0, snapshot: 1, direct: 0 });
      assert.equal(result.finalizedMapData.label, "first");
    },
  );

  await t.test(
    "matching revision reuses canonical data after one probe",
    async () => {
      api.setRevision("cold", "v1");
      api.setSnapshot("cold", {
        canonicalEnabled: true,
        revision: "v1",
        data: map("unused"),
      });

      const [result] = await api.readResortMapDataByIds(["cold"]);

      assert.deepEqual(api.counts, { revision: 1, snapshot: 1, direct: 0 });
      assert.equal(result.finalizedMapData.label, "first");
    },
  );

  await t.test(
    "concurrent reads share reloading a changed revision",
    async () => {
      api.setRevision("cold", "v2");
      api.setSnapshot("cold", {
        canonicalEnabled: true,
        revision: "v2",
        data: map("second"),
      });

      const [[first], [second]] = await Promise.all([
        api.readResortMapDataByIds(["cold"]),
        api.readResortMapDataByIds(["cold"]),
      ]);

      assert.deepEqual(api.counts, { revision: 2, snapshot: 2, direct: 0 });
      assert.equal(first.finalizedMapData.label, "second");
      assert.deepEqual(first, second);
    },
  );

  await t.test(
    "comparison detail keeps operation status and the map request avoids a second full read",
    async () => {
      api.reset();
      const id = "comparison";
      const data = {
        courses: {
          features: [],
          sourceUrls: ["https://example.test/status"],
          observedAt: "2026-01-01T02:00:00Z",
        },
        lifts: null,
      };
      api.setRevision(id, "v1");
      api.setSnapshot(id, { canonicalEnabled: true, revision: "v1", data });

      const [compact] = await api.readSkiResortDetails([id], {
        withMap: false,
      });
      assert.equal(compact.finalizedMapData, null);
      assert.deepEqual(
        compact.operationStatus.courseSourceUrls,
        data.courses.sourceUrls,
      );
      const [mapResult] = await api.readResortMapDataByIds([id]);
      assert.deepEqual(api.counts, { revision: 1, snapshot: 1, direct: 0 });
      assert.deepEqual(mapResult.finalizedMapData, data);

      const [full] = await api.readSkiResortDetails([id], { withMap: true });
      assert.deepEqual(compact.operationStatus, full.operationStatus);
      assert.ok(
        Buffer.byteLength(JSON.stringify(compact)) <
          Buffer.byteLength(JSON.stringify(full)),
      );
    },
  );

  await t.test(
    "legacy data uses its loader on every read and is not cached",
    async () => {
      api.reset();
      api.setSnapshot("legacy", {
        canonicalEnabled: false,
        revision: null,
        data: map("legacy"),
      });

      await api.readResortMapDataByIds(["legacy"]);
      await api.readResortMapDataByIds(["legacy"]);

      assert.deepEqual(api.counts, { revision: 0, snapshot: 2, direct: 0 });
    },
  );

  await t.test(
    "edit capture bypasses map cache and revision reads",
    async () => {
      api.reset();
      api.setEditCapture(true);
      api.setSnapshot("capture", { data: map("draft") });

      await api.readResortMapDataByIds(["capture"]);
      await api.readResortMapDataByIds(["capture"]);

      assert.deepEqual(api.counts, { revision: 0, snapshot: 0, direct: 2 });
    },
  );
});
