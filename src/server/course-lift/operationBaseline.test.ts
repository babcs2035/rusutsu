import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";

const testRoot = path.resolve(
  "src/private/data/resorts-temporary/tmp/operation-baseline-helper-tests",
);

test("operation baseline uses only name-reference fields and capability listing modes", async t => {
  await fs.mkdir(testRoot, { recursive: true });
  const bundlePath = path.join(testRoot, "operation-baseline.mjs");
  await build({
    stdin: {
      contents: `
        export { readOperationBaseline } from '@/server/course-lift/operationBaseline';
        export { baselineState, resetBaselineState } from 'operation-baseline-helper-state';
      `,
      resolveDir: process.cwd(),
      sourcefile: "operation-baseline-helper-test.ts",
      loader: "ts",
    },
    outfile: bundlePath,
    platform: "node",
    format: "esm",
    bundle: true,
    packages: "external",
    plugins: [
      {
        name: "operation-baseline-helper-stubs",
        setup(builder) {
          builder.onResolve(
            {
              filter:
                /^(server-only|operation-baseline-helper-state|@[/]features[/]latest-status-mapping[/]server[/]capabilityFiles|@[/]lib[/]prisma|.[/]canonicalDocuments)$/,
            },
            args => ({
              path: args.path,
              namespace: "operation-baseline-helper",
            }),
          );
          builder.onLoad(
            { filter: /.*/, namespace: "operation-baseline-helper" },
            args => ({
              loader: "js",
              contents:
                args.path === "server-only"
                  ? "export {};"
                  : args.path === "operation-baseline-helper-state"
                    ? `
                      export const baselineState = {
                        enabled: true,
                        calls: [],
                        courses: [],
                        lifts: [],
                        capability: null,
                      };
                      export function resetBaselineState() {
                        baselineState.enabled = true;
                        baselineState.calls.length = 0;
                        baselineState.courses = [];
                        baselineState.lifts = [];
                        baselineState.capability = null;
                      }
                    `
                    : args.path === "@/lib/prisma"
                      ? `
                        import { baselineState } from 'operation-baseline-helper-state';
                        const findMany = kind => async options => {
                          baselineState.calls.push([kind, options]);
                          return kind === 'courses' ? baselineState.courses : baselineState.lifts;
                        };
                        export const prisma = {
                          mapCourse: { findMany: findMany('courses') },
                          mapLift: { findMany: findMany('lifts') },
                        };
                      `
                      : args.path === "./canonicalDocuments"
                        ? `
                          import { baselineState } from 'operation-baseline-helper-state';
                          export async function canonicalMapsEnabled() { return baselineState.enabled; }
                        `
                        : `
                          import { baselineState } from 'operation-baseline-helper-state';
                          export async function readCapabilityFile() { return baselineState.capability; }
                        `,
            }),
          );
        },
      },
    ],
  });

  const api = await import(pathToFileURL(bundlePath).href);

  await t.test(
    "disabled schema returns only enabled false and performs no reads",
    async () => {
      api.resetBaselineState();
      api.baselineState.enabled = false;
      assert.deepEqual(await api.readOperationBaseline("sample"), {
        enabled: false,
      });
      assert.deepEqual(api.baselineState.calls, []);
    },
  );

  await t.test(
    "enabled schema queries only IDs and name-reference fields",
    async () => {
      api.resetBaselineState();
      api.baselineState.courses = [
        {
          id: "course-1",
          crawledNames: ["Mapped course"],
          mappingAssigned: true,
        },
      ];
      api.baselineState.lifts = [
        { id: "lift-1", crawledNames: ["Mapped lift"], mappingAssigned: false },
      ];
      api.baselineState.capability = {
        courses: { listingMode: "operating-only" },
        lifts: { listingMode: "complete" },
      };

      const result = await api.readOperationBaseline("sample-resort");

      assert.deepEqual(result, {
        enabled: true,
        courses: {
          rows: api.baselineState.courses,
          listingMode: "operating-only",
        },
        lifts: { rows: api.baselineState.lifts, listingMode: "complete" },
      });
      assert.deepEqual(
        api.baselineState.calls.map(([kind, options]: [string, unknown]) => [
          kind,
          options,
        ]),
        [
          [
            "courses",
            {
              where: {
                resortId: "sample-resort",
                archivedAt: null,
                geometryType: "LineString",
              },
              select: { id: true, crawledNames: true, mappingAssigned: true },
            },
          ],
          [
            "lifts",
            {
              where: {
                resortId: "sample-resort",
                archivedAt: null,
                geometryType: "LineString",
              },
              select: { id: true, crawledNames: true, mappingAssigned: true },
            },
          ],
        ],
      );
      const serialized = JSON.stringify(result);
      assert.doesNotMatch(
        serialized,
        /coordinate|geometry|status|snapshot|history/iu,
      );
    },
  );

  await t.test(
    "missing capability defaults each listing to complete",
    async () => {
      api.resetBaselineState();
      const result = await api.readOperationBaseline("sample-resort");
      assert.equal(result.courses.listingMode, "complete");
      assert.equal(result.lifts.listingMode, "complete");
    },
  );
});
