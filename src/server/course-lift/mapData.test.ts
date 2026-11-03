import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
import type { FinalizedResortMapData } from "@/lib/finalizedResortGeojsonShared";

const testRoot = path.resolve(
  "src/private/data/resorts-temporary/tmp/map-data-read-tests",
);

test("remote canonical map reads use version marker to avoid duplicate current fetches", async t => {
  await fs.mkdir(testRoot, { recursive: true });
  const bundlePath = path.join(testRoot, "map-data-read.mjs");
  await build({
    stdin: {
      contents: `
        export { readCanonicalResortMap } from '@/server/course-lift/mapData';
          export { CURRENT_MAP_OPERATION_VERSION } from '@/lib/currentMapOperations';
        export { resetTestData, fetchCalls, currentReads, setResponse } from 'map-data-test-state';
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
                      export function resetTestData() {
                        fetchCalls.length = 0;
                        currentReads.length = 0;
                        responseData = null;
                      }
                      export function setResponse(data) { responseData = data; }
                      export function usesRemoteDataApi() { return true; }
                      export async function fetchInternalDataApi(path) {
                        fetchCalls.push(path);
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
        data,
      });

      const result = await api.readCanonicalResortMap("sample");

      assert.deepEqual(api.fetchCalls, [
        "/api/internal/v1/resort-map?resortId=sample",
      ]);
      assert.deepEqual(api.currentReads, []);
      assert.equal(result.data.courses.features[0].properties.status, "△");
      assert.equal(result.data.courses.observedAt, "2026-11-03T00:00:00Z");
    },
  );

  await t.test(
    "unversioned API falls back to current data and clears stale map operations",
    async () => {
      api.resetTestData();
      api.setResponse({ enabled: true, data: staleMap() });

      const result = await api.readCanonicalResortMap("sample");

      assert.deepEqual(api.fetchCalls, [
        "/api/internal/v1/resort-map?resortId=sample",
      ]);
      assert.deepEqual(api.currentReads, [
        ["sample", "courses"],
        ["sample", "lifts"],
      ]);
      assert.equal(result.data.courses.observedAt, null);
      assert.deepEqual(result.data.courses.sourceUrls, []);
      assert.deepEqual(result.data.courseStatusSummary, {
        total: 1,
        open: 0,
        partial: 0,
        closed: 0,
        unknown: 1,
        observedAt: null,
        sourceUrls: [],
        updates: [],
        sourceLabels: undefined,
      });
      const course = result.data.courses.features[0];
      assert.equal(course.properties.status, null);
      assert.equal(course.properties.update, null);
      assert.equal(course.properties.latestNote, null);
      assert.equal(course.latestStatusName, null);
      assert.equal(course.statusSnapshotId, null);
      assert.deepEqual(course.sourceUrls, []);
      assert.deepEqual(course.coordinates, [
        [140, 43, 800],
        [140.001, 43.001, 700],
      ]);
    },
  );
});
