import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
import type { FinalizedResortMapData } from "@/lib/finalizedResortGeojsonShared";
import { testArtifactPath } from "../../../scripts/testArtifacts";

const testRoot = testArtifactPath("map-data-read-tests");

test("remote canonical map reads require the current operation version", async t => {
  await fs.mkdir(testRoot, { recursive: true });
  const bundlePath = path.join(testRoot, "map-data-read.mjs");
  await build({
    stdin: {
      contents: `
        export { readCanonicalResortMap, readCanonicalResortMapRevision } from '@/server/course-lift/mapData';
          export { CURRENT_MAP_OPERATION_VERSION } from '@/lib/currentMapOperations';
        export { resetTestData, fetchCalls, currentReads, setResponse, setError } from 'map-data-test-state';
      `,
      resolveDir: process.cwd(),
      sourcefile: "map-data-read-test.ts",
      loader: "ts",
    },
    outfile: bundlePath,
    platform: "node",
    format: "esm",
    bundle: true,
    packages: "external",
    plugins: [
      {
        name: "map-data-read-test-stubs",
        setup(builder) {
          builder.onResolve(
            {
              filter:
                /^(server-only|map-data-test-state|@\/lib\/internalDataApiClient|@\/lib\/crawlLatestCurrent|@\/lib\/prisma|@\/lib\/finalizedResortGeojson|@\/lib\/resortMapMerge|\.\/canonicalCodec|\.\/canonicalDocuments)$/,
            },
            args => ({ path: args.path, namespace: "map-data-test" }),
          );
          builder.onLoad(
            { filter: /.*/, namespace: "map-data-test" },
            args => ({
              loader: "js",
              contents:
                args.path === "server-only"
                  ? "export {};"
                  : args.path === "map-data-test-state"
                    ? `
                      export const fetchCalls = [];
                      export const currentReads = [];
                      let responseData = null;
                      let responseError = null;
                      export function resetTestData() {
                        fetchCalls.length = 0;
                        currentReads.length = 0;
                        responseData = null;
                        responseError = null;
                      }
                      export function setResponse(data) { responseData = data; }
                      export function setError(error) { responseError = error; }
                      export function usesRemoteDataApi() { return true; }
                      export async function fetchInternalDataApi(path) {
                        fetchCalls.push(path);
                        if (responseError) throw responseError;
                        return Response.json(responseData);
                      }
                      export class InternalDataApiError extends Error {
                        constructor(message, status) { super(message); this.status = status; }
                      }
                      export async function readCurrentCrawlLatestStatus(resortId, kind) {
                        currentReads.push([resortId, kind]);
                        return null;
                      }
                    `
                    : args.path === "@/lib/internalDataApiClient"
                      ? `
                        import { fetchInternalDataApi as fetch, usesRemoteDataApi as remote } from 'map-data-test-state';
                        export const fetchInternalDataApi = fetch;
                        export const usesRemoteDataApi = remote;
                        export class InternalDataApiError extends Error {
                          constructor(message, status) { super(message); this.status = status; }
                        }
                      `
                      : args.path === "@/lib/crawlLatestCurrent"
                        ? `
                          import { currentReads } from 'map-data-test-state';
                          export async function readCurrentCrawlLatestStatus(resortId, kind) {
                            currentReads.push([resortId, kind]);
                            return null;
                          }
                        `
                        : args.path === "@/lib/finalizedResortGeojson"
                          ? "export const normalizeCourseFeature = () => null; export const normalizeLiftFeature = () => null;"
                          : args.path === "@/lib/resortMapMerge"
                            ? "export const adjustCourseName = name => name;"
                            : args.path === "./canonicalCodec"
                              ? "export const entityFeature = row => row; export const record = value => value;"
                              : args.path === "./canonicalDocuments"
                                ? "export const canonicalMapsEnabled = async () => true;"
                                : args.path === "@/lib/prisma"
                                  ? "export const prisma = {};"
                                  : "export {};",
            }),
          );
        },
      },
    ],
  });

  const api = await import(pathToFileURL(bundlePath).href);
  const staleMap = (): FinalizedResortMapData =>
    ({
      courseStatusSummary: {
        total: 1,
        open: 1,
        partial: 0,
        closed: 0,
        unknown: 0,
        observedAt: "2026-04-30T08:00:00Z",
        sourceUrls: ["https://old.example/courses"],
        updates: ["Apr 30 old update"],
      },
      courses: {
        source: "slope_10m",
        baseSource: "slope_before",
        fileName: "sample.geojson",
        observedAt: "2026-04-30T08:00:00Z",
        sourceUrls: ["https://old.example/courses"],
        features: [
          {
            id: "course-a",
            name: "Course A",
            displayName: "Course A",
            groupId: "course-a",
            sectionName: null,
            latestStatusName: "Apr 30 old status",
            statusSnapshotId: "apr-30",
            statusMappingNames: ["Course A"],
            sourceUrls: ["https://old.example/courses"],
            coordinates: [
              [140, 43, 800],
              [140.001, 43.001, 700],
            ],
            properties: {
              name: "Course A",
              level: null,
              piste: null,
              snowboard: null,
              status: "○",
              update: "Apr 30 old update",
              latestNote: "Apr 30 old note",
              horizontalDistMap: null,
              slopeDistMap: null,
              elevationDiffMap: null,
              avgSlopeDegMap: null,
              maxSlopeDegMap: null,
              maxWidth: null,
              minWidth: null,
              note: null,
              image: null,
              searchWord: null,
              morning: null,
              night: null,
            },
          },
        ],
      },
      lifts: null,
    }) as FinalizedResortMapData;

  await t.test(
    "current API marker makes one request and no current-status reads",
    async () => {
      api.resetTestData();
      const data = staleMap();
      const section = data.courses;
      assert.ok(section);
      const feature = section.features[0];
      assert.ok(feature);
      feature.properties.status = "△";
      section.observedAt = "2026-11-03T00:00:00Z";
      section.sourceUrls = ["https://current.example/courses"];
      api.setResponse({
        enabled: true,
        operationDataVersion: api.CURRENT_MAP_OPERATION_VERSION,
        revision: "map-state-v1",
        data,
      });

      const result = await api.readCanonicalResortMap("sample");

      assert.deepEqual(api.fetchCalls, [
        "/api/admin/maps/resorts?resortId=sample",
      ]);
      assert.deepEqual(api.currentReads, []);
      assert.equal(result.revision, "map-state-v1");
      assert.equal(result.data.courses.features[0].properties.status, "△");
      assert.equal(result.data.courses.observedAt, "2026-11-03T00:00:00Z");
    },
  );

  await t.test(
    "unversioned API responses are rejected instead of using compatibility reads",
    async () => {
      api.resetTestData();
      api.setResponse({ enabled: true, data: staleMap() });

      await assert.rejects(
        api.readCanonicalResortMap("sample"),
        /Remote canonical map API version is incompatible/u,
      );

      assert.deepEqual(api.fetchCalls, [
        "/api/admin/maps/resorts?resortId=sample",
      ]);
      assert.deepEqual(api.currentReads, []);
    },
  );

  await t.test(
    "canonical responses without a revision are rejected",
    async () => {
      api.resetTestData();
      api.setResponse({
        enabled: true,
        operationDataVersion: api.CURRENT_MAP_OPERATION_VERSION,
        data: staleMap(),
      });

      await assert.rejects(
        api.readCanonicalResortMap("sample"),
        /Remote canonical map API version is incompatible/u,
      );
    },
  );

  await t.test("missing remote route errors are propagated", async () => {
    api.resetTestData();
    api.setError(new Error("Not found"));

    await assert.rejects(api.readCanonicalResortMap("sample"), /Not found/u);

    assert.deepEqual(api.fetchCalls, [
      "/api/admin/maps/resorts?resortId=sample",
    ]);
    assert.deepEqual(api.currentReads, []);
  });

  await t.test(
    "revision view returns current source version tokens",
    async () => {
      api.resetTestData();
      api.setResponse({ enabled: true, revision: "map-state-v1" });

      const result = await api.readCanonicalResortMapRevision("sample");

      assert.deepEqual(result, { enabled: true, revision: "map-state-v1" });
      assert.deepEqual(api.fetchCalls, [
        "/api/admin/maps/resorts?resortId=sample&view=revision",
      ]);
    },
  );

  await t.test(
    "disabled canonical maps keep the local data owner fallback",
    async () => {
      api.resetTestData();
      api.setResponse({ enabled: false, data: null });

      const result = await api.readCanonicalResortMap("sample");

      assert.deepEqual(result, { enabled: false, data: null });
    },
  );
});
